/**
 * The daily goal's milestone alarms a phone set today, so the app doesn't
 * announce a milestone again that the system's alarm already did (the goal
 * monitor still records it). Kept per device, in localStorage.
 */

import { formatDateString } from './dateHelpers';
import { readLocal, writeLocal } from './localStore';

/** `{ date, at: { tier: atMs } }`: today's alarms, by tier. */
export const GOAL_ALARMS_KEY = 'goalMilestoneAlarms';

/** An alarm this close ahead counts as announced: the app's check can come first. */
export const ALARM_SLACK_MS = 60_000;

interface GoalAlarms {
  date: string;
  at: Record<string, number>;
}

function today(nowMs: number): string {
  return formatDateString(new Date(nowMs));
}

function read(nowMs: number): Record<string, number> {
  const alarms = readLocal<GoalAlarms | null>(GOAL_ALARMS_KEY, null);
  return alarms?.date === today(nowMs) ? alarms.at : {};
}

/**
 * Notes the alarm set for `tier` (atMs), or that it has none now (null).
 * One that went off already stays noted: it did announce its milestone.
 */
export function noteGoalAlarm(tier: number, atMs: number | null, nowMs: number): void {
  const at = { ...read(nowMs) };
  if (atMs !== null) at[tier] = atMs;
  else if ((at[tier] ?? Number.POSITIVE_INFINITY) > nowMs) delete at[tier];
  writeLocal<GoalAlarms | null>(GOAL_ALARMS_KEY, { date: today(nowMs), at }, null);
}

/** Whether a phone's alarm announced `tier` today, or is about to. */
export function goalAlarmAnnounced(tier: number, nowMs: number): boolean {
  const at = read(nowMs)[tier];
  return at !== undefined && at <= nowMs + ALARM_SLACK_MS;
}
