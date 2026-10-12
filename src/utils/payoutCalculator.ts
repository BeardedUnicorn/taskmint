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
      const latestTimed = timed.reduce((latest, e) => {
        if (!latest) return e;
        return e.createdAt > latest.createdAt ? e : latest;
      }, timed[0]);
      if (
        latestTimed?.createdAt &&
        !isNaN(Date.parse(latestTimed.createdAt)) &&
        isValidCreatedAtForWorkDay(latestTimed.createdAt, workDay)
      ) {
        const d = dayjs(latestTimed.createdAt).add(fundsReleaseDays, 'day');
        releaseDay = formatDateString(d.toDate());
        releaseTime = d.local().format('h:mm A');
        releaseIso = d.toISOString();
      }
    } else {
      let latestInstanceTimeMs: number | null = null;
      for (const session of sessions) {
        if (session.taskId !== taskId) continue;
        for (const instance of session.timerInstances) {
          const instWorkDay = getInstanceDateString(instance, session.date);
          if (instWorkDay !== workDay) continue;
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

export function summarizePayouts(
  cells: PayoutDayCell[],
  todayStr: string,
  schedule?: ReleaseScheduleRow[],
  nowMs: number = Date.now()
): PayoutSummary {
  let availableCents = 0;
  let overduePendingCents = 0;

  for (const cell of cells) {
    // Available now card: only include Untransferred, never Paid or Pending Approval
    availableCents += cell.untransferredCents ?? 0;

    const nonPending = (cell.untransferredCents ?? 0) + (cell.paidCents ?? 0);
    const pendingActual = (cell.untransferredCents !== undefined || cell.paidCents !== undefined)
      ? Math.max(0, cell.actualCents - nonPending)
      : (cell.releaseDay > todayStr ? cell.actualCents : 0);

    const isFuture = cell.releaseIso
      ? new Date(cell.releaseIso).getTime() > nowMs
      : cell.releaseDay > todayStr;

    if (!isFuture && pendingActual > 0) {
      overduePendingCents += pendingActual;
    }
  }

  let pendingCents = 0;
  let estimatedCents = 0;
  let nextReleaseDay: string | null = null;
  let nextReleaseCents = 0;

  if (schedule) {
    pendingCents = schedule.reduce((sum, row) => sum + row.actualCents, 0);
    estimatedCents = schedule.reduce((sum, row) => sum + row.estimatedCents, 0);
    if (schedule.length > 0) {
      nextReleaseDay = schedule[0].releaseDay;
      const nextDayRows = schedule.filter(r => r.releaseDay === schedule[0].releaseDay);
      nextReleaseCents = nextDayRows.reduce((sum, r) => sum + r.actualCents + r.estimatedCents, 0);
    }
  } else {
    const futureByDay = new Map<string, number>();
    for (const cell of cells) {
      const nonPending = (cell.untransferredCents ?? 0) + (cell.paidCents ?? 0);
      const pendingActual = (cell.untransferredCents !== undefined || cell.paidCents !== undefined)
        ? Math.max(0, cell.actualCents - nonPending)
        : (cell.releaseDay > todayStr ? cell.actualCents : 0);

      const isFuture = cell.releaseIso
        ? new Date(cell.releaseIso).getTime() > nowMs
        : cell.releaseDay > todayStr;

      if (isFuture) {
        pendingCents += pendingActual;
        estimatedCents += cell.estimatedCents;
        const dayCents = pendingActual + cell.estimatedCents;
        if (dayCents > 0) {
          futureByDay.set(cell.releaseDay, (futureByDay.get(cell.releaseDay) ?? 0) + dayCents);
        }
      }
    }
    nextReleaseDay = [...futureByDay.keys()].sort()[0] ?? null;
    nextReleaseCents = nextReleaseDay ? futureByDay.get(nextReleaseDay)! : 0;
  }

  return {
    availableCents,
    pendingCents,
    estimatedCents,
    nextReleaseDay,
    nextReleaseCents,
    overduePendingCents,
  };
}

export interface ReleaseScheduleRow {
  releaseDay: string;
  releaseTime?: string;
  releaseIso?: string;
  actualCents: number;
  estimatedCents: number;
}

/**
 * Upcoming releases (strictly after now / today).
 * Includes release time under release date, and does not group on date.
 */
export function buildReleaseSchedule(
  cells: PayoutDayCell[],
  todayStr: string,
  entries?: WorkLogEntry[],
  fundsReleaseDays: number = 7,
  nowMs: number = Date.now()
): ReleaseScheduleRow[] {
  if (entries && entries.length > 0) {
    const byKey = new Map<string, ReleaseScheduleRow>();

    // 1. Process imported entries that are pending release (not Paid, not Untransferred)
    for (const entry of entries) {
      if (isPaid(entry.status) || isUntransferred(entry.status)) continue;
      if (entry.amountCents <= 0) continue;

      let releaseDay: string;
      let releaseTime: string | undefined;
      let releaseIso: string | undefined;
      let releaseMs: number;

      if (
        entry.createdAt &&
        !isNaN(Date.parse(entry.createdAt)) &&
        isValidCreatedAtForWorkDay(entry.createdAt, entry.workDay)
      ) {
        const releaseDate = dayjs(entry.createdAt).add(fundsReleaseDays, 'day');
        releaseMs = releaseDate.valueOf();
        releaseDay = formatDateString(releaseDate.toDate());
        releaseTime = releaseDate.local().format('h:mm A');
        releaseIso = releaseDate.toISOString();
      } else {
        releaseDay = addDays(entry.workDay, fundsReleaseDays);
        releaseMs = dayjs(parseDateStringLocal(releaseDay)).valueOf();
      }

      if (releaseMs <= nowMs) continue;

      const key = releaseTime ? `${releaseDay} ${releaseTime}` : releaseDay;
      const existing = byKey.get(key) ?? {
        releaseDay,
        releaseTime,
        releaseIso,
        actualCents: 0,
        estimatedCents: 0,
      };
      existing.actualCents += entry.amountCents;
      byKey.set(key, existing);
    }

    // 2. Process estimate cells (days with tracked time but no timed import)
    for (const cell of cells) {
      if (!cell.isEstimate || cell.estimatedCents <= 0) continue;
      const isFuture = cell.releaseIso
        ? new Date(cell.releaseIso).getTime() > nowMs
        : cell.releaseDay > todayStr;
      if (!isFuture) continue;

      const key = cell.releaseTime ? `${cell.releaseDay} ${cell.releaseTime}` : cell.releaseDay;
      const existing = byKey.get(key) ?? {
        releaseDay: cell.releaseDay,
        releaseTime: cell.releaseTime,
        releaseIso: cell.releaseIso,
        actualCents: 0,
        estimatedCents: 0,
      };
      existing.estimatedCents += cell.estimatedCents;
      byKey.set(key, existing);
    }

    return [...byKey.values()].sort((a, b) => {
      if (a.releaseIso && b.releaseIso) {
        return a.releaseIso.localeCompare(b.releaseIso);
      }
      const dayComp = a.releaseDay.localeCompare(b.releaseDay);
      if (dayComp !== 0) return dayComp;
      return (a.releaseTime ?? '').localeCompare(b.releaseTime ?? '');
    });
  }

  // Fallback: build from cells (used when entries are not passed or empty)
  const byKey = new Map<string, ReleaseScheduleRow>();
  for (const cell of cells) {
    const isFuture = cell.releaseIso
      ? new Date(cell.releaseIso).getTime() > nowMs
      : cell.releaseDay > todayStr;
    if (!isFuture) continue;

    const nonPending = (cell.untransferredCents ?? 0) + (cell.paidCents ?? 0);
    const pendingActual = Math.max(0, cell.actualCents - nonPending);
    const hasMoney = (cell.untransferredCents !== undefined || cell.paidCents !== undefined)
      ? (pendingActual > 0 || cell.estimatedCents > 0)
      : (cell.actualCents > 0 || cell.estimatedCents > 0);
    if (!hasMoney) continue;

    const actualToAdd = (cell.untransferredCents !== undefined || cell.paidCents !== undefined)
      ? pendingActual
      : cell.actualCents;

    const key = cell.releaseTime ? `${cell.releaseDay} ${cell.releaseTime}` : cell.releaseDay;
    const row = byKey.get(key) ?? {
      releaseDay: cell.releaseDay,
      releaseTime: cell.releaseTime,
      releaseIso: cell.releaseIso,
      actualCents: 0,
      estimatedCents: 0,
    };
    row.actualCents += actualToAdd;
    row.estimatedCents += cell.estimatedCents;
    byKey.set(key, row);
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.releaseIso && b.releaseIso) {
      return a.releaseIso.localeCompare(b.releaseIso);
    }
    const dayComp = a.releaseDay.localeCompare(b.releaseDay);
    if (dayComp !== 0) return dayComp;
    return (a.releaseTime ?? '').localeCompare(b.releaseTime ?? '');
  });
}

/** Convert ledger cents to the float dollars formatCurrency expects. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
