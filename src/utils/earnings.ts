/**
 * Earnings
 *
 * The one place the app turns tracked time into money: rate × time. Every
 * page (Sessions, Tasks, Time Entries, Reports, charts, Payouts estimates and
 * the daily goal) goes through these, so the same time gives the same number
 * everywhere.
 *
 * The rate is the session's: captured from the task when the session started
 * (imported days carry the rate the site's pay implies), so changing a task's
 * rate later never rewrites past earnings. Only time without a captured rate
 * (from older builds, until the backend fills it in) falls back to the task's
 * current rate.
 */

import { Task } from '../types/task';
import { TaskSession, TimeEntry } from '../types/timer';
import { getSessionElapsedMs, getSessionElapsedMsOnDate } from './timerHelpers';

const MS_PER_HOUR = 3_600_000;

function positiveRate(rate: number | null | undefined): number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/** The task a session or entry belongs to: by id, else by name (older data). */
export function findTaskFor(
  item: { taskId?: string; taskName: string },
  tasks: Task[]
): Task | undefined {
  if (item.taskId) {
    const byId = tasks.find(task => task.id === item.taskId);
    if (byId) return byId;
  }
  return tasks.find(task => task.name === item.taskName);
}

/** Dollars for a duration at an hourly rate (0 without a rate). */
export function earningsForMs(ms: number, rate: number): number {
  return ms > 0 && rate > 0 ? (ms / MS_PER_HOUR) * rate : 0;
}

/** The hourly rate a session's time earns at. */
export function sessionRate(
  session: Pick<TaskSession, 'taskId' | 'taskName' | 'hourlyRate'>,
  tasks: Task[]
): number {
  return positiveRate(session.hourlyRate) || positiveRate(findTaskFor(session, tasks)?.hourlyRate);
}

/** The hourly rate a time entry earns at (its session's rate). */
export function entryRate(entry: TimeEntry, tasks: Task[]): number {
  return positiveRate(entry.hourlyRate) || positiveRate(findTaskFor(entry, tasks)?.hourlyRate);
}

/** Earnings of a finished time entry (running entries have no duration yet). */
export function entryEarnings(entry: TimeEntry, tasks: Task[]): number {
  if (entry.isRunning || !entry.duration) return 0;
  return earningsForMs(entry.duration, entryRate(entry, tasks));
}

/** Live earnings of a whole session, including a running or paused timer. */
export function sessionEarnings(session: TaskSession, tasks: Task[], nowMs: number): number {
  return earningsForMs(getSessionElapsedMs(session, nowMs), sessionRate(session, tasks));
}

/**
 * Live earnings for one local day: each timer counts on the day it started,
 * matching how every page buckets time by day.
 */
export function earningsOnDate(
  sessions: TaskSession[],
  tasks: Task[],
  date: string,
  nowMs: number
): number {
  return sessions.reduce(
    (total, session) =>
      total + earningsForMs(getSessionElapsedMsOnDate(session, date, nowMs), sessionRate(session, tasks)),
    0
  );
}
