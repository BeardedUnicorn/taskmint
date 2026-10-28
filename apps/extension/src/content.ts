// Isolated-world relay between the MAIN-world interceptor and the service
// worker, plus the deep-link opener (navigating the page to taskmint://
// ties Chrome's "Always allow" remember-choice to the site origin; an
// external scheme never unloads the page).

import { DEEP_LINK } from '@taskmint/contracts';
import { ignore } from './ignore';
import { MARKER, OPEN_DEEP_LINK, WORKLOG_PAYLOAD } from './messages';
import { navigate } from './navigate';

window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; payloadText?: unknown } | null;
  if (!data || data.source !== MARKER || typeof data.payloadText !== 'string') {
    return;
  }
  try {
    chrome.runtime.sendMessage({ type: WORKLOG_PAYLOAD, payloadText: data.payloadText }).catch(ignore);
  } catch {
    /* extension was reloaded ("context invalidated") — ignore */
  }
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  const { type, url } = (message ?? {}) as { type?: unknown; url?: unknown };
  if (type === OPEN_DEEP_LINK && typeof url === 'string' && url.startsWith(`${DEEP_LINK.SCHEME}://`)) {
    navigate(url);
  }
});
