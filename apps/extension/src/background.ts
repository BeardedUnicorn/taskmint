// Service worker: delivers captured work-log payloads to the TaskMint app on
// this computer (delivery/desktop.ts). With cloud sync on, the app passes them
// on to the user's other devices and the web app.
//
// A delivery is confirmed by its reply, which drives the badge and the retry
// queue. Identical payloads are delivered once. When the app is closed, a
// fresh capture launches it through a taskmint:// link and quick follow-up
// tries confirm the hand-off; periodic retries never re-launch it.
//
// MV3 notes: all listeners are registered synchronously at top level; alarms
// (never bare setTimeout) do the scheduling across service-worker restarts —
// awaited inline delays are fine while a handler's promise keeps the worker
// alive.

import { deliverToDesktop, launchDesktop, sleep } from './delivery/desktop';
import { ignore } from './ignore';
import { WORKLOG_PAYLOAD } from './messages';

export const SITE_ORIGIN = 'https://app.dataannotation.tech/';
export const RETRY_ALARM = 'taskmint-retry-delivery';
export const BADGE_CLEAR_ALARM = 'taskmint-clear-badge';
const RETRY_PERIOD_MINUTES = 1;

/** A payload waiting for TaskMint, kept in storage.local. */
export interface Capture {
  payloadText: string;
  capturedAt: string;
}

export type BadgeState = 'ok' | 'queued' | 'idle';

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setBadge(state: BadgeState): Promise<void> {
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

async function markDelivered(payloadText: string): Promise<void> {
  await chrome.storage.session.set({ lastDeliveredHash: await sha256Hex(payloadText) });
  await chrome.storage.local.remove('pendingCapture');
  await chrome.alarms.clear(RETRY_ALARM);
  await setBadge('ok');
  await chrome.alarms.create(BADGE_CLEAR_ALARM, { delayInMinutes: 1 });
}

/** Delivers to the app, then marks it delivered. */
async function deliverAndMark(payloadText: string): Promise<void> {
  await deliverToDesktop(payloadText);
  await markDelivered(payloadText);
}

/**
 * Try the app; on failure queue the payload and arm the retry alarm, and
 * (for fresh captures) launch the app via deep link with quick confirmation
 * attempts while it cold-starts.
 */
export async function attemptDelivery(
  capture: Capture,
  { viaTabId = null, launchIfUnreachable = false }: { viaTabId?: number | null; launchIfUnreachable?: boolean } = {}
): Promise<boolean> {
  try {
    await deliverAndMark(capture.payloadText);
    return true;
  } catch {
    await chrome.storage.local.set({ pendingCapture: capture });
    await setBadge('queued');
    await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: RETRY_PERIOD_MINUTES });

    if (launchIfUnreachable) {
      await launchDesktop(capture.payloadText, viaTabId);
      for (const delayMs of [3000, 6000, 12000]) {
        await sleep(delayMs);
        try {
          await deliverAndMark(capture.payloadText);
          return true;
        } catch {
          /* app still starting — keep waiting */
        }
      }
    }
    return false;
  }
}

export async function handleCapture(payloadText: string, tabId: number | null): Promise<void> {
  const currentHash = await sha256Hex(payloadText);
  const { lastDeliveredHash } = await chrome.storage.session.get('lastDeliveredHash');

  if (lastDeliveredHash === currentHash) {
    // If the payload hasn't changed, deliver if TaskMint is reachable (e.g. after a data reset in the app),
    // but do not queue or fire a deep link if it isn't.
    try {
      await deliverAndMark(payloadText);
    } catch {
      // TaskMint is closed and this data was already delivered; do nothing.
    }
    return;
  }

  await attemptDelivery(
    { payloadText, capturedAt: new Date().toISOString() },
    { viaTabId: tabId, launchIfUnreachable: true }
  );
}

export async function retryPending(): Promise<void> {
  const { pendingCapture } = await chrome.storage.local.get('pendingCapture');
  if (!pendingCapture) {
    await chrome.alarms.clear(RETRY_ALARM);
    await setBadge('idle');
    return;
  }
  await attemptDelivery(pendingCapture as Capture);
}

/** Restore the queued badge after a browser restart cleared it. */
export async function syncBadgeFromQueue(): Promise<void> {
  const { pendingCapture } = await chrome.storage.local.get('pendingCapture');
  if (pendingCapture) {
    await setBadge('queued');
  }
}

/** Forgets what was delivered and queued, then reloads the payments page to capture again. */
export async function resetAndRecapture(tab: chrome.tabs.Tab): Promise<void> {
  await chrome.storage.session.remove('lastDeliveredHash');
  await chrome.storage.local.remove('pendingCapture');
  await setBadge('idle');
  if (tab.id != null && tab.url?.startsWith(SITE_ORIGIN)) {
    await chrome.tabs.reload(tab.id);
  }
}

/** A captured payload from the content script, on the site's pages. */
function isCapture(message: unknown): message is { type: typeof WORKLOG_PAYLOAD; payloadText: string } {
  const { type, payloadText } = (message ?? {}) as Record<string, unknown>;
  return type === WORKLOG_PAYLOAD && typeof payloadText === 'string';
}

chrome.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender) => {
  if (!isCapture(message) || !sender.url?.startsWith(SITE_ORIGIN)) {
    return;
  }
  handleCapture(message.payloadText, sender.tab?.id ?? null).catch(ignore);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RETRY_ALARM) {
    retryPending().catch(ignore);
  } else if (alarm.name === BADGE_CLEAR_ALARM) {
    setBadge('idle').catch(ignore);
  }
});

chrome.runtime.onStartup.addListener(() => {
  retryPending().catch(ignore);
});

chrome.runtime.onInstalled.addListener(() => {
  setBadge('idle').catch(ignore);
});

chrome.action.onClicked.addListener(tab => {
  resetAndRecapture(tab).catch(ignore);
});

syncBadgeFromQueue().catch(ignore);
