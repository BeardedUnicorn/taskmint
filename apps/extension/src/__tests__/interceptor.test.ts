// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.dataannotation.tech/workers/payments" }
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKER } from '../messages';

const PATH = '/api_internal/payments/recent_work_logs_and_timed_work_entries';
const TARGET = `https://app.dataannotation.tech${PATH}`;
const BODY = '{"workLogs":[{"id":"w1"}]}';

/** The page's own fetch, under the interceptor. */
const pageFetch = vi.fn<typeof fetch>();
/** What the interceptor posted to the content script. */
const posted: unknown[] = [];

/** XMLHttpRequest as the page uses it; the test sets the reply, then fires load. */
class FakeXHR extends EventTarget {
  status = 200;
  responseType: XMLHttpRequestResponseType = '';
  responseText = '';
  response: unknown = null;
  responseURL = '';
  opened: unknown[] = [];
  sent = 0;

  open(...args: unknown[]) {
    this.opened = args;
  }

  send() {
    this.sent++;
  }
}

beforeAll(async () => {
  window.fetch = pageFetch;
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  window.addEventListener('message', event => posted.push(event.data));
  await import('../interceptor');
});

beforeEach(() => {
  posted.length = 0;
  pageFetch.mockReset();
  history.replaceState(null, '', '/workers/payments');
});

/** Lets the interceptor's reads and window.postMessage (a task later) land. */
async function settle() {
  for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

function reply(body: string, { status = 200, url = TARGET } = {}): Response {
  const response = new Response(body, { status });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

const captured = [{ source: MARKER, payloadText: BODY }];

describe("the page's fetch", () => {
  it('hands over the work-log response, and the page gets it untouched', async () => {
    const response = reply(BODY);
    pageFetch.mockResolvedValue(response);
    const result = await window.fetch(PATH, { credentials: 'include' });
    expect(result).toBe(response);
    expect(pageFetch).toHaveBeenCalledWith(PATH, { credentials: 'include' });
    await settle();
    expect(posted).toEqual(captured);
    expect(await result.text()).toBe(BODY);
  });

  it("finds the address in the request when the response doesn't say", async () => {
    pageFetch.mockImplementation(async () => reply(BODY, { url: '' }));
    await window.fetch(TARGET);
    await window.fetch(new Request(TARGET));
    // A URL object has no url of its own
    await window.fetch(new URL(TARGET));
    await settle();
    expect(posted).toEqual([...captured, ...captured]);
  });

  it('ignores other responses and other pages', async () => {
    for (const response of [
      reply(BODY, { status: 500 }),
      reply(''),
      reply(BODY, { url: 'https://app.dataannotation.tech/api_internal/other' }),
      reply(BODY, { url: `https://example.com${PATH}` }),
      reply(BODY, { url: 'http://[::1' }),
    ]) {
      pageFetch.mockResolvedValueOnce(response);
      await window.fetch(TARGET);
    }
    history.replaceState(null, '', '/workers/projects');
    pageFetch.mockResolvedValueOnce(reply(BODY));
    await window.fetch(TARGET);
    await settle();
    expect(posted).toEqual([]);
  });

  it('never breaks the page when reading fails', async () => {
    const unreadable = reply(BODY);
    Object.defineProperty(unreadable, 'clone', { value: () => ({ text: () => Promise.reject(new Error('aborted')) }) });
    const odd = reply(BODY);
    Object.defineProperty(odd, 'ok', {
      get() {
        throw new Error('odd response');
      },
    });
    pageFetch.mockResolvedValueOnce(unreadable).mockResolvedValueOnce(odd);
    expect(await window.fetch(TARGET)).toBe(unreadable);
    expect(await window.fetch(TARGET)).toBe(odd);

    const offline = new TypeError('Failed to fetch');
    pageFetch.mockRejectedValueOnce(offline);
    await expect(window.fetch(TARGET)).rejects.toBe(offline);
    await settle();
    expect(posted).toEqual([]);
  });
});

describe("the page's XMLHttpRequest", () => {
  function request(setUp: (xhr: FakeXHR) => void, open = true): FakeXHR {
    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    if (open) xhr.open('GET', PATH, true);
    xhr.send();
    setUp(xhr);
    xhr.dispatchEvent(new Event('load'));
    return xhr;
  }

  it('hands over the work-log response, text or JSON', async () => {
    const xhr = request(xhr => (xhr.responseText = BODY));
    expect(xhr.opened).toEqual(['GET', PATH, true]);
    expect(xhr.sent).toBe(1);
    request(xhr => {
      xhr.responseType = 'text';
      xhr.responseURL = TARGET;
      xhr.responseText = BODY;
    });
    request(xhr => {
      xhr.responseType = 'json';
      xhr.response = JSON.parse(BODY);
    });
    await settle();
    expect(posted).toEqual([...captured, ...captured, ...captured]);
  });

  it('ignores errors, other shapes, and requests it never saw opened', async () => {
    request(xhr => {
      xhr.status = 404;
      xhr.responseText = BODY;
    });
    request(xhr => {
      xhr.status = 0;
      xhr.responseText = BODY;
    });
    request(xhr => {
      xhr.responseType = 'blob';
      xhr.response = new Blob([BODY]);
    });
    request(xhr => (xhr.responseText = BODY), false);
    request(xhr =>
      Object.defineProperty(xhr, 'status', {
        get() {
          throw new Error('odd request');
        },
      })
    );
    await settle();
    expect(posted).toEqual([]);
  });
});
