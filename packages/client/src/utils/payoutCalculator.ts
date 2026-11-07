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
import { getInstanceDateString, getInstanceElapsedMs, getTimersOnDate, instanceTaskId } from './timerHelpers';
import { earningsForMs, instanceRate } from './earnings';
import { formatCurrency } from './formatters';

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
  /** Formatted release time (e.g. "2:30 PM"). */
  releaseTime?: string;
  /** ISO timestamp of release (for exact sorting). */
  releaseIso?: string;
  isEstimate: boolean;
  /** Imported cents with status 'Untransferred'. */
  untransferredCents: number;
  /** Imported cents with status 'Paid'. */
  paidCents: number;
}

export function isUntransferred(status?: string | null): boolean {
  return typeof status === 'string' && status.trim().toLowerCase() === 'untransferred';
}

export function isPaid(status?: string | null): boolean {
  return typeof status === 'string' && status.trim().toLowerCase() === 'paid';
}

function addDays(dateStr: string, days: number): string {
  return formatDateString(dayjs(parseDateStringLocal(dateStr)).add(days, 'day').toDate());
}

function isValidCreatedAtForWorkDay(createdAtIso: string, workDay: string): boolean {
  const createdMs = Date.parse(createdAtIso);
  if (isNaN(createdMs)) return false;
  const workDayMs = parseDateStringLocal(workDay).getTime();
  const diffMs = createdMs - workDayMs;
  return diffMs >= -86_400_000 && diffMs <= 3 * 86_400_000;
}

function cellKey(taskId: string, workDay: string): string {
  return `${taskId} ${workDay}`;
}

/**
 * Build one cell per (task, local day) across the ledger and the tracked
 * sessions. Rule per cell: any timed import makes the day actual (its cents
 * replace the estimate); otherwise tracked time × each timer's rate (see
 * utils/earnings) is shown as an estimate. workLog (no-time) cents always count as actuals on
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
      const taskId = instanceTaskId(instance, session);
      const key = cellKey(taskId, workDay);
      if (!keys.has(key)) {
        keys.set(key, { taskId, workDay });
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

    // Each timer earns at its own rate, so a task rate changed later doesn't
    // move an earlier day's estimate.
    let trackedMs = 0;
    let estimatedDollars = 0;
    for (const session of sessions) {
      for (const instance of getTimersOnDate(session, workDay)) {
        if (instanceTaskId(instance, session) !== taskId) continue;
        const ms = getInstanceElapsedMs(instance, nowMs);
        trackedMs += ms;
        estimatedDollars += earningsForMs(ms, instanceRate(instance, session, tasks));
      }
    }

    const task = taskById.get(taskId);
    const hasTimedImport = timed.length > 0;
    const estimatedCents = hasTimedImport ? 0 : Math.round(estimatedDollars * 100);
    const actualCents = (hasTimedImport ? timedCents : 0) + workLogCents;

    if (actualCents === 0 && estimatedCents === 0 && trackedMs === 0 && forKey.length === 0) {
      continue;
    }

    const untransferredTimedCents = timed
      .filter(e => isUntransferred(e.status))
      .reduce((sum, e) => sum + e.amountCents, 0);
    const untransferredWorkLogCents = forKey
      .filter(e => e.kind === 'workLog' && isUntransferred(e.status))
      .reduce((sum, e) => sum + e.amountCents, 0);
    const untransferredCents = (hasTimedImport ? untransferredTimedCents : 0) + untransferredWorkLogCents;

    const paidTimedCents = timed
      .filter(e => isPaid(e.status))
      .reduce((sum, e) => sum + e.amountCents, 0);
    const paidWorkLogCents = forKey
      .filter(e => e.kind === 'workLog' && isPaid(e.status))
      .reduce((sum, e) => sum + e.amountCents, 0);
    const paidCents = (hasTimedImport ? paidTimedCents : 0) + paidWorkLogCents;

    let releaseDay = addDays(workDay, fundsReleaseDays);
    let releaseTime: string | undefined;
    let releaseIso: string | undefined;
    if (hasTimedImport) {
      const latestTimed = timed.reduce((latest, e) => (e.createdAt > latest.createdAt ? e : latest));
      if (isValidCreatedAtForWorkDay(latestTimed.createdAt, workDay)) {
        const d = dayjs(latestTimed.createdAt).add(fundsReleaseDays, 'day');
        releaseDay = formatDateString(d.toDate());
        releaseTime = d.local().format('h:mm A');
        releaseIso = d.toISOString();
      }
    } else {
      let latestInstanceTimeMs: number | null = null;
      for (const session of sessions) {
        for (const instance of getTimersOnDate(session, workDay)) {
          if (instanceTaskId(instance, session) !== taskId) continue;
          const endMs = instance.endTime ? new Date(instance.endTime).getTime() : nowMs;
          if (latestInstanceTimeMs === null || endMs > latestInstanceTimeMs) {
            latestInstanceTimeMs = endMs;
          }
        }
      }
      if (latestInstanceTimeMs !== null) {
        const d = dayjs(latestInstanceTimeMs).add(fundsReleaseDays, 'day');
        releaseDay = formatDateString(d.toDate());
        releaseTime = d.local().format('h:mm A');
        releaseIso = d.toISOString();
      }
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
      releaseDay,
      releaseTime,
      releaseIso,
      isEstimate: !hasTimedImport && estimatedCents > 0,
      untransferredCents,
      paidCents,
    });
  }

  return cells.sort(
    (a, b) => b.workDay.localeCompare(a.workDay) || a.taskName.localeCompare(b.taskName)
  );
}

/** "$1,234.00 + ~$80.00": imported amounts, then estimates; "—" for none. */
export function formatPayoutAmount(actualCents: number, estimatedCents: number): string {
  const parts = [
    actualCents > 0 && formatCurrency(centsToDollars(actualCents)),
    estimatedCents > 0 && `~${formatCurrency(centsToDollars(estimatedCents))}`,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' + ') : '—';
}

