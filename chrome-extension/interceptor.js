// Runs in the page's MAIN world at document_start, before any site script.
// Passively observes the payments work-log API response and hands the raw
// JSON text to the isolated content script via postMessage. The page's own
// fetch promise / XHR object is returned untouched, and every code path is
// wrapped so a failure here can never break the site.
(() => {
  const TARGET_PATH = '/api_internal/payments/recent_work_logs_and_timed_work_entries';
  const MARKER = 'taskmint-worklog-capture';

  // Capture is gated to the payments page (checked at RESPONSE time, so SPA
  // navigation is handled); API calls made from other pages are ignored.
  const onPaymentsPage = () => location.pathname.startsWith('/workers/payments');

  function maybeCapture(urlString, getText) {
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
        .catch(() => {});
    } catch {
      /* never break the page */
    }
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const result = origFetch.apply(this, args);
    result
      .then(response => {
        try {
          if (!response.ok) return;
          const raw =
            response.url || (typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '');
          maybeCapture(raw, () => response.clone().text());
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return result;
  };

  // ---- XMLHttpRequest ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__taskmintUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        if (this.status < 200 || this.status >= 300) return;
        maybeCapture(this.responseURL || String(this.__taskmintUrl || ''), () => {
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
})();
