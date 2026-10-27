#!/usr/bin/env node
// The running stack, end to end, through the web app's nginx as a browser
// and the browser extension reach it: the admin invites a new user, who
// signs up, makes tokens, tracks time and gets a capture, while an event
// stream reports each change. It cleans up after itself: the tokens are
// revoked, and the new user is signed out and then disabled.
//
//   docker compose up --build -d --wait
//   node scripts/smoke.mjs
//
// Settings come from the environment, else from .env (as compose reads it):
//   TASKMINT_URL                     the web app; default PUBLIC_ORIGIN, else
//                                    http://localhost:${WEB_PORT:-8080}
//   ADMIN_USERNAME, ADMIN_PASSWORD   an admin's sign-in (the bootstrap admin)
//
// No dependencies: Node 22 or later.

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STEP_TIMEOUT_MS = 10_000;
// As the contracts name them (packages/contracts)
const CAPTURE_HEADER = 'X-TaskMint-Capture';
const TIME_ZONE_HEADER = 'X-TaskMint-TZ';

const settings = readSettings();
const base = new URL(settings.TASKMINT_URL ?? settings.PUBLIC_ORIGIN ?? `http://localhost:${settings.WEB_PORT ?? '8080'}`);
const origin = base.origin;

function readSettings() {
  const fromFile = {};
  try {
    const text = readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
    for (const line of text.split('\n')) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) fromFile[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const pick = name => process.env[name] || fromFile[name] || undefined;
  return Object.fromEntries(
    ['TASKMINT_URL', 'PUBLIC_ORIGIN', 'WEB_PORT', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'].map(name => [name, pick(name)])
  );
}

function fail(message) {
  throw new Error(message);
}

/** Without the secrets: link tokens in paths, and tokens in replies. */
function redact(text) {
  return text
    .replace(/\/(invites|password-resets)\/[^/\s]+/g, '/$1/…')
    .replace(/"(token|csrfToken)":"[^"]*"/g, '"$1":"…"');
}

function ok(message) {
  console.log(`ok - ${message}`);
}

/** A caller of the API: a browser's cookie session, or a bearer token. */
class Client {
  constructor({ cookie, csrfToken, token } = {}) {
    this.cookie = cookie;
    this.csrfToken = csrfToken;
    this.token = token;
  }

  async request(method, path, body, headers = {}) {
    const res = await fetch(new URL(`/api/v1${path}`, base), {
      method,
      headers: {
        Accept: 'application/json',
        [TIME_ZONE_HEADER]: 'UTC',
        // What a browser on the web app sends
        ...(this.cookie ? { Cookie: this.cookie, Origin: origin, 'Sec-Fetch-Site': 'same-origin' } : {}),
        ...(this.cookie && this.csrfToken && method !== 'GET' ? { 'X-CSRF-Token': this.csrfToken } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  /** A request that must answer `status`; returns the JSON reply. */
  async expect(status, method, path, body, headers) {
    const res = await this.request(method, path, body, headers);
    if (res.status !== status) {
      fail(redact(`${method} ${path}: expected ${status}, got ${res.status} ${res.text.slice(0, 300)}`));
    }
    return res;
  }

  async call(command, args = {}) {
    return (await this.expect(200, 'POST', `/commands/${command}`, args)).json;
  }

  /** Signs in from a `{user, csrfToken}` reply and its session cookie. */
  static fromSession(res) {
    const cookie = res.headers
      .getSetCookie()
      .map(header => header.split(';')[0])
      .join('; ');
    if (!cookie || !res.json?.csrfToken) fail('signing in set no session cookie or CSRF token');
    return Object.assign(new Client({ cookie, csrfToken: res.json.csrfToken }), { user: res.json.user });
  }
}

/** The account's event stream, read as it arrives. */
class EventStream {
  constructor(token) {
    this.token = token;
    this.events = [];
    this.waiters = [];
    this.closed = false;
    this.abort = new AbortController();
  }

  /** Resolves once the server has subscribed the stream (its headers came). */
  async open() {
    const res = await fetch(new URL('/api/v1/events', base), {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${this.token}` },
      signal: this.abort.signal,
    });
    if (res.status !== 200) fail(`GET /events: expected 200, got ${res.status} ${await res.text()}`);
    if (!res.headers.get('content-type')?.startsWith('text/event-stream')) fail('GET /events is not an event stream');
    this.reading = this.read(res.body).catch(error => {
      if (error.name !== 'AbortError') throw error;
    });
  }

  async read(body) {
    let buffer = '';
    let name = 'message';
    let data = [];
    for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (line === '') {
          if (data.length) this.push({ name, data: JSON.parse(data.join('\n')) });
          name = 'message';
          data = [];
        } else if (line.startsWith('event:')) {
          name = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
        // ":" lines are the keep-alive
      }
    }
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter.check();
  }

  push(event) {
    this.events.push(event);
    for (const waiter of [...this.waiters]) waiter.check();
  }

  /** The next event named `name` (earlier ones of other names are skipped). */
  next(name) {
    return new Promise((resolve, reject) => {
      const waiter = {
        check: () => {
          const index = this.events.findIndex(event => event.name === name);
          if (index >= 0) {
            const [event] = this.events.splice(0, index + 1).slice(-1);
            done();
            resolve(event.data);
          } else if (this.closed) {
            done();
            reject(new Error(`the event stream closed before ${name}`));
          }
        },
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`no ${name} event within ${STEP_TIMEOUT_MS / 1000}s`));
      }, STEP_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
      };
      this.waiters.push(waiter);
      waiter.check();
    });
  }

  /** Resolves when the server ends the stream. */
  async ended() {
    const timeout = AbortSignal.timeout(STEP_TIMEOUT_MS);
    await Promise.race([
      this.reading,
      new Promise((_, reject) =>
        timeout.addEventListener('abort', () => reject(new Error('the event stream stayed open')))
      ),
    ]);
    if (!this.closed) fail('the event stream stayed open');
  }

  close() {
    this.abort.abort();
  }
}

async function checkWebApp() {
  const health = await fetch(new URL('/healthz', base), { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
  if (health.status !== 200) fail(`GET /healthz: ${health.status}`);
  const meta = await new Client().expect(200, 'GET', '/meta');
  // One copy of each header, though both nginx and the server set it
  if (meta.headers.get('x-content-type-options') !== 'nosniff') {
    fail(`the API's X-Content-Type-Options: ${meta.headers.get('x-content-type-options')}`);
  }
  ok(`${origin} answers: TaskMint server ${meta.json.version}, API ${meta.json.apiVersion}`);

  // The app's own pages are the app, with its security headers
  const page = await fetch(new URL('/invite/not-a-token', base), { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
  const html = await page.text();
  if (page.status !== 200 || !html.includes('<div id="root">')) fail(`GET /invite/…: ${page.status}, not the app`);
  for (const header of [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'x-frame-options',
    'permissions-policy',
  ]) {
    if (!page.headers.get(header)) fail(`the app is served without ${header}`);
  }
  if (page.headers.get('server')?.match(/\d/)) fail(`nginx names its version: ${page.headers.get('server')}`);
  ok('the app is served with its security headers');
}

async function signInAdmin() {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = settings;
  if (!username || !password) {
    fail('set ADMIN_USERNAME and ADMIN_PASSWORD (in the environment or .env) to an admin of this stack');
  }
  const res = await new Client().expect(200, 'POST', '/auth/login', { username, password });
  const admin = Client.fromSession(res);
  if (admin.user.role !== 'admin') fail(`${username} is not an admin`);
  ok(`signed in as the admin ${username}`);
  return admin;
}

async function inviteUser(admin) {
  const invite = (await admin.expect(201, 'POST', '/admin/invites', { role: 'user', note: 'smoke test' })).json;
  if (!invite.url.startsWith(`${origin}/invite/`)) {
    fail(`the invite link ${invite.url.split('/invite/')[0]}/… isn't on ${origin}: check PUBLIC_ORIGIN`);
  }
  const token = invite.url.slice(`${origin}/invite/`.length);
  const anonymous = new Client();
  await anonymous.expect(200, 'GET', `/invites/${token}`);
  const username = `smoke-${Date.now().toString(36)}`;
  const res = await anonymous.expect(200, 'POST', `/invites/${token}/accept`, {
    username,
    password: randomBytes(18).toString('base64url'),
    displayName: 'Smoke test',
  });
  const user = Client.fromSession(res);
  await anonymous.expect(404, 'GET', `/invites/${token}`);
  ok(`${username} accepted an invite and is signed in (the link is used up)`);
  return user;
}

async function makeToken(user, scope) {
  const made = (await user.expect(201, 'POST', '/tokens', { name: `smoke ${scope}`, scope })).json;
  if (!made.token?.startsWith('tmk_')) fail(`the new ${scope} token has no secret`);
  return made;
}

async function trackTime(user, stream) {
  const task = { id: `smoke-${Date.now()}`, name: 'Smoke test', createdAt: new Date().toISOString() };
  task.updatedAt = task.createdAt;
  const saved = await user.call('set_app_record', { key: 'predefinedTasks', value: [task], baseRevision: 0 });
  const changed = await stream.next('app-records-changed');
  if (changed.key !== 'predefinedTasks' || changed.revision !== saved.revision) {
    fail(`app-records-changed said ${JSON.stringify(changed)}, the save ${JSON.stringify(saved)}`);
  }
  ok('a saved task reached the event stream');

  const started = await user.call('start_task', { taskId: task.id, taskName: task.name });
  if (started.outcome !== 'started') fail(`start_task: ${JSON.stringify(started)}`);
  await stream.next('timer-instance-started');
  const sessions = await user.call('get_sessions');
  const running = sessions.flatMap(session => session.timerInstances).find(instance => instance.isRunning);
  if (sessions.length !== 1 || running?.id !== started.instanceId) fail(`get_sessions: ${JSON.stringify(sessions)}`);
  ok('a timer started, and the stream said so');

  await user.call('stop_live_timer');
  await stream.next('timer-instance-stopped');
  const [after] = await user.call('get_sessions');
  if (after.timerInstances.some(instance => instance.isRunning)) fail('the timer is still running');
  ok('the timer stopped, and the stream said so');

  // A stale save is refused, not written over the newer one
  const stale = await user.request('POST', '/commands/set_app_record', {
    key: 'predefinedTasks',
    value: [],
    baseRevision: 0,
  });
  if (stale.status !== 409 || stale.json?.code !== 'conflict') fail(`a stale save: ${stale.status} ${stale.text}`);
  ok('a save based on an old revision is refused');
  return task;
}

async function capture(user, stream, captureToken, fullToken) {
  const extension = new Client({ token: captureToken });
  await extension.expect(200, 'GET', '/capture/ping', undefined, { [CAPTURE_HEADER]: '1' });
  const payload = JSON.stringify({ workLogs: [], timedWorkEntries: [] });
  const res = await fetch(new URL('/api/v1/capture', base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${captureToken}`, [CAPTURE_HEADER]: '1', 'Content-Type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
  });
  if (res.status !== 200) fail(`POST /capture: ${res.status} ${await res.text()}`);
  await stream.next('work-log-payload-captured');
  const taken = await new Client({ token: fullToken }).call('take_pending_work_log_capture');
  if (taken?.payload !== payload || taken.source !== 'extension') fail(`the capture taken: ${JSON.stringify(taken)}`);
  ok('a capture with the capture token reached the stream, and was taken');

  // A capture token is for captures only
  await extension.expect(403, 'POST', '/commands/get_sessions', {});
  await user.expect(200, 'GET', '/auth/me');
  ok('the capture token is refused for commands');
}

async function checkIsolation(admin, task) {
  const theirs = await admin.call('get_sessions');
  if (theirs.some(session => session.taskId === task.id)) fail("the admin sees the new user's session");
  ok("the admin's data doesn't include the new user's");
}

async function cleanUp(admin, user, stream, tokens) {
  for (const token of tokens) await user.expect(204, 'DELETE', `/tokens/${token.id}`);
  // Revoking a token ends the account's streams
  await stream.ended();
  await new Client({ token: tokens[0].token }).expect(401, 'GET', '/auth/me');
  ok('revoking the tokens ended the stream, and the tokens no longer work');

  await user.expect(204, 'POST', '/auth/logout');
  await user.expect(401, 'GET', '/auth/me');
  const disabled = (await admin.expect(200, 'PATCH', `/admin/users/${user.user.id}`, { disabled: true })).json;
  if (!disabled.disabledAt) fail(`disabling ${user.user.username}: ${JSON.stringify(disabled)}`);
  await admin.expect(204, 'POST', '/auth/logout');
  ok(`${user.user.username} is signed out and disabled; the admin signed out`);
}

async function main() {
  console.log(`Smoke test of ${origin}`);
  await checkWebApp();
  const admin = await signInAdmin();
  const user = await inviteUser(admin);
  const full = await makeToken(user, 'full');
  const captureToken = await makeToken(user, 'capture');
  const stream = new EventStream(full.token);
  await stream.open();
  ok('an event stream is open with the full token');
  try {
    const task = await trackTime(user, stream);
    await capture(user, stream, captureToken.token, full.token);
    await checkIsolation(admin, task);
    await cleanUp(admin, user, stream, [full, captureToken]);
  } finally {
    stream.close();
  }
  console.log('Smoke test passed.');
}

main().catch(error => {
  console.error(`not ok - ${error.message}`);
  process.exitCode = 1;
});
