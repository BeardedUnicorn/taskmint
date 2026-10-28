// Service worker: delivers captured work-log payloads to TaskMint, the app
// on this computer (delivery/desktop.ts) or a TaskMint server
// (delivery/server.ts), as the options page says (target.ts).
//
// A delivery is confirmed by its reply, which drives the badge and the retry
// queue. Identical payloads are delivered once. When the app is closed, a
// fresh capture launches it through a taskmint:// link and quick follow-up
// tries confirm the hand-off; periodic retries never re-launch it. A server
// that refuses the token pauses the retries until the options change.
//
// MV3 notes: all listeners are registered synchronously at top level; alarms
// (never bare setTimeout) do the scheduling across service-worker restarts —
// awaited inline delays are fine while a handler's promise keeps the worker
// alive.

import { deliverToDesktop, launchDesktop, sleep } from './delivery/desktop';
import { deliverToServer, TokenRejected } from './delivery/server';
import { ignore } from './ignore';
import { WORKLOG_PAYLOAD } from './messages';
import { DESKTOP, loadTarget, TARGET_KEY, TOKEN_REJECTED, type Target } from './target';

export const SITE_ORIGIN = 'https://app.dataannotation.tech/';
export const RETRY_ALARM = 'taskmint-retry-delivery';
export const BADGE_CLEAR_ALARM = 'taskmint-clear-badge';
const RETRY_PERIOD_MINUTES = 1;

/** A payload waiting for TaskMint, kept in storage.local. */
export interface Capture {
  payloadText: string;
  capturedAt: string;
}

export type BadgeState = 'ok' | 'queued' | 'rejected' | 'idle';

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** What the badge's title calls where captures go. */
function destination(target: Target): string {
  return target.kind === 'desktop' ? 'TaskMint' : 'the TaskMint server';
}

export async function setBadge(state: BadgeState, target: Target): Promise<void> {
  if (state === 'ok') {
    await chrome.action.setBadgeText({ text: '✓' });
    await chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
    await chrome.action.setTitle({ title: `TaskMint capture: delivered to ${destination(target)}` });
  } else if (state === 'queued') {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d32f2f' });
    await chrome.action.setTitle({
      title: `TaskMint capture: waiting for ${destination(target)} — retrying every minute`,
    });
  } else if (state === 'rejected') {
    await chrome.action.setBadgeText({ text: '✕' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d32f2f' });
    await chrome.action.setTitle({
      title: "TaskMint capture: the server refused the token — set a new one in the extension's options",
    });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({
      title: 'TaskMint capture: waiting for the DataAnnotation payments page',
    });
  }
}

function deliverTo(target: Target, payloadText: string): Promise<void> {
  return target.kind === 'desktop' ? deliverToDesktop(payloadText) : deliverToServer(target, payloadText);
}

async function markDelivered(payloadText: string, target: Target): Promise<void> {
  await chrome.storage.session.set({ lastDeliveredHash: await sha256Hex(payloadText) });
  await chrome.storage.local.remove(['pendingCapture', TOKEN_REJECTED]);
  await chrome.alarms.clear(RETRY_ALARM);
  await setBadge('ok', target);
  await chrome.alarms.create(BADGE_CLEAR_ALARM, { delayInMinutes: 1 });
}

/** Delivers to `target`, then marks it delivered. */
async function deliverAndMark(target: Target, payloadText: string): Promise<void> {
  await deliverTo(target, payloadText);
  await markDelivered(payloadText, target);
}

/**
 * Try the target; on failure queue the payload and arm the retry alarm, and
 * (for fresh captures to the desktop app) launch the app via deep link with
 * quick confirmation attempts while it cold-starts. A refused token keeps
 * the payload queued but pauses the retries.
 */
export async function attemptDelivery(
  capture: Capture,
  { viaTabId = null, launchIfUnreachable = false }: { viaTabId?: number | null; launchIfUnreachable?: boolean } = {},
): Promise<boolean> {
  const target = await loadTarget();
  try {
    await deliverAndMark(target, capture.payloadText);
    return true;
  } catch (error) {
    await chrome.storage.local.set({ pendingCapture: capture });
    if (error instanceof TokenRejected) {
      await chrome.storage.local.set({ [TOKEN_REJECTED]: true });
      await chrome.alarms.clear(RETRY_ALARM);
      await setBadge('rejected', target);
      return false;
    }
    await setBadge('queued', target);
    await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: RETRY_PERIOD_MINUTES });

    if (launchIfUnreachable && target.kind === 'desktop') {
      await launchDesktop(capture.payloadText, viaTabId);
      for (const delayMs of [3000, 6000, 12000]) {
        await sleep(delayMs);
        try {
          await deliverAndMark(target, capture.payloadText);
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
      await deliverAndMark(await loadTarget(), payloadText);
    } catch {
      // TaskMint is closed and this data was already delivered; do nothing.
    }
    return;
  }

  await attemptDelivery(
    { payloadText, capturedAt: new Date().toISOString() },
    { viaTabId: tabId, launchIfUnreachable: true },
  );
}

export async function retryPending(): Promise<void> {
  const { pendingCapture, [TOKEN_REJECTED]: rejected } = await chrome.storage.local.get([
    'pendingCapture',
    TOKEN_REJECTED,
  ]);
  if (!pendingCapture || rejected) {
    await chrome.alarms.clear(RETRY_ALARM);
    await setBadge(pendingCapture ? 'rejected' : 'idle', await loadTarget());
    return;
  }
  await attemptDelivery(pendingCapture as Capture);
}

/** Restore the queued badge after a browser restart cleared it. */
export async function syncBadgeFromQueue(): Promise<void> {
  const { pendingCapture, [TOKEN_REJECTED]: rejected } = await chrome.storage.local.get([
    'pendingCapture',
    TOKEN_REJECTED,
  ]);
  if (pendingCapture) {
    await setBadge(rejected ? 'rejected' : 'queued', await loadTarget());
  }
}

/**
 * The options changed where captures go: a new token may be accepted, and a
 * new target hasn't had any payload yet, so what's queued goes there now and
 * the next capture is delivered even if it's unchanged.
 */
export async function targetChanged(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_REJECTED);
  await chrome.storage.session.remove('lastDeliveredHash');
  await retryPending();
}

/** Forgets what was delivered and queued, then reloads the payments page to capture again. */
export async function resetAndRecapture(tab: chrome.tabs.Tab): Promise<void> {
  await chrome.storage.session.remove('lastDeliveredHash');
  await chrome.storage.local.remove(['pendingCapture', TOKEN_REJECTED]);
  await setBadge('idle', await loadTarget());
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
    loadTarget()
      .then(target => setBadge('idle', target))
      .catch(ignore);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && TARGET_KEY in changes) {
    targetChanged().catch(ignore);
  }
});

chrome.runtime.onStartup.addListener(() => {
  retryPending().catch(ignore);
});

chrome.runtime.onInstalled.addListener(() => {
  setBadge('idle', DESKTOP).catch(ignore);
});

chrome.action.onClicked.addListener(tab => {
  resetAndRecapture(tab).catch(ignore);
});

syncBadgeFromQueue().catch(ignore);
