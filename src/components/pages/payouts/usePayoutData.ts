/**
 * Everything the Payouts page shows, from the imported ledger and the tracked
 * sessions: per-day cells, the release schedule, the summary cards, and how
 * fresh the last import is. Ticks every second while a timer runs (estimates
 * follow live time), every minute otherwise so "today" rolls over.
 */

import { useMemo } from 'react';
import { useSessionManagementContext } from '../../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../../contexts/TaskManagementContext';
import { useWorkLogContext } from '../../../contexts/WorkLogContext';
import { useFundsReleaseSettings } from '../../../hooks/useFundsReleaseSettings';
import { useNowMs } from '../../../hooks/useNowMs';
import { hasRunningTimer } from '../../../utils/timerHelpers';
import { formatDateString } from '../../../utils/dateHelpers';
import {
  buildPayoutCells,
  buildReleaseSchedule,
  groupCellsByMonth,
  summarizePayouts,
} from '../../../utils/payoutCalculator';

/** After this long without an import, Payouts says its numbers may be out of date. */
export const STALE_IMPORT_MS = 3 * 24 * 60 * 60 * 1000;

/** When the ledger was last refreshed from the site (newest entry update). */
export function lastImportMs(entries: { updatedAt: string }[]): number | null {
  let latest: number | null = null;
  for (const entry of entries) {
    const ms = Date.parse(entry.updatedAt);
    if (!Number.isNaN(ms) && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

export function usePayoutData() {
  const { sessions } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  const { entries } = useWorkLogContext();
  const { days: fundsReleaseDays } = useFundsReleaseSettings();

  const nowMs = useNowMs(true, hasRunningTimer(sessions) ? 1000 : 60_000);
  const today = formatDateString(new Date(nowMs));

  const cells = useMemo(
    () => buildPayoutCells(entries, sessions, tasks, fundsReleaseDays, nowMs),
    [entries, sessions, tasks, fundsReleaseDays, nowMs]
  );
  const schedule = useMemo(
    () => buildReleaseSchedule(cells, today, entries, fundsReleaseDays, nowMs),
    [cells, today, entries, fundsReleaseDays, nowMs]
  );
  const summary = useMemo(() => summarizePayouts(cells, today, schedule, nowMs), [cells, today, schedule, nowMs]);
  const monthGroups = useMemo(() => groupCellsByMonth(cells), [cells]);

  const lastImport = lastImportMs(entries);
  return {
    fundsReleaseDays,
    today,
    cells,
    schedule,
    summary,
    monthGroups,
    lastImport,
    importIsStale: lastImport !== null && nowMs - lastImport > STALE_IMPORT_MS,
    isEmpty: entries.length === 0 && cells.length === 0,
  };
}
