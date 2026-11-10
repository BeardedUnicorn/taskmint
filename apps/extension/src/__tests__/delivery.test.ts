import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeFake, type ChromeFake } from './chromeFake';
import { fakeWaits, withTimePassing } from './time';
import { CAPTURE_PENDING_LINK, gzipBase64Url, launchDesktop } from '../delivery/desktop';

const PAYLOAD = '{"workLogs":[{"id":"w1","minutes":30}]}';
const SITE_TAB = 5;

let chrome: ChromeFake;
const fetchMock = vi.fn<typeof fetch>();

/** What a taskmint://import-worklogs link carries, decompressed. */
async function linkPayload(url: string): Promise<string> {
  const encoded = new URL(url).searchParams.get('d')!;
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

beforeEach(() => {
  chrome = installChromeFake();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('launching the desktop app', () => {
  beforeEach(fakeWaits);

  it('navigates the page to a link carrying the payload', async () => {
    await withTimePassing(launchDesktop(PAYLOAD, SITE_TAB));
    const [tabId, message] = chrome.tabs.sendMessage.mock.calls[0];
    expect(tabId).toBe(SITE_TAB);
    const { type, url } = message as { type: string; url: string };
    expect(type).toBe('open-deep-link');
    expect(url).toMatch(/^taskmint:\/\/import-worklogs\?v=1&d=[A-Za-z0-9_-]+$/);
    expect(await linkPayload(url)).toBe(PAYLOAD);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('opens the link in a background tab when the page is gone, then closes it', async () => {
    chrome.tabs.sendMessage.mockRejectedValue(new Error('Could not establish connection'));
    await withTimePassing(launchDesktop(PAYLOAD, SITE_TAB));
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringMatching(/^taskmint:\/\/import-worklogs/),
      active: false,
    });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(70);

    // Without a tab to ask, straight to one; a tab that's already gone is fine
    chrome.tabs.remove.mockRejectedValue(new Error('No tab with id: 70'));
    await withTimePassing(launchDesktop(PAYLOAD, null));
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
  });

  it('leaves it to the retry alarm when no tab can be opened', async () => {
    chrome.tabs.create.mockResolvedValueOnce({} as chrome.tabs.Tab);
    await withTimePassing(launchDesktop(PAYLOAD, null));
    expect(chrome.tabs.remove).not.toHaveBeenCalled();

    chrome.tabs.create.mockRejectedValueOnce(new Error('no windows'));
    await expect(withTimePassing(launchDesktop(PAYLOAD, null))).resolves.toBeUndefined();
  });

  it('launches without the payload when it is too big for a link, or compression is missing', async () => {
    const random = crypto.getRandomValues(new Uint8Array(40_000));
    const big = JSON.stringify([...random].map(n => n.toString(36)));
    await withTimePassing(launchDesktop(big, SITE_TAB));
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(SITE_TAB, {
      type: 'open-deep-link',
      url: CAPTURE_PENDING_LINK,
    });

    vi.stubGlobal('CompressionStream', undefined);
    await withTimePassing(launchDesktop(PAYLOAD, SITE_TAB));
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(SITE_TAB, {
      type: 'open-deep-link',
      url: CAPTURE_PENDING_LINK,
    });
  });

  it('compresses as the desktop app reads it, past one chunk of the conversion', async () => {
    const long = 'x'.repeat(100).concat(...Array.from({ length: 3000 }, (_, i) => `${i * 7919}`));
    expect(await linkPayload(`taskmint://import-worklogs?v=1&d=${await gzipBase64Url(long)}`)).toBe(long);
  });
});
