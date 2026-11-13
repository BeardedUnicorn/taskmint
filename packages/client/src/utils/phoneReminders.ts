/**
 * A phone's reminders as alarms: the system shows them at their time with
 * TaskMint closed (a desktop times them itself while it runs). Worked out
 * ahead from what's tracked now, assuming a running timer keeps running:
 *
 * - the long-run reminder, when the running timer reaches the hours set;
 * - the end-of-day summary, at its time, with that day's figures then;
 * - the daily goal's milestones still to come today, when the running timer
 *   earns its way to each.
 *
 * Pausing, stopping or any other change works them out again
 * (usePhoneReminders), so an alarm never goes off for a timer that stopped
 * in the app. Pure.
 */

import { DAILY_SUMMARY_ID, GOAL_MILESTONE_ID, LONG_RUN_REMINDER_ID } from '@taskmint/contracts';
import type { LaterNotification } from '../backend/types';
import type { DailyGoal } from '../types/goal';
import type { Task } from '../types/task';
import { type TaskSession, TimerState } from '../types/timer';
import { buildDailySummary } from '../hooks/useDailySummary';
import { EXCEEDED_TIER, nextGoalMilestone } from '../hooks/useDailyGoalProgressMonitor';
import { formatDateString } from './dateHelpers';
import { earningsOnDate } from './earnings';
import { getInstanceElapsedMs, instanceTaskName } from './timerHelpers';

const HOUR_MS = 3_600_000;

/** The daily goal's milestones, each with its own alarm (GOAL_MILESTONE_ID + its index). */
export const GOAL_TIERS = [50, 75, 100, EXCEEDED_TIER] as const;

/** "Writing's timer has been running for 04:00.", as the desktop's reminder says it. */
function longRunBody(task: string, hours: number): string {
  return `${task}'s timer has been running for ${String(hours).padStart(2, '0')}:00.`;
}

/** The long-run reminder: when the running timer reaches `hours` (0: off) of tracked time. */
export function longRunAlarm(sessions: TaskSession[], hours: number, nowMs: number): LaterNotification | null {
  if (hours <= 0) return null;
  for (const session of sessions) {
    const instance = session.timerInstances.find(timer => timer.state === TimerState.running);
    if (!instance) continue;
    const atMs = nowMs - getInstanceElapsedMs(instance, nowMs) + hours * HOUR_MS;
    // Already past it: the reminder was due before (it reminds once a run)
    if (atMs <= nowMs) return null;
    const body = longRunBody(instanceTaskName(instance, session), hours);
    return { id: LONG_RUN_REMINDER_ID, atMs, kind: 'longRun', title: 'Still working?', body };
  }
  return null;
}

/** Today's end-of-day summary at `time` ("18:00"), with the figures it will have then; none once past or with nothing to say. */
export function dailySummaryAlarm({
  sessions,
  tasks,
  goal,
  time,
  nowMs,
}: {
  sessions: TaskSession[];
  tasks: Task[];
  goal: DailyGoal | null;
  time: string;
  nowMs: number;
}): LaterNotification | null {
  const now = new Date(nowMs);
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= nowMs) return null;
  const summary = buildDailySummary({ sessions, tasks, goal, date: formatDateString(now), nowMs: at.getTime() });
  return summary && { id: DAILY_SUMMARY_ID, atMs: at.getTime(), kind: 'dailySummary', ...summaryText(summary) };
}

const summaryText = ({ title, message }: { title: string; message: string }) => ({ title, body: message });

/** The highest tier announced today (older builds stored 101 for "well past it"). */
function announced(goal: DailyGoal, today: string): number {
  if (goal.lastNotificationDate !== today) return 0;
  return goal.lastNotifiedPercent > 100 ? EXCEEDED_TIER : goal.lastNotifiedPercent;
}

/**
 * Today's milestones still to come, one per GOAL_TIERS entry (null: none):
 * when the running timer's earnings reach each, if that's still today. A
 * tier already announced, or already reached (the app announces that one),
 * has none.
 */
export function goalMilestoneAlarms({
  sessions,
  tasks,
  goal,
  nowMs,
}: {
  sessions: TaskSession[];
  tasks: Task[];
  goal: DailyGoal | null;
  nowMs: number;
}): Array<LaterNotification | null> {
  const none = GOAL_TIERS.map(() => null);
  if (!goal?.isEnabled || goal.targetAmount <= 0) return none;
  const today = formatDateString(new Date(nowMs));
  const earned = earningsOnDate(sessions, tasks, today, nowMs);
  // What an hour more of the running timer adds (nothing without one)
  const perHour = earningsOnDate(sessions, tasks, today, nowMs + HOUR_MS) - earned;
  if (perHour <= 0) return none;

  const tomorrow = new Date(nowMs);
  tomorrow.setHours(24, 0, 0, 0);
  const last = announced(goal, today);
  const { targetAmount: target, currency } = goal;
  return GOAL_TIERS.map((tier, index) => {
    const reachedAt = (target * tier) / 100;
    if (tier <= last || earned >= reachedAt) return null;
    const atMs = Math.round(nowMs + ((reachedAt - earned) / perHour) * HOUR_MS);
    if (atMs >= tomorrow.getTime()) return null;
    // As the app words it, the tier before announced by then
    const before = Math.max(last, index === 0 ? 0 : GOAL_TIERS[index - 1]);
    const milestone = nextGoalMilestone({ percent: tier, earned: reachedAt, target, currency }, before);
    return (
      milestone && {
        id: GOAL_MILESTONE_ID + index,
        atMs,
        kind: 'goalMilestone',
        title: milestone.title,
        body: milestone.body,
      }
    );
  });
}
