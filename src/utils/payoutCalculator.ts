/**
 * Payout Calculator
 *
 * Merges the imported work-log ledger (authoritative cents) with tracked
 * sessions (rate-based estimates for days not yet imported) into per-day
 * cells, and derives the Payouts page aggregates. Money earned on workDay D
 * becomes available on D + fundsReleaseDays; site statuses are informational
 * only.
 */

import dayjs from 'dayjs';
import { Task } from '../types/task';
import { TaskSession } from '../types/timer';
import { WorkLogEntry } from '../types/workLog';
import { formatDateString, parseDateStringLocal } from './dateHelpers';
import { effectiveMinutes } from './workLogImport';
import { getInstanceDateString, getSessionElapsedMsOnDate } from './timerHelpers';

const MS_PER_HOUR = 3_600_000;

export interface PayoutDayCell {
  workDay: string;
  taskId: string;
  taskName: string;
  /** Imported cents: timed entries (when any exist) plus workLog entries. */
  actualCents: number;
  /** Rate-based estimate; only when the (task, day) has no timed import. */
  estimatedCents: number;
  trackedMs: number;
  importedMinutes: number;
  /** Distinct site statuses on the day's entries, informational. */
  statuses: string[];
  /** workDay + fundsReleaseDays (local calendar days). */
  releaseDay: string;
  isEstimate: boolean;
}

function addDays(dateStr: string, days: number): string {
  return formatDateString(dayjs(parseDateStringLocal(dateStr)).add(days, 'day').toDate());
}

function cellKey(taskId: string, workDay: string): string {
  return `${taskId} ${workDay}`;
}

/**
 * Build one cell per (task, local day) across the ledger and the tracked
 * sessions. Rule per cell: any timed import makes the day actual (its cents
 * replace the estimate); otherwise tracked time × the task's hourlyRate is
 * shown as an estimate. workLog (no-time) cents always count as actuals on
 * their day. Cells with no money and no tracked time are dropped.
 */
export function buildPayoutCells(
  entries: WorkLogEntry[],
  sessions: TaskSession[],
  tasks: Task[],
  fundsReleaseDays: number,
  nowMs: number
): PayoutDayCell[] {
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const keys = new Map<string, { taskId: string; workDay: string; ledgerTaskName?: string }>();

  for (const entry of entries) {
    const key = cellKey(entry.taskId, entry.workDay);
    if (!keys.has(key)) {
      keys.set(key, { taskId: entry.taskId, workDay: entry.workDay, ledgerTaskName: entry.taskName });
    }
  }
  for (const session of sessions) {
    for (const instance of session.timerInstances) {
      const workDay = getInstanceDateString(instance, session.date);
      if (!workDay) continue;
      const key = cellKey(session.taskId, workDay);
      if (!keys.has(key)) {
        keys.set(key, { taskId: session.taskId, workDay });
      }
    }
  }

  const cells: PayoutDayCell[] = [];
  for (const { taskId, workDay, ledgerTaskName } of keys.values()) {
    const forKey = entries.filter(e => e.taskId === taskId && e.workDay === workDay);
    const timed = forKey.filter(e => e.kind === 'timed');
    const workLogCents = forKey
      .filter(e => e.kind === 'workLog')
      .reduce((sum, e) => sum + e.amountCents, 0);
    const timedCents = timed.reduce((sum, e) => sum + e.amountCents, 0);
    const importedMinutes = timed.reduce((sum, e) => sum + effectiveMinutes(e), 0);

    let trackedMs = 0;
    for (const session of sessions) {
      if (session.taskId !== taskId) continue;
      trackedMs += getSessionElapsedMsOnDate(session, workDay, nowMs);
    }

    const task = taskById.get(taskId);
    const hasTimedImport = timed.length > 0;
    let estimatedCents = 0;
    if (!hasTimedImport && trackedMs > 0 && task?.hourlyRate && task.hourlyRate > 0) {
      estimatedCents = Math.round((trackedMs / MS_PER_HOUR) * task.hourlyRate * 100);
    }
    const actualCents = (hasTimedImport ? timedCents : 0) + workLogCents;

    if (actualCents === 0 && estimatedCents === 0 && trackedMs === 0 && forKey.length === 0) {
      continue;
    }

    cells.push({
      workDay,
      taskId,
      taskName: task?.name ?? ledgerTaskName ?? '',
      actualCents,
      estimatedCents,
      trackedMs,
      importedMinutes,
      statuses: [...new Set(forKey.map(e => e.status).filter(Boolean))],
      releaseDay: addDays(workDay, fundsReleaseDays),
      isEstimate: !hasTimedImport && estimatedCents > 0,
    });
  }

  return cells.sort(
    (a, b) => b.workDay.localeCompare(a.workDay) || a.taskName.localeCompare(b.taskName)
  );
}

export interface PayoutSummary {
  /** Imported cents whose release day has arrived (releaseDay <= today). */
  availableCents: number;
  /** Imported cents still inside the release window. */
  pendingCents: number;
  /** All estimate cents (days not yet imported), regardless of release day. */
  estimatedCents: number;
  /** Next future day money is released, actuals or estimates. */
  nextReleaseDay: string | null;
  nextReleaseCents: number;
}

export function summarizePayouts(cells: PayoutDayCell[], todayStr: string): PayoutSummary {
  let availableCents = 0;
  let pendingCents = 0;
  let estimatedCents = 0;
  const futureByDay = new Map<string, number>();

  for (const cell of cells) {
    // YYYY-MM-DD strings compare correctly as strings.
    if (cell.releaseDay <= todayStr) {
      availableCents += cell.actualCents;
    } else {
      pendingCents += cell.actualCents;
      const dayCents = cell.actualCents + cell.estimatedCents;
      if (dayCents > 0) {
        futureByDay.set(cell.releaseDay, (futureByDay.get(cell.releaseDay) ?? 0) + dayCents);
      }
    }
    estimatedCents += cell.estimatedCents;
  }

  const nextReleaseDay = [...futureByDay.keys()].sort()[0] ?? null;
  return {
    availableCents,
    pendingCents,
    estimatedCents,
    nextReleaseDay,
    nextReleaseCents: nextReleaseDay ? futureByDay.get(nextReleaseDay)! : 0,
  };
}

export interface ReleaseScheduleRow {
  releaseDay: string;
  actualCents: number;
  estimatedCents: number;
}

/** Upcoming releases (strictly after today), grouped by release day, ascending. */
export function buildReleaseSchedule(
  cells: PayoutDayCell[],
  todayStr: string
): ReleaseScheduleRow[] {
  const byDay = new Map<string, ReleaseScheduleRow>();
  for (const cell of cells) {
    if (cell.releaseDay <= todayStr) continue;
    if (cell.actualCents === 0 && cell.estimatedCents === 0) continue;
    const row = byDay.get(cell.releaseDay) ?? {
      releaseDay: cell.releaseDay,
      actualCents: 0,
      estimatedCents: 0,
    };
    row.actualCents += cell.actualCents;
    row.estimatedCents += cell.estimatedCents;
    byDay.set(cell.releaseDay, row);
  }
  return [...byDay.values()].sort((a, b) => a.releaseDay.localeCompare(b.releaseDay));
}

/** Convert ledger cents to the float dollars formatCurrency expects. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
