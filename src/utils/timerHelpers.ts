/**
 * Timer Instance Helpers
 *
 * Shared elapsed-time math for timer instances. This must mirror the backend's
 * stop computation in src-tauri/src/commands/sessions.rs: tracked time is
 * (elapsed since startTime) minus the accumulated pause time, so the live
 * display never jumps when a timer is paused, resumed, or stopped.
 */

import { TaskSession, TimeEntry, TimerInstance, TimerState } from '../types/timer';

function toMs(value: Date | string | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Net tracked milliseconds for a timer instance at `nowMs`.
 * - running: (now - startTime) - pausedDuration
 * - paused:  (pausedAt - startTime) - pausedDuration (frozen)
 * - otherwise: the stored duration
 */
export function getInstanceElapsedMs(instance: TimerInstance, nowMs: number = Date.now()): number {
  const pausedMs = instance.pausedDuration || 0;

  if (instance.state === TimerState.running) {
    const startMs = toMs(instance.startTime);
    if (startMs == null) return 0;
    return Math.max(0, nowMs - startMs - pausedMs);
  }

  if (instance.state === TimerState.paused) {
    const startMs = toMs(instance.startTime);
    const pausedAtMs = toMs(instance.pausedAt);
    if (startMs == null || pausedAtMs == null) return instance.duration || 0;
    return Math.max(0, pausedAtMs - startMs - pausedMs);
  }

  return instance.duration || 0;
}

/**
 * Flatten backend sessions into the TimeEntry shape the Tasks, Time Entries,
 * Reports, and Calendar pages consume. Keeps the raw instance fields and
 * overlays the session-level ones, matching the shape those pages have always
 * received.
 */
export function sessionsToTimeEntries(sessions: TaskSession[]): TimeEntry[] {
  return sessions
    .filter(s => s && Array.isArray(s.timerInstances))
    .flatMap(s =>
      s.timerInstances.map(i => ({
        ...i,
        taskName: s.taskName,
        taskId: s.taskId,
        isRunning: i.state === TimerState.running,
        date: s.date,
      }))
    ) as unknown as TimeEntry[];
}
