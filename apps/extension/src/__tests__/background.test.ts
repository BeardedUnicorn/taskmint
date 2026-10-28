import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE } from '@taskmint/contracts';
import { badge, installChromeFake, type ChromeFake } from './chromeFake';

type Worker = typeof import('../background');

const ENDPOINT = `http://127.0.0.1:${CAPTURE.SERVER_PORT}${CAPTURE.PATH}`;
const PAYLOAD = '{"workLogs":[{"id":"w1","minutes":30}]}';
const SITE_TAB = 5;

let chrome: ChromeFake;
let worker: Worker;
const fetchMock = vi.fn<typeof fetch>();

/** The service worker, started on `chrome` (its listeners register on import). */
async function start(): Promise<Worker> {
  vi.resetModules();
  worker = await import('../background');
  return worker;
}

function taskMintUp() {
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
}

function taskMintDown() {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
}

/** What a taskmint://import-worklogs link carries, decompressed. */
async function linkPayload(url: string): Promise<string> {
  const encoded = new URL(url).searchParams.get('d')!;
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Only the worker's waits are faked: hashing and compression run for real. */
function fakeWaits() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

/** Moves the fake clock on until `done`, letting real work run in between. */
async function passTimeUntil(done: () => boolean): Promise<void> {
  for (let tries = 0; !done(); tries++) {
    expect(tries).toBeLessThan(1000);
    await vi.advanceTimersByTimeAsync(500);
    await new Promise(resolve => setImmediate(resolve));
  }
}

/** Runs `delivery` while the fake clock passes its waits. */
async function withTimePassing<T>(delivery: Promise<T>): Promise<T> {
  let settled = false;
  delivery.then(
    () => (settled = true),
    () => (settled = true),
  );
  await passTimeUntil(() => settled);
  return delivery;
}

beforeEach(async () => {
  chrome = installChromeFake();
  fetchMock.mockReset();
  taskMintUp();
  vi.stubGlobal('fetch', fetchMock);
  await start();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('delivering a capture', () => {
  it('posts it to TaskMint and shows it delivered', async () => {
    await worker.handleCapture(PAYLOAD, SITE_TAB);

    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TaskMint-Capture': '1' },
      body: PAYLOAD,
    });
    expect(chrome.storage.session.data.lastDeliveredHash).toBe(await worker.sha256Hex(PAYLOAD));
    expect(badge(chrome)).toEqual({ text: '✓', color: '#2e7d32', title: 'TaskMint capture: delivered to TaskMint' });
    expect(chrome.alarms.armed.get(worker.BADGE_CLEAR_ALARM)).toEqual({ delayInMinutes: 1 });
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('delivers an unchanged payload again only while TaskMint is up, and never launches it', async () => {
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    taskMintDown();
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chrome.storage.local.data.pendingCapture).toBeUndefined();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();

    // After a reset in the app, say
    taskMintUp();
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(badge(chrome).text).toBe('✓');
  });

  it('counts an error reply as not delivered', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    expect(await worker.attemptDelivery({ payloadText: PAYLOAD, capturedAt: 'then' })).toBe(false);
    expect(chrome.storage.local.data.pendingCapture).toEqual({ payloadText: PAYLOAD, capturedAt: 'then' });
  });
});

describe('when TaskMint is closed', () => {
  beforeEach(() => {
    fakeWaits();
    taskMintDown();
  });

  it('queues a fresh capture, launches TaskMint through the page, and keeps trying', async () => {
    await withTimePassing(worker.handleCapture(PAYLOAD, SITE_TAB));

    const pending = chrome.storage.local.data.pendingCapture as { payloadText: string; capturedAt: string };
    expect(pending.payloadText).toBe(PAYLOAD);
    expect(new Date(pending.capturedAt).toISOString()).toBe(pending.capturedAt);
    expect(badge(chrome)).toEqual({
      text: '!',
      color: '#d32f2f',
      title: 'TaskMint capture: waiting for TaskMint — retrying every minute',
    });
    expect(chrome.alarms.armed.get(worker.RETRY_ALARM)).toEqual({ periodInMinutes: 1 });
    // The first try and three while it starts
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [tabId, message] = chrome.tabs.sendMessage.mock.calls[0];
    expect(tabId).toBe(SITE_TAB);
    const { type, url } = message as { type: string; url: string };
    expect(type).toBe('open-deep-link');
    expect(url).toMatch(/^taskmint:\/\/import-worklogs\?v=1&d=[A-Za-z0-9_-]+$/);
    expect(await linkPayload(url)).toBe(PAYLOAD);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('delivers once TaskMint has started', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect(await withTimePassing(worker.attemptDelivery({ payloadText: PAYLOAD, capturedAt: 'now' }, { viaTabId: SITE_TAB, launchIfUnreachable: true }))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(chrome.storage.local.data.pendingCapture).toBeUndefined();
    expect(chrome.alarms.armed.has(worker.RETRY_ALARM)).toBe(false);
    expect(badge(chrome).text).toBe('✓');
  });

  it('opens the link in a background tab when the page is gone, then closes it', async () => {
    chrome.tabs.sendMessage.mockRejectedValue(new Error('Could not establish connection'));
    await withTimePassing(worker.fireDeepLink(PAYLOAD, SITE_TAB));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.stringMatching(/^taskmint:\/\/import-worklogs/), active: false });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(70);

    // Without a tab to ask, straight to one; a tab that's already gone is fine
    chrome.tabs.remove.mockRejectedValue(new Error('No tab with id: 70'));
    await withTimePassing(worker.fireDeepLink(PAYLOAD, null));
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
  });

  it('leaves it to the retry alarm when no tab can be opened', async () => {
    chrome.tabs.create.mockResolvedValueOnce({} as chrome.tabs.Tab);
    await withTimePassing(worker.fireDeepLink(PAYLOAD, null));
    expect(chrome.tabs.remove).not.toHaveBeenCalled();

    chrome.tabs.create.mockRejectedValueOnce(new Error('no windows'));
    await expect(withTimePassing(worker.fireDeepLink(PAYLOAD, null))).resolves.toBeUndefined();
  });

  it('launches without the payload when it is too big for a link, or compression is missing', async () => {
    const random = crypto.getRandomValues(new Uint8Array(40_000));
    const big = JSON.stringify([...random].map(n => n.toString(36)));
    await withTimePassing(worker.fireDeepLink(big, SITE_TAB));
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(SITE_TAB, { type: 'open-deep-link', url: worker.CAPTURE_PENDING_LINK });

    vi.stubGlobal('CompressionStream', undefined);
    await withTimePassing(worker.fireDeepLink(PAYLOAD, SITE_TAB));
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(SITE_TAB, { type: 'open-deep-link', url: worker.CAPTURE_PENDING_LINK });
  });

  it('retries a queued capture without launching TaskMint again', async () => {
    const queued = { payloadText: PAYLOAD, capturedAt: '2026-10-27T12:00:00.000Z' };
    chrome.storage.local.data.pendingCapture = queued;
    await worker.retryPending();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();

    taskMintUp();
    await worker.retryPending();
    expect(chrome.storage.local.data.pendingCapture).toBeUndefined();
  });
});

describe('the retry queue', () => {
  it('with nothing queued, stops retrying and shows idle', async () => {
    await chrome.alarms.create(worker.RETRY_ALARM, { periodInMinutes: 1 });
    await worker.retryPending();
    expect(chrome.alarms.armed.has(worker.RETRY_ALARM)).toBe(false);
    expect(badge(chrome)).toEqual({
      text: '',
      color: undefined,
      title: 'TaskMint capture: waiting for the DataAnnotation payments page',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the queued badge again when the worker starts', async () => {
    chrome = installChromeFake();
    chrome.storage.local.data.pendingCapture = { payloadText: PAYLOAD, capturedAt: 'then' };
    await start();
    await vi.waitFor(() => expect(badge(chrome).text).toBe('!'));

    // Nothing queued: the badge is left alone
    chrome = installChromeFake();
    await start();
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('the listeners', () => {
  const fromSite = { url: 'https://app.dataannotation.tech/workers/payments', tab: { id: SITE_TAB } } as chrome.runtime.MessageSender;

  it("deliver captures the site's pages send", async () => {
    chrome.runtime.onMessage.emit({ type: 'worklog-payload', payloadText: PAYLOAD }, fromSite);
    await vi.waitFor(() => expect(badge(chrome).text).toBe('✓'));

    taskMintDown();
    fakeWaits();
    chrome.runtime.onMessage.emit({ type: 'worklog-payload', payloadText: '{"other":1}' }, { url: fromSite.url });
    // No tab to navigate: a background one opens the link
    await passTimeUntil(() => chrome.tabs.create.mock.calls.length > 0);
  });

  it('ignore anything else', async () => {
    for (const [message, sender] of [
      [null, fromSite],
      [{ type: 'other', payloadText: PAYLOAD }, fromSite],
      [{ type: 'worklog-payload', payloadText: 42 }, fromSite],
      [{ type: 'worklog-payload', payloadText: PAYLOAD }, { url: 'https://example.com/' }],
      [{ type: 'worklog-payload', payloadText: PAYLOAD }, {}],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      chrome.runtime.onMessage.emit(message, sender);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetchMock).not.toHaveBeenCalled();

    // A capture that fails before delivering is dropped quietly
    chrome.storage.session.get.mockRejectedValueOnce(new Error('storage gone'));
    chrome.runtime.onMessage.emit({ type: 'worklog-payload', payloadText: PAYLOAD }, fromSite);
    await vi.waitFor(() => expect(chrome.storage.session.get).toHaveBeenCalled());
  });

  it('retry on the alarm and at startup, and clear the badge on its alarm and at install', async () => {
    chrome.alarms.onAlarm.emit({ name: worker.RETRY_ALARM } as chrome.alarms.Alarm);
    await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledWith(worker.RETRY_ALARM));
    chrome.runtime.onStartup.emit();
    await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledTimes(2));

    chrome.action.setTitle.mockClear();
    chrome.alarms.onAlarm.emit({ name: worker.BADGE_CLEAR_ALARM } as chrome.alarms.Alarm);
    chrome.runtime.onInstalled.emit();
    chrome.alarms.onAlarm.emit({ name: 'someone-elses' } as chrome.alarms.Alarm);
    await vi.waitFor(() => expect(chrome.action.setTitle).toHaveBeenCalledTimes(2));
  });

  it('swallow what fails in the background', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('storage gone'));
    chrome.action.setBadgeText.mockRejectedValue(new Error('no action'));
    chrome.alarms.onAlarm.emit({ name: worker.RETRY_ALARM } as chrome.alarms.Alarm);
    chrome.alarms.onAlarm.emit({ name: worker.BADGE_CLEAR_ALARM } as chrome.alarms.Alarm);
    chrome.runtime.onStartup.emit();
    chrome.runtime.onInstalled.emit();
    chrome.action.onClicked.emit({ id: SITE_TAB, url: fromSite.url } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalledTimes(3));

    // Starting with storage gone
    chrome = installChromeFake();
    chrome.storage.local.get.mockRejectedValue(new Error('storage gone'));
    await start();
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());
  });

  it('the toolbar button forgets what was sent, and captures the payments page again', async () => {
    chrome.storage.session.data.lastDeliveredHash = 'abc';
    chrome.storage.local.data.pendingCapture = { payloadText: PAYLOAD, capturedAt: 'then' };
    chrome.action.onClicked.emit({ id: SITE_TAB, url: fromSite.url } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(chrome.tabs.reload).toHaveBeenCalledWith(SITE_TAB));
    expect(chrome.storage.session.data).toEqual({});
    expect(chrome.storage.local.data).toEqual({});
    expect(badge(chrome).text).toBe('');

    // Other pages aren't reloaded
    for (const tab of [{ id: 6, url: 'https://example.com/' }, { id: 6 }, { url: fromSite.url }]) {
      await worker.resetAndRecapture(tab as chrome.tabs.Tab);
    }
    expect(chrome.tabs.reload).toHaveBeenCalledTimes(1);
  });
});

describe('encoding', () => {
  it('hashes and compresses as the desktop app reads them', async () => {
    expect(await worker.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // Longer than one chunk of the base64 conversion
    const long = 'x'.repeat(100).concat(...Array.from({ length: 3000 }, (_, i) => `${i * 7919}`));
    const url = `taskmint://import-worklogs?v=1&d=${await worker.gzipBase64Url(long)}`;
    expect(await linkPayload(url)).toBe(long);
  });
});
