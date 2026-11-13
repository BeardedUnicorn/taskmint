/**
 * A short buzz as a timer starts or resumes, pauses, or stops (Android, as
 * the phone's touch feedback setting allows), however it happened: a button
 * on a page, the palette, a shortcut or a notification. Hearing the timer
 * events covers them all. Several events at once (ending a session stops
 * each timer, a hand-off stops one and starts another) buzz once.
 */

import { useRef } from 'react';
import { EVENTS } from '@taskmint/contracts';
import { getBackend, useBackendEvent } from '../backend';
import type { HapticKind } from '../backend/types';

/** Events closer together than this buzz once. */
export const HAPTIC_GAP_MS = 400;

export function useTimerHaptics(): void {
  const last = useRef(Number.NEGATIVE_INFINITY);
  const buzz = (kind: HapticKind) => {
    const haptics = getBackend().platform.haptics;
    const now = Date.now();
    if (!haptics || now - last.current < HAPTIC_GAP_MS) return;
    last.current = now;
    haptics(kind);
  };

  useBackendEvent([EVENTS.TIMER_INSTANCE_STARTED, EVENTS.TIMER_INSTANCE_RESUMED], () => buzz('start'));
  useBackendEvent(EVENTS.TIMER_INSTANCE_PAUSED, () => buzz('pause'));
  useBackendEvent(EVENTS.TIMER_INSTANCE_STOPPED, () => buzz('stop'));
}
