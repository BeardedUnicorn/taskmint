#!/usr/bin/env node
// The built extension (dist/background.js) against a running TaskMint
// server, as Chrome would run it but with chrome.* stood in: a capture
// reaches the account, live, where the web app takes it; a revoked token
// shows as refused and pauses the retries; a new token in the options
// delivers what was queued. scripts/verify.sh runs it on its throwaway
// stack. By hand, on a stack whose admin's data doesn't matter:
//
//   pnpm --filter @taskmint/extension build
//   TASKMINT_URL=http://localhost:18080 ADMIN_USERNAME=… ADMIN_PASSWORD=… node apps/extension/live-check.mjs
//
// It cleans up after itself: its tokens are revoked and the admin signs out.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const setting = name => process.env[name] || fail(`set ${name} (see this file's comments)`);
const base = new URL(setting('TASKMINT_URL')).origin;
const TIMEOUT_MS = 10_000;

function fail(message) {
  throw new Error(message);
}

function ok(message) {
  console.log(`ok - ${message}`);
}

/** Waits up to TIMEOUT_MS for `check` to be true. */
async function until(what, check) {
  const end = Date.now() + TIMEOUT_MS;
  while (!(await check())) {
    if (Date.now() > end) fail(`timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/** The admin's browser session: a cookie, and the CSRF token its changes need. */
async function signIn() {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ username: setting('ADMIN_USERNAME'), password: setting('ADMIN_PASSWORD') }),
  });
  if (res.status !== 200) fail(`signing in: ${res.status}`);
  const cookie = res.headers.getSetCookie().map(header => header.split(';')[0]).join('; ');
  const { csrfToken } = await res.json();
  return async (method, path, body) => {
    const reply = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base,
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': csrfToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!reply.ok) fail(`${method} ${path}: ${reply.status}`);
    return reply.status === 204 ? null : reply.json();
  };
}

/**
 * The events a bearer token's stream sends, by name, as they come. A stream
 * the server ends (revoking any of the account's tokens ends them all) is
 * opened again, as the web app does.
 */
async function follow(token) {
  const names = [];
  const open = async () => {
    const res = await fetch(`${base}/api/v1/events`, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) fail(`GET /events: ${res.status}`);
    return res.body;
  };
  let body = await open();
  (async () => {
    for (;;) {
      let buffer = '';
      for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
        const lines = (buffer + chunk).split('\n');
        // The last line may be cut short: it waits for the next chunk
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event:')) names.push(line.slice(6).trim());
        }
      }
      body = await open();
    }
  })().catch(() => {});
  return names;
}

/** The built service worker, in a context of its own, with chrome.* in memory. */
function startExtension(target) {
  const listeners = {};
  const event = name => ({ addListener: listener => (listeners[name] = listener) });
  const area = () => {
    const data = {};
    return {
      data,
      get: async keys => Object.fromEntries([keys].flat().filter(key => key in data).map(key => [key, data[key]])),
      set: async items => void Object.assign(data, items),
      remove: async keys => [keys].flat().forEach(key => delete data[key]),
    };
  };
  const badge = {};
  const alarms = new Set();
  const chrome = {
    action: {
      setBadgeText: async ({ text }) => void (badge.text = text),
      setBadgeBackgroundColor: async () => {},
      setTitle: async ({ title }) => void (badge.title = title),
      onClicked: event('clicked'),
    },
    alarms: {
      create: async name => void alarms.add(name),
      clear: async name => alarms.delete(name),
      onAlarm: event('alarm'),
    },
    runtime: { onMessage: event('message'), onStartup: event('startup'), onInstalled: event('installed') },
    storage: { local: area(), session: area(), onChanged: event('changed') },
    tabs: {},
  };
  chrome.storage.local.data.target = target;
  const context = vm.createContext({ chrome, fetch, crypto, TextEncoder, Blob, Response, CompressionStream, btoa, setTimeout, console });
  const dist = new URL('dist/', import.meta.url);
  vm.runInContext(readFileSync(new URL('background.js', dist), 'utf8'), context, { filename: 'background.js' });
  return {
    badge,
    alarms,
    local: chrome.storage.local.data,
    capture: payloadText =>
      listeners.message({ type: 'worklog-payload', payloadText }, { url: 'https://app.dataannotation.tech/workers/payments', tab: { id: 1 } }),
    setTarget: next => {
      chrome.storage.local.data.target = next;
      listeners.changed({ target: { newValue: next } }, 'local');
    },
  };
}

const admin = await signIn();
const tokens = [];
async function token(name, scope) {
  const made = await admin('POST', '/tokens', { name, scope });
  tokens.push(made.id);
  return made;
}

try {
  // The web app's side: an account's events, and taking a capture as it does
  const web = await token('live-check web app', 'full');
  const events = await follow(web.token);
  const take = async () => {
    const res = await fetch(`${base}/api/v1/commands/take_pending_work_log_capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${web.token}` },
    });
    return res.json();
  };
  const captured = () => events.filter(name => name === 'work-log-payload-captured').length;

  const first = await token('live-check extension', 'capture');
  const extension = startExtension({ kind: 'server', url: base, token: first.token });
  const payload = JSON.stringify({ workLogs: [], timedWorkEntries: [], liveCheck: Date.now() });
  extension.capture(payload);
  await until('the delivered badge', () => extension.badge.text === '✓');
  if (extension.badge.title !== 'TaskMint capture: delivered to the TaskMint server') fail(`badge: ${extension.badge.title}`);
  await until('work-log-payload-captured', () => captured() === 1);
  const taken = await take();
  if (taken?.payload !== payload || taken.source !== 'extension') fail(`taken: ${JSON.stringify(taken)}`);
  ok('a capture from the built extension reached the account live, and the web app took it');

  await admin('DELETE', `/tokens/${first.id}`);
  extension.capture(payload.replace('liveCheck', 'afterRevoke'));
  await until('the refused badge', () => extension.badge.text === '✕');
  if (!extension.local.tokenRejected || !extension.local.pendingCapture) fail('the refused capture was not kept');
  if (extension.alarms.has('taskmint-retry-delivery')) fail('retries kept going with a refused token');
  ok('a revoked token shows as refused, keeps the capture, and pauses the retries');

  const second = await token('live-check extension 2', 'capture');
  extension.setTarget({ kind: 'server', url: base, token: second.token });
  await until('the queued capture, with the new token', () => extension.badge.text === '✓' && captured() === 2);
  if (extension.local.pendingCapture || extension.local.tokenRejected) fail('the queue was not cleared');
  if (!(await take())?.payload.includes('afterRevoke')) fail('the queued capture was not the one taken');
  ok('a new token in the options delivers what was queued');
  console.log('Extension live check passed.');
} finally {
  for (const id of tokens) await admin('DELETE', `/tokens/${id}`).catch(() => {});
  await admin('POST', '/auth/logout').catch(() => {});
}
process.exit(0);
