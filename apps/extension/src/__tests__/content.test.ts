// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.dataannotation.tech/workers/payments" }
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeFake, type ChromeFake } from './chromeFake';
import { navigate } from '../navigate';

vi.mock('../navigate', () => ({ navigate: vi.fn() }));

let chrome: ChromeFake;

/** What the interceptor posts, as the page's window sees it. */
function post(data: unknown, init: MessageEventInit = {}) {
  window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data, ...init }));
}

// Its listeners stay on the window, so it starts once
beforeAll(async () => {
  chrome = installChromeFake();
  await import('../content');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the content script', () => {
  it("relays the interceptor's captures to the service worker", () => {
    post({ source: 'taskmint-worklog-capture', payloadText: '{"a":1}' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'worklog-payload', payloadText: '{"a":1}' });
  });

  it('relays nothing else', () => {
    post({ source: 'taskmint-worklog-capture', payloadText: '{}' }, { source: null });
    post({ source: 'taskmint-worklog-capture', payloadText: '{}' }, { origin: 'https://example.com' });
    post(null);
    post({ source: 'someone-else', payloadText: '{}' });
    post({ source: 'taskmint-worklog-capture', payloadText: 7 });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('carries on when the extension went away underneath it', async () => {
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    post({ source: 'taskmint-worklog-capture', payloadText: '{}' });
    chrome.runtime.sendMessage.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated');
    });
    expect(() => post({ source: 'taskmint-worklog-capture', payloadText: '{}' })).not.toThrow();
    await Promise.resolve();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('opens the taskmint:// links the service worker sends, and nothing else', () => {
    chrome.runtime.onMessage.emit({ type: 'open-deep-link', url: 'taskmint://capture-pending' }, {});
    expect(navigate).toHaveBeenCalledWith('taskmint://capture-pending');

    for (const message of [
      { type: 'open-deep-link', url: 'https://example.com' },
      { type: 'open-deep-link', url: 3 },
      { type: 'something-else', url: 'taskmint://capture-pending' },
      null,
    ]) {
      chrome.runtime.onMessage.emit(message, {});
    }
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
