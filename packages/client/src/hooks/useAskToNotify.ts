/**
 * When a phone asks to let TaskMint notify (Android 13 and later): when the
 * user sets up something that notifies, never at launch, before they've seen
 * the app. That's their first work on this device (the daily goal's
 * milestones and the end-of-day summary follow it), a withdrawal reminder,
 * or a test notification. Android asks at most twice, and not again once
 * answered; elsewhere there's nothing to ask.
 */

import { useEffect, useRef } from 'react';
import { getBackend } from '../backend';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { readLocal, writeLocal } from '../utils/localStore';

/** This device asked once when work first started. */
const ASKED_AT_FIRST_WORK = 'askedToNotifyAtFirstWork';

/** Asks now, for something the user just set up that notifies. */
export function askToNotify(): void {
  getBackend().platform.notifications.askPermission?.();
}

/**
 * Asks once, the first time work starts on this device while the app is
 * open. A session already open at launch doesn't count: that would be
 * asking at launch again.
 */
export function useAskToNotifyAtFirstWork(): void {
  const { activeSession, hasLoaded } = useSessionManagementContext();
  const working = Boolean(activeSession);
  // Whether work was open last time (null until the sessions have loaded)
  const before = useRef<boolean | null>(null);

  useEffect(() => {
    if (!hasLoaded) return;
    const started = before.current === false && working;
    before.current = working;
    if (!started || !getBackend().platform.notifications.askPermission) return;
    if (readLocal(ASKED_AT_FIRST_WORK, false)) return;
    writeLocal(ASKED_AT_FIRST_WORK, true, false);
    askToNotify();
  }, [hasLoaded, working]);
}
