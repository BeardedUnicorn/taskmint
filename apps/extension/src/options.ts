// The options page (options.html): where captures go, the desktop app or a
// TaskMint server and its token. Saving a server asks for permission to
// reach it, which Chrome grants only in answer to the click: so each handler
// asks before anything it awaits.

import { pingServer, TokenRejected } from './delivery/server';
import {
  DESKTOP,
  loadTarget,
  originPattern,
  saveTarget,
  sendsInTheClear,
  serverUrl,
  TOKEN_REJECTED,
  type Target,
} from './target';

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const form = byId<HTMLFormElement>('target');
const server = byId<HTMLFieldSetElement>('server');
const url = byId<HTMLInputElement>('url');
const token = byId<HTMLInputElement>('token');
const test = byId<HTMLButtonElement>('test');
const status = byId<HTMLParagraphElement>('status');

function say(text: string, problem = false) {
  status.textContent = text;
  status.classList.toggle('problem', problem);
}

function chosenKind(): string {
  return (form.elements.namedItem('kind') as RadioNodeList).value;
}

function showKind() {
  server.disabled = chosenKind() !== 'server';
}

/** The server fields, checked; null (and a message) when they aren't usable. */
function typedServer(): { url: string; token: string } | null {
  const address = serverUrl(url.value);
  if (!address) {
    say('The address starts with http:// or https://, like https://taskmint.example.com.', true);
    return null;
  }
  if (sendsInTheClear(address)) {
    say('http:// would send the token unencrypted. Use https://, or http:// only for this computer (localhost).', true);
    return null;
  }
  if (!token.value.trim()) {
    say('Paste a token from the web app (Settings → API tokens).', true);
    return null;
  }
  return { url: address, token: token.value.trim() };
}

/** Asks for the host permission `to` needs; says so when it's refused. */
async function allowed(to: { url: string }): Promise<boolean> {
  const granted = await chrome.permissions.request({ origins: [originPattern(to.url)] });
  if (!granted) say(`TaskMint can't reach ${to.url} without that permission.`, true);
  return granted;
}

function problem(error: unknown, to: { url: string }): string {
  if (error instanceof TokenRejected) return `The server refused the token: ${error.message}.`;
  return `Can't reach ${to.url}: ${error instanceof Error ? error.message : String(error)}.`;
}

async function runTest() {
  const typed = typedServer();
  if (!typed || !(await allowed(typed))) return;
  say('Testing…');
  try {
    const { username, version } = await pingServer(typed);
    say(`It works: captures go to ${username}'s account on TaskMint ${version}.`);
  } catch (error) {
    say(problem(error, typed), true);
  }
}

async function save() {
  let target: Target = DESKTOP;
  if (chosenKind() === 'server') {
    const typed = typedServer();
    if (!typed || !(await allowed(typed))) return;
    target = { kind: 'server', ...typed };
  }
  const previous = await loadTarget();
  await saveTarget(target);
  // A server no longer used needn't stay reachable
  if (previous.kind === 'server' && (target.kind !== 'server' || originPattern(previous.url) !== originPattern(target.url))) {
    await chrome.permissions.remove({ origins: [originPattern(previous.url)] });
  }
  say(target.kind === 'server' ? `Saved: captures go to ${target.url}.` : 'Saved: captures go to the TaskMint app on this computer.');
}

/** The saved choice, and whether the server last refused its token. */
async function show() {
  const target = await loadTarget();
  (form.elements.namedItem('kind') as RadioNodeList).value = target.kind;
  if (target.kind === 'server') {
    url.value = target.url;
    token.value = target.token;
  }
  showKind();
  const { [TOKEN_REJECTED]: rejected } = await chrome.storage.local.get(TOKEN_REJECTED);
  if (rejected) say('The server refused the token: set a new one, then save.', true);
}

form.addEventListener('change', showKind);
test.addEventListener('click', () => void runTest());
form.addEventListener('submit', event => {
  event.preventDefault();
  void save();
});

export const ready = show();
