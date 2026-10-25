/**
 * Helpers the work-log modules share.
 */

import { TimerInstance, TimerState } from '../../types/timer';

export const MS_PER_MINUTE = 60_000;

export function defaultIdFactory(): string {
  return crypto.randomUUID();
}

/** A timer still live (running or paused): a day holding one can't be rewritten. */
export function isRunningOrPaused(instance: TimerInstance): boolean {
  return (
    instance.state === TimerState.running ||
    instance.state === TimerState.paused ||
    Boolean(instance.isRunning) ||
    Boolean(instance.isPaused)
  );
}

/** Map key for a (task, work day) bucket. */
export function groupKey(taskId: string, workDay: string): string {
  return `${taskId}\u0000${workDay}`;
}
