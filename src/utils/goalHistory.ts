/**
 * Goal History
 *
 * The Reports "Daily Goal Achievements" rows. Each day's target comes from
 * the record saved that day (so a later target change doesn't rewrite it),
 * or the current goal for days without one. The earned amount is always
 * recomputed from tracked time with the shared earnings rules, so edits,
 * Add time and work-log imports correct past days.
 */

import { DailyGoal, DailyGoalAchievement } from '../types/goal';
import { Task } from '../types/task';
import { TimeEntry } from '../types/timer';
import { entryEarnings } from './earnings';

export interface GoalHistoryInput {
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string; // YYYY-MM-DD, inclusive
  timeEntries: TimeEntry[];
  tasks: Task[];
  /** Saved day records; only their target (goalAmount) is used. */
  records: DailyGoalAchievement[];
  currentGoal: DailyGoal | null;
  nowMs?: number;
}

export function buildGoalHistory({
  startDate,
  endDate,
  timeEntries,
  tasks,
  records,
  currentGoal,
  nowMs = Date.now(),
}: GoalHistoryInput): DailyGoalAchievement[] {
  const inRange = (day: string) => day >= startDate && day <= endDate;

  const earnedByDay = new Map<string, number>();
  for (const entry of timeEntries) {
    if (!entry.date || !inRange(entry.date) || !entry.duration) continue;
    earnedByDay.set(entry.date, (earnedByDay.get(entry.date) ?? 0) + entryEarnings(entry, tasks));
  }

  const recordByDay = new Map(records.filter(r => inRange(r.date)).map(r => [r.date, r]));
  const currentTarget =
    currentGoal?.isEnabled && currentGoal.targetAmount > 0 ? currentGoal.targetAmount : 0;

  const days = new Set([...earnedByDay.keys(), ...recordByDay.keys()]);
  const rows: DailyGoalAchievement[] = [];
  for (const day of days) {
    const record = recordByDay.get(day);
    const goalAmount = record?.goalAmount && record.goalAmount > 0 ? record.goalAmount : currentTarget;
    if (goalAmount <= 0) continue;

    const earnedAmount = Math.round((earnedByDay.get(day) ?? 0) * 100) / 100;
    const percentageAchieved = (earnedAmount / goalAmount) * 100;
    rows.push({
      id: record?.id ?? `day_${day}`,
      date: day,
      goalAmount,
      earnedAmount,
      currency: record?.currency ?? currentGoal?.currency ?? 'USD',
      percentageAchieved,
      status: percentageAchieved > 100 ? 'exceeded' : percentageAchieved >= 100 ? 'hit' : 'missed',
      difference: earnedAmount - goalAmount,
      recordedAt: record?.recordedAt ?? new Date(nowMs).toISOString(),
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
