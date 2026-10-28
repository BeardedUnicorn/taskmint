// Delivery to the TaskMint app on this computer: a POST to its capture
// server on localhost, and when the app is closed, a taskmint:// link that
// asks the OS to launch it (carrying the gzip-compressed payload when it
// fits in a URL).

import { CAPTURE, DEEP_LINK } from '@taskmint/contracts';
import { ignore } from '../ignore';
import { OPEN_DEEP_LINK } from '../messages';

const ENDPOINT = `http://127.0.0.1:${CAPTURE.SERVER_PORT}${CAPTURE.PATH}`;
// Windows caps process command lines at ~32K chars; stay comfortably under.
export const DEEP_LINK_MAX_URL = 30000;
export const CAPTURE_PENDING_LINK = `${DEEP_LINK.SCHEME}://${DEEP_LINK.CAPTURE_PENDING}`;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function gzipBase64Url(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function deliverToDesktop(payloadText: string): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [CAPTURE.HEADER]: '1',
    },
    body: payloadText,
  });
  if (!response.ok) {
    throw new Error(`TaskMint responded ${response.status}`);
  }
}

/**
 * Ask the OS to launch TaskMint via taskmint://, carrying the compressed
 * payload when it fits in a URL (otherwise a data-less capture-pending link —
 * the queued POST delivers the payload once the app is up).
 */
export async function launchDesktop(payloadText: string, tabId: number | null): Promise<void> {
  let url = CAPTURE_PENDING_LINK;
  try {
    const encoded = await gzipBase64Url(payloadText);
    const candidate = `${DEEP_LINK.SCHEME}://${DEEP_LINK.IMPORT_WORKLOGS}?v=1&${DEEP_LINK.PAYLOAD_PARAM}=${encoded}`;
    if (candidate.length <= DEEP_LINK_MAX_URL) url = candidate;
  } catch {
    /* compression unavailable — fall back to the launch-only link */
  }

  // Navigating the originating tab keeps Chrome's "Always allow" choice tied
  // to the site origin (and an external scheme never unloads the page).
  if (tabId != null) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: OPEN_DEEP_LINK, url });
      return;
    } catch {
      /* tab closed or content script gone — fall through */
    }
  }
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    await sleep(2000);
    if (tab.id != null) {
      await chrome.tabs.remove(tab.id).catch(ignore);
    }
  } catch {
    /* nothing else to try; the retry alarm keeps the payload queued */
  }
}
