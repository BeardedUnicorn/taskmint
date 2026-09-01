// Isolated-world relay between the MAIN-world interceptor and the service
// worker, plus the deep-link opener (navigating the page to taskmint://
// ties Chrome's "Always allow" remember-choice to the site origin; an
// external scheme never unloads the page).

window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (event.origin !== location.origin) return;
  const data = event.data;
  if (!data || data.source !== 'taskmint-worklog-capture' || typeof data.payloadText !== 'string') {
    return;
  }
  try {
    const sending = chrome.runtime.sendMessage({
      type: 'worklog-payload',
      payloadText: data.payloadText,
    });
    if (sending && typeof sending.catch === 'function') sending.catch(() => {});
  } catch {
    /* extension was reloaded ("context invalidated") — ignore */
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (
    message &&
    message.type === 'open-deep-link' &&
    typeof message.url === 'string' &&
    message.url.startsWith('taskmint://')
  ) {
    window.location.href = message.url;
  }
});
