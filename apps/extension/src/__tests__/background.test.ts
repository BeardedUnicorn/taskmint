import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE } from '@taskmint/contracts';
import { badge, installChromeFake, type ChromeFake } from './chromeFake';
import { fakeWaits, passTimeUntil, withTimePassing } from './time';
import { CAPTURE_PENDING_LINK } from '../delivery/desktop';

type Worker = typeof import('../background');

const DESKTOP_ENDPOINT = `http://127.0.0.1:${CAPTURE.SERVER_PORT}${CAPTURE.PATH}`;
const SERVER = { kind: 'server', url: 'https://taskmint.example.com', token: 'tmk_capture' } as const;
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

function reachable(status = 204) {
  fetchMock.mockImplementation(async () => new Response(null, { status }));
}

function unreachable() {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
}

function refuses(status: number) {
  fetchMock.mockImplementation(async () => Response.json({ error: 'sign in first', code: 'unauthenticated' }, { status }));
}

function useServer() {
  chrome.storage.local.data.target = SERVER;
}

beforeEach(async () => {
  chrome = installChromeFake();
  fetchMock.mockReset();
  reachable();
  vi.stubGlobal('fetch', fetchMock);
  await start();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('delivering to the app on this computer', () => {
  it('posts it to TaskMint and shows it delivered', async () => {
    await worker.handleCapture(PAYLOAD, SITE_TAB);

    expect(fetchMock).toHaveBeenCalledWith(DESKTOP_ENDPOINT, {
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
    unreachable();
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chrome.storage.local.data.pendingCapture).toBeUndefined();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();

    // After a reset in the app, say
    reachable();
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(badge(chrome).text).toBe('✓');
  });

  it('counts an error reply as not delivered', async () => {
    reachable(500);
    expect(await worker.attemptDelivery({ payloadText: PAYLOAD, capturedAt: 'then' })).toBe(false);
    expect(chrome.storage.local.data.pendingCapture).toEqual({ payloadText: PAYLOAD, capturedAt: 'then' });
  });

  describe('when TaskMint is closed', () => {
    beforeEach(() => {
      fakeWaits();
      unreachable();
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
      expect((message as { url: string }).url).toMatch(/^taskmint:\/\/import-worklogs\?v=1&d=/);
    });

    it('delivers once TaskMint has started', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(new Response(null, { status: 204 }));
      const capture = { payloadText: PAYLOAD, capturedAt: 'now' };
      expect(await withTimePassing(worker.attemptDelivery(capture, { viaTabId: SITE_TAB, launchIfUnreachable: true }))).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(chrome.storage.local.data.pendingCapture).toBeUndefined();
      expect(chrome.alarms.armed.has(worker.RETRY_ALARM)).toBe(false);
      expect(badge(chrome).text).toBe('✓');
    });

    it('retries a queued capture without launching TaskMint again', async () => {
      chrome.storage.local.data.pendingCapture = { payloadText: PAYLOAD, capturedAt: '2026-10-27T12:00:00.000Z' };
      await worker.retryPending();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();

      reachable();
      await worker.retryPending();
      expect(chrome.storage.local.data.pendingCapture).toBeUndefined();
    });
  });
});

describe('delivering to a TaskMint server', () => {
  beforeEach(useServer);

  it('posts it with the token and shows it delivered there', async () => {
    reachable(200);
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledWith('https://taskmint.example.com/api/v1/capture', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tmk_capture',
        'X-TaskMint-Capture': '1',
        'Content-Type': 'application/json',
      },
      body: PAYLOAD,
    });
    expect(badge(chrome).title).toBe('TaskMint capture: delivered to the TaskMint server');
  });

  it("queues what the server can't take now, and never launches the desktop app", async () => {
    unreachable();
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(chrome.alarms.armed.has(worker.RETRY_ALARM)).toBe(true);
    expect(badge(chrome)).toEqual({
      text: '!',
      color: '#d32f2f',
      title: 'TaskMint capture: waiting for the TaskMint server — retrying every minute',
    });
  });

  it('stops retrying when the server refuses the token, until the options change', async () => {
    for (const status of [401, 403]) {
      refuses(status);
      await worker.handleCapture(`{"try":${status}}`, SITE_TAB);
      expect(chrome.storage.local.data.tokenRejected).toBe(true);
    }
    expect(chrome.storage.local.data.pendingCapture).toEqual(expect.objectContaining({ payloadText: '{"try":403}' }));
    expect(chrome.alarms.armed.has(worker.RETRY_ALARM)).toBe(false);
    expect(badge(chrome)).toEqual({
      text: '✕',
      color: '#d32f2f',
      title: "TaskMint capture: the server refused the token — set a new one in the extension's options",
    });

    // The alarm and a restart don't try again
    fetchMock.mockClear();
    await worker.retryPending();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(badge(chrome).text).toBe('✕');

    // A new token in the options does
    reachable(200);
    chrome.storage.local.data.target = { ...SERVER, token: 'tmk_new' };
    chrome.storage.onChanged.emit({ target: { newValue: chrome.storage.local.data.target } }, 'local');
    await vi.waitFor(() => expect(badge(chrome).text).toBe('✓'));
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer tmk_new' }));
    expect(chrome.storage.local.data).toEqual({ target: { ...SERVER, token: 'tmk_new' } });
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

  it('shows the queued or refused badge again when the worker starts', async () => {
    for (const [rejected, text] of [
      [false, '!'],
      [true, '✕'],
    ] as const) {
      chrome = installChromeFake();
      chrome.storage.local.data.pendingCapture = { payloadText: PAYLOAD, capturedAt: 'then' };
      if (rejected) chrome.storage.local.data.tokenRejected = true;
      await start();
      await vi.waitFor(() => expect(badge(chrome).text).toBe(text));
    }

    // Nothing queued: the badge is left alone
    chrome = installChromeFake();
    await start();
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('starts over for a new target: what was delivered and refused is forgotten', async () => {
    chrome.storage.session.data.lastDeliveredHash = await worker.sha256Hex(PAYLOAD);
    chrome.storage.local.data.tokenRejected = true;
    await worker.targetChanged();
    expect(chrome.storage.session.data).toEqual({});
    expect(chrome.storage.local.data).toEqual({});
    await worker.handleCapture(PAYLOAD, SITE_TAB);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the listeners', () => {
  const fromSite = { url: 'https://app.dataannotation.tech/workers/payments', tab: { id: SITE_TAB } } as chrome.runtime.MessageSender;

  it("deliver captures the site's pages send", async () => {
    chrome.runtime.onMessage.emit({ type: 'worklog-payload', payloadText: PAYLOAD }, fromSite);
    await vi.waitFor(() => expect(badge(chrome).text).toBe('✓'));

    unreachable();
    fakeWaits();
    chrome.runtime.onMessage.emit({ type: 'worklog-payload', payloadText: '{"other":1}' }, { url: fromSite.url });
    // No tab to navigate: a background one opens the link
    await passTimeUntil(() => chrome.tabs.create.mock.calls.length > 0);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.stringMatching(/^taskmint:/), active: false });
    expect(CAPTURE_PENDING_LINK).toBe('taskmint://capture-pending');
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
    chrome.storage.onChanged.emit({ pendingCapture: {} }, 'local');
    chrome.storage.onChanged.emit({ target: {} }, 'sync');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(chrome.storage.session.remove).not.toHaveBeenCalled();

    // A capture that fails before delivering is dropped quietly
    chrome.storage.session.get.mockRejectedValueOnce(new Error('storage gone'));
    chrome.runtime.onMessage.emit({ type: 'worklog-payload', payloadText: PAYLOAD }, fromSite);
    await vi.waitFor(() => expect(chrome.storage.session.get).toHaveBeenCalled());
  });

  it('retry on the alarm, at startup and for new options, and clear the badge on its alarm and at install', async () => {
    chrome.alarms.onAlarm.emit({ name: worker.RETRY_ALARM } as chrome.alarms.Alarm);
    await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledWith(worker.RETRY_ALARM));
    chrome.runtime.onStartup.emit();
    await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledTimes(2));
    chrome.storage.onChanged.emit({ target: { newValue: SERVER } }, 'local');
    await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledTimes(3));

    chrome.action.setTitle.mockClear();
    chrome.alarms.onAlarm.emit({ name: worker.BADGE_CLEAR_ALARM } as chrome.alarms.Alarm);
    chrome.runtime.onInstalled.emit();
    chrome.alarms.onAlarm.emit({ name: 'someone-elses' } as chrome.alarms.Alarm);
    await vi.waitFor(() => expect(chrome.action.setTitle).toHaveBeenCalledTimes(2));
  });

  it('swallow what fails in the background', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('storage gone'));
    chrome.storage.local.remove.mockRejectedValue(new Error('storage gone'));
    chrome.action.setBadgeText.mockRejectedValue(new Error('no action'));
    chrome.alarms.onAlarm.emit({ name: worker.RETRY_ALARM } as chrome.alarms.Alarm);
    chrome.alarms.onAlarm.emit({ name: worker.BADGE_CLEAR_ALARM } as chrome.alarms.Alarm);
    chrome.runtime.onStartup.emit();
    chrome.runtime.onInstalled.emit();
    chrome.storage.onChanged.emit({ target: {} }, 'local');
    chrome.action.onClicked.emit({ id: SITE_TAB, url: fromSite.url } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(1));
    // The worker's own read at startup, then the alarm's, the badge alarm's and the restart's
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(chrome.storage.local.remove).toHaveBeenCalledTimes(2));

    // Starting with storage gone
    chrome = installChromeFake();
    chrome.storage.local.get.mockRejectedValue(new Error('storage gone'));
    await start();
    await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());
  });

  it('the toolbar button forgets what was sent and refused, and captures the payments page again', async () => {
    chrome.storage.session.data.lastDeliveredHash = 'abc';
    chrome.storage.local.data.pendingCapture = { payloadText: PAYLOAD, capturedAt: 'then' };
    chrome.storage.local.data.tokenRejected = true;
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

it('hashes payloads as the dedupe compares them', async () => {
  expect(await worker.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
