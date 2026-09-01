// Service worker: delivers captured work-log payloads to TaskMint.
//
// Primary channel is a localhost POST (real delivery confirmation; drives the
// badge and the retry queue). When TaskMint is closed, a taskmint:// deep
// link — carrying the gzip-compressed payload when it fits in a URL — asks
// the OS to launch the bundled app, and quick follow-up POSTs confirm the
// hand-off. Periodic retries never re-launch the app; only a fresh capture
// does.
//
// MV3 notes: all listeners are registered synchronously at top level; alarms
// (never bare setTimeout) do the scheduling across service-worker restarts —
// awaited inline delays are fine while a handler's promise keeps the worker
// alive.

const ENDPOINT = 'http://127.0.0.1:43117/api/work-log-payload';
const SITE_ORIGIN = 'https://app.dataannotation.tech/';
const RETRY_ALARM = 'taskmint-retry-delivery';
const BADGE_CLEAR_ALARM = 'taskmint-clear-badge';
const RETRY_PERIOD_MINUTES = 1;
// Windows caps process command lines at ~32K chars; stay comfortably under.
const DEEP_LINK_MAX_URL = 30000;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function gzipBase64Url(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setBadge(state) {
  if (state === 'ok') {
    await chrome.action.setBadgeText({ text: '✓' });
    await chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
    await chrome.action.setTitle({ title: 'TaskMint capture: delivered to TaskMint' });
  } else if (state === 'queued') {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d32f2f' });
    await chrome.action.setTitle({
      title: 'TaskMint capture: waiting for TaskMint — retrying every minute',
    });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({
      title: 'TaskMint capture: waiting for the DataAnnotation payments page',
    });
  }
}

async function deliver(payloadText) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TaskMint-Capture': '1',
    },
    body: payloadText,
  });
  if (!response.ok) {
    throw new Error(`TaskMint responded ${response.status}`);
  }
}

async function markDelivered(payloadText) {
  await chrome.storage.session.set({ lastDeliveredHash: await sha256Hex(payloadText) });
  await chrome.storage.local.remove('pendingCapture');
  await chrome.alarms.clear(RETRY_ALARM);
  await setBadge('ok');
  await chrome.alarms.create(BADGE_CLEAR_ALARM, { delayInMinutes: 1 });
}

/**
 * Ask the OS to launch TaskMint via taskmint://, carrying the compressed
 * payload when it fits in a URL (otherwise a data-less capture-pending link —
 * the queued POST delivers the payload once the app is up).
 */
async function fireDeepLink(payloadText, tabId) {
  let url = 'taskmint://capture-pending';
  try {
    const encoded = await gzipBase64Url(payloadText);
    const candidate = `taskmint://import-worklogs?v=1&d=${encoded}`;
    if (candidate.length <= DEEP_LINK_MAX_URL) url = candidate;
  } catch {
    /* compression unavailable — fall back to the launch-only link */
  }

  // Navigating the originating tab keeps Chrome's "Always allow" choice tied
  // to the site origin (and an external scheme never unloads the page).
  if (tabId != null) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'open-deep-link', url });
      return;
    } catch {
      /* tab closed or content script gone — fall through */
    }
  }
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    await sleep(2000);
    if (tab && tab.id != null) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  } catch {
    /* nothing else to try; the retry alarm keeps the payload queued */
  }
}

/**
 * Try the localhost channel; on failure queue the payload, arm the retry
 * alarm, and (for fresh captures only) launch the app via deep link with
 * quick confirmation attempts while it cold-starts.
 */
async function attemptDelivery(capture, { viaTabId = null, launchIfUnreachable = false } = {}) {
  try {
    await deliver(capture.payloadText);
    await markDelivered(capture.payloadText);
    return true;
  } catch {
    await chrome.storage.local.set({ pendingCapture: capture });
    await setBadge('queued');
    await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: RETRY_PERIOD_MINUTES });

    if (launchIfUnreachable) {
      await fireDeepLink(capture.payloadText, viaTabId);
      for (const delayMs of [3000, 6000, 12000]) {
        await sleep(delayMs);
        try {
          await deliver(capture.payloadText);
          await markDelivered(capture.payloadText);
          return true;
        } catch {
          /* app still starting — keep waiting */
        }
      }
    }
    return false;
  }
}

async function handleCapture(payloadText, tabId) {
  const { lastDeliveredHash } = await chrome.storage.session.get('lastDeliveredHash');
  if (lastDeliveredHash && lastDeliveredHash === (await sha256Hex(payloadText))) {
    return; // unchanged since the last successful delivery
  }
  await attemptDelivery(
    { payloadText, capturedAt: new Date().toISOString() },
    { viaTabId: tabId, launchIfUnreachable: true }
  );
}

async function retryPending() {
  const { pendingCapture } = await chrome.storage.local.get('pendingCapture');
  if (!pendingCapture) {
    await chrome.alarms.clear(RETRY_ALARM);
    await setBadge('idle');
    return;
  }
  await attemptDelivery(pendingCapture);
}

/** Restore the queued badge after a browser restart cleared it. */
async function syncBadgeFromQueue() {
  const { pendingCapture } = await chrome.storage.local.get('pendingCapture');
  if (pendingCapture) {
    await setBadge('queued');
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'worklog-payload' || typeof message.payloadText !== 'string') {
    return;
  }
  if (!sender.url || !sender.url.startsWith(SITE_ORIGIN)) {
    return;
  }
  handleCapture(message.payloadText, sender.tab && sender.tab.id != null ? sender.tab.id : null)
    .catch(() => {});
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RETRY_ALARM) {
    retryPending().catch(() => {});
  } else if (alarm.name === BADGE_CLEAR_ALARM) {
    setBadge('idle').catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  retryPending().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  setBadge('idle').catch(() => {});
});

syncBadgeFromQueue().catch(() => {});
