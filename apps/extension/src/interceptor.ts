// Runs in the page's MAIN world at document_start, before any site script.
// Passively observes the payments work-log API response and hands the raw
// JSON text to the isolated content script via postMessage. The page's own
// fetch promise / XHR object is returned untouched, and every code path is
// wrapped so a failure here can never break the site.

import { ignore } from './ignore';
import { MARKER } from './messages';

export const TARGET_PATH = '/api_internal/payments/recent_work_logs_and_timed_work_entries';

// Capture is gated to the payments page (checked at RESPONSE time, so SPA
// navigation is handled); API calls made from other pages are ignored.
const onPaymentsPage = () => location.pathname.startsWith('/workers/payments');

function maybeCapture(urlString: string, getText: () => string | null | Promise<string>): void {
  try {
    const url = new URL(urlString, location.origin);
    if (url.origin !== location.origin || url.pathname !== TARGET_PATH) return;
    if (!onPaymentsPage()) return;
    Promise.resolve(getText())
      .then(text => {
        if (typeof text === 'string' && text.length > 0) {
          window.postMessage({ source: MARKER, payloadText: text }, location.origin);
        }
      })
      .catch(ignore);
  } catch {
    /* never break the page */
  }
}

// ---- fetch ----
const origFetch = window.fetch;
window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
  const result = origFetch.apply(this, args);
  result
    .then(response => {
      try {
        if (!response.ok) return;
        const input = args[0] as string | Request | undefined;
        const raw = response.url || (typeof input === 'string' ? input : input?.url || '');
        maybeCapture(raw, () => response.clone().text());
      } catch {
        /* ignore */
      }
    })
    .catch(ignore);
  return result;
};

// ---- XMLHttpRequest ----
const requested = new WeakMap<XMLHttpRequest, string | URL>();
const origOpen = XMLHttpRequest.prototype.open as (this: XMLHttpRequest, ...args: unknown[]) => void;
const origSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  requested.set(this, url);
  return origOpen.call(this, method, url, ...rest);
};
XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest['send']>) {
  this.addEventListener('load', () => {
    try {
      if (this.status < 200 || this.status >= 300) return;
      maybeCapture(this.responseURL || String(requested.get(this) ?? ''), () => {
        if (this.responseType === '' || this.responseType === 'text') return this.responseText;
        if (this.responseType === 'json') return JSON.stringify(this.response);
        return null; // blob/arraybuffer — not this endpoint's shape
      });
    } catch {
      /* ignore */
    }
  });
  return origSend.apply(this, args);
};