/** A month of reconciliation rows with its totals (Payouts groups by month). */
export interface PayoutMonthGroup {
  /** YYYY-MM */
  month: string;
  cells: PayoutDayCell[];
  trackedMs: number;
  importedMinutes: number;
  actualCents: number;
  estimatedCents: number;
}

/** Cells grouped by their work day's month, newest month first; cell order kept. */
export function groupCellsByMonth(cells: PayoutDayCell[]): PayoutMonthGroup[] {
  const byMonth = new Map<string, PayoutMonthGroup>();
  for (const cell of cells) {
    const month = cell.workDay.slice(0, 7);
    let group = byMonth.get(month);
    if (!group) {
      group = { month, cells: [], trackedMs: 0, importedMinutes: 0, actualCents: 0, estimatedCents: 0 };
      byMonth.set(month, group);
    }
    group.cells.push(cell);
    group.trackedMs += cell.trackedMs;
    group.importedMinutes += cell.importedMinutes;
    group.actualCents += cell.actualCents;
    group.estimatedCents += cell.estimatedCents;
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export interface PayoutSummary {
  /** Imported cents with status 'Untransferred'. */
  availableCents: number;
  /** Imported cents still inside the release window (not Paid, not Untransferred). */
  pendingCents: number;
  /** All estimate cents (days not yet imported), regardless of release day. */
  estimatedCents: number;
  /** Next future day money is released, actuals or estimates. */
  nextReleaseDay: string | null;
  nextReleaseCents: number;
  /** Imported cents with status 'Pending Approval' whose expected release date has passed. */
  overduePendingCents: number;
}

/** Whether a cell's money is released after now (by its exact time when it has one). */
function isFutureRelease(cell: PayoutDayCell, todayStr: string, nowMs: number): boolean {
  return cell.releaseIso ? new Date(cell.releaseIso).getTime() > nowMs : cell.releaseDay > todayStr;
}

/**
 * The Payouts cards: what's available now and overdue (from the cells), and
 * what's pending and released next (from `schedule`, buildReleaseSchedule's
 * rows for the same cells).
 */
export function summarizePayouts(
  cells: PayoutDayCell[],
  todayStr: string,
  schedule: ReleaseScheduleRow[],
  nowMs: number = Date.now()
): PayoutSummary {
  let availableCents = 0;
  let overduePendingCents = 0;
  for (const cell of cells) {
    // Available now: Untransferred only, never Paid or Pending Approval
    availableCents += cell.untransferredCents;
    // Imported money neither available nor paid is pending; past its release, it's overdue
    if (!isFutureRelease(cell, todayStr, nowMs)) {
      overduePendingCents += Math.max(0, cell.actualCents - cell.untransferredCents - cell.paidCents);
    }
  }

  const nextReleaseDay = schedule[0]?.releaseDay ?? null;
  const sum = (rows: ReleaseScheduleRow[], pick: (row: ReleaseScheduleRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  return {
    availableCents,
    pendingCents: sum(schedule, row => row.actualCents),
    estimatedCents: sum(schedule, row => row.estimatedCents),
    nextReleaseDay,
    nextReleaseCents: sum(
      schedule.filter(row => row.releaseDay === nextReleaseDay),
      row => row.actualCents + row.estimatedCents
    ),
    overduePendingCents,
  };
}

export interface ReleaseScheduleRow {
  releaseDay: string;
  releaseTime?: string;
  releaseIso?: string;
  /** When it's released, to order the rows (local midnight for a row without a time). */
  releaseMs: number;
  actualCents: number;
  estimatedCents: number;
}

/** When an imported entry's money is released: its report time plus the release days, else its day's. */
function entryRelease(entry: WorkLogEntry, fundsReleaseDays: number): ReleaseScheduleRow {
  if (isValidCreatedAtForWorkDay(entry.createdAt, entry.workDay)) {
    const release = dayjs(entry.createdAt).add(fundsReleaseDays, 'day');
    return {
      releaseDay: formatDateString(release.toDate()),
      releaseTime: release.local().format('h:mm A'),
      releaseIso: release.toISOString(),
      releaseMs: release.valueOf(),
      actualCents: 0,
      estimatedCents: 0,
    };
  }
  const releaseDay = addDays(entry.workDay, fundsReleaseDays);
  return {
    releaseDay,
    releaseMs: parseDateStringLocal(releaseDay).getTime(),
    actualCents: 0,
    estimatedCents: 0,
  };
}

/**
 * Upcoming releases (strictly after now), soonest first, one row per release
 * time: imported money still pending (not Paid, not Untransferred), and the
 * estimates of days not imported yet.
 */
export function buildReleaseSchedule(
  cells: PayoutDayCell[],
  todayStr: string,
  entries: WorkLogEntry[],
  fundsReleaseDays: number = 7,
  nowMs: number = Date.now()
): ReleaseScheduleRow[] {
  const byKey = new Map<string, ReleaseScheduleRow>();
  const rowFor = (release: ReleaseScheduleRow): ReleaseScheduleRow => {
    const key = release.releaseTime ? `${release.releaseDay} ${release.releaseTime}` : release.releaseDay;
    const row = byKey.get(key) ?? release;
    byKey.set(key, row);
    return row;
  };

  for (const entry of entries) {
    if (isPaid(entry.status) || isUntransferred(entry.status) || entry.amountCents <= 0) continue;
    const release = entryRelease(entry, fundsReleaseDays);
    if (release.releaseMs <= nowMs) continue;
    rowFor(release).actualCents += entry.amountCents;
  }

  // An estimate cell has tracked time on its day, so its release has an exact time
  for (const cell of cells) {
    if (!cell.isEstimate || !isFutureRelease(cell, todayStr, nowMs)) continue;
    const { releaseDay, releaseTime, releaseIso } = cell;
    rowFor({ releaseDay, releaseTime, releaseIso, releaseMs: Date.parse(String(releaseIso)), actualCents: 0, estimatedCents: 0 })
      .estimatedCents += cell.estimatedCents;
  }

  return [...byKey.values()].sort((a, b) => a.releaseMs - b.releaseMs);
}

/** Convert ledger cents to the float dollars formatCurrency expects. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
