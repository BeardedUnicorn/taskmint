/**
 * Timer Instance Helpers
 *
 * Shared elapsed-time math for timer instances. This must mirror the backend's
 * stop computation in crates/taskmint-core/src/timer.rs: tracked time is
 * (elapsed since startTime) minus the accumulated pause time, so the live
 * display never jumps when a timer is paused, resumed, or stopped.
 */

import { TaskSession, TimeEntry, TimerInstance, TimerState } from '../types/timer';
import { formatDateString } from './dateHelpers';

function toMs(value: Date | string | null | undefined): number | null {
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
/** Whether any session has a timer running right now. */
export function hasRunningTimer(sessions: TaskSession[]): boolean {
  return sessions.some(session => session.timerInstances?.some(instance => instance.state === TimerState.running));
}

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
 * Net tracked milliseconds for a whole session at `nowMs`: the sum of
 * getInstanceElapsedMs over its timer instances. Unlike the backend's
 * session.totalDuration (finalized instances only), this includes live
 * running and frozen paused time.
 */
export function getSessionElapsedMs(session: TaskSession, nowMs: number = Date.now()): number {
  if (!session || !Array.isArray(session.timerInstances)) return 0;
  return session.timerInstances.reduce((total, instance) => total + getInstanceElapsedMs(instance, nowMs), 0);
}

/**
 * Local calendar date (YYYY-MM-DD) a timer instance's time belongs to: the
 * day it actually started running. session.date is frozen at session
 * creation, so bucketing by it hides timers run today inside an older,
 * reactivated session. start_timer_instance resets startTime to the actual
 * run start, making it the honest bucket. Accepted limitation: a timer
 * started before local midnight and still running lands entirely in
 * yesterday's bucket.
 */
export function getInstanceDateString(instance: TimerInstance, fallbackDate?: string): string {
  const startMs = toMs(instance.startTime);
  if (startMs == null) return fallbackDate ?? '';
  return formatDateString(new Date(startMs));
}

/** A session's timers that belong to one local calendar date. */
export function getTimersOnDate(session: TaskSession, dateStr: string): TimerInstance[] {
  return session.timerInstances.filter(instance => getInstanceDateString(instance, session.date) === dateStr);
}

/** The task a session's timer belongs to: its own, else the session's. */
export function instanceTaskId(instance: TimerInstance, session: Pick<TaskSession, 'taskId'>): string {
  return instance.task?.taskId ?? session.taskId;
}

/** The name of the task a session's timer belongs to. */
export function instanceTaskName(instance: TimerInstance, session: Pick<TaskSession, 'taskName'>): string {
  return instance.task?.taskName ?? session.taskName;
}

/** One task's time in a session. */
export interface SessionTaskTotal {
  taskId: string;
  taskName: string;
  elapsedMs: number;
}

/**
 * What a session's time went to: one total per task that has run, in the order
 * they first appear. A timer that never started hasn't run, so its task isn't
 * listed until it does.
 */
export function sessionTaskTotals(session: TaskSession, nowMs: number = Date.now()): SessionTaskTotal[] {
  const totals = new Map<string, SessionTaskTotal>();
  for (const instance of session.timerInstances) {
    if (instance.state === TimerState.idle) continue;
    const taskId = instanceTaskId(instance, session);
    const total = totals.get(taskId) ?? { taskId, taskName: instanceTaskName(instance, session), elapsedMs: 0 };
    total.elapsedMs += getInstanceElapsedMs(instance, nowMs);
    totals.set(taskId, total);
  }
  return [...totals.values()];
}

/** The tasks a session has run, or the one it was opened for before anything has. */
export function sessionTaskNames(session: TaskSession): string[] {
  const names = sessionTaskTotals(session).map(total => total.taskName);
  return names.length > 0 ? names : [session.taskName];
}

/** A session's name wherever it's shown: "A" or "A, B". */
export function sessionTitle(session: TaskSession): string {
  return sessionTaskNames(session).join(', ');
}

/** The paused timer paused last (a session can hold several). */
export function mostRecentlyPaused(session: TaskSession): TimerInstance | undefined {
  const pausedAtMs = (timer: TimerInstance) => toMs(timer.pausedAt) ?? 0;
  return session.timerInstances
    .filter(timer => timer.state === TimerState.paused)
    .sort((a, b) => pausedAtMs(b) - pausedAtMs(a))[0];
}

/**
 * Net tracked milliseconds for a TimeEntry row. Entries produced by
 * sessionsToTimeEntries spread the raw instance, so the instance state and
 * pause fields are present at runtime; fall back to the stored duration for
 * plain entries.
 */
export function getEntryElapsedMs(entry: TimeEntry, nowMs: number = Date.now()): number {
  const instance = entry as unknown as TimerInstance;
  if (instance.state) return getInstanceElapsedMs(instance, nowMs);
  return entry.duration || 0;
}

/**
 * update_timer_instance payload for an edit that sets a new net duration.
 * endTime = startTime + pausedDuration + duration — the inverse of the
 * backend's stop math — so the stored invariant
 * (duration = endTime - startTime - pausedDuration) holds exactly.
 * The edit always finalizes the instance, so the running/paused flags are
 * cleared regardless of which page it came from.
 */
export function buildTimerEditUpdates(instance: TimerInstance, durationMs: number) {
  const startMs = toMs(instance.startTime) ?? 0;
  const pausedMs = instance.pausedDuration || 0;
  // Backend duration is a u64: must be a non-negative integer.
  const duration = Math.max(0, Math.round(durationMs));
  return {
    duration,
    endTime: new Date(startMs + pausedMs + duration).toISOString(),
    isRunning: false,
    isPaused: false,
  };
}

/**
 * Flatten backend sessions into the TimeEntry shape the Tasks, History and
 * Calendar pages consume. Keeps the raw instance fields and overlays its task,
 * its rate and the session's source. Each entry's `date` is the instance's own
 * local start date (not session.date, which is frozen at session creation
 * while sessions get reactivated across days) — the same per-instance
 * bucketing the Sessions-page scorecards use, and the same day the pages
 * that key off startTime already display.
 */
export function sessionsToTimeEntries(sessions: TaskSession[]): TimeEntry[] {
  return sessions
    .filter(s => s && Array.isArray(s.timerInstances))
    .flatMap(s =>
      s.timerInstances.map(i => ({
        ...i,
        // As TimeEntry has them: times as dates, no duration while it runs
        startTime: new Date(i.startTime),
        endTime: i.endTime ? new Date(i.endTime) : undefined,
        duration: i.duration ?? undefined,
        taskName: instanceTaskName(i, s),
        taskId: instanceTaskId(i, s),
        hourlyRate: (i.task ? i.task.hourlyRate : s.hourlyRate) ?? null,
        source: s.source,
        isRunning: i.state === TimerState.running,
        date: getInstanceDateString(i, s.date),
      }))
    ) as unknown as TimeEntry[];
}
