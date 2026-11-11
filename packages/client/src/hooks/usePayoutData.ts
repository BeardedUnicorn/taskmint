/**
 * Everything the money views show, from the imported ledger, the tracked
 * sessions and the recorded withdrawals: per-day cells, every release, the
 * upcoming schedule, the Payouts cards, how fresh the last import is, the
 * withdrawal plan, and the withdrawal the user scheduled. Computed once for
 * the app (PayoutDataProvider), so the Calendar, Payouts and the tray line
 * always agree. Ticks every second while a timer runs (estimates follow live
 * time), every minute otherwise so "today", releases and the withdrawal
 * opening roll over.
 */

import { createContext, useContext, useMemo } from 'react';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';
import { useWorkLogContext } from '../contexts/WorkLogContext';
import { useFundsReleaseSettings } from './useFundsReleaseSettings';
import { useNowMs } from './useNowMs';
import { useWithdrawalIntervalSetting } from './useWithdrawalIntervalSetting';
import { useWithdrawals } from './useWithdrawals';
import { hasRunningTimer } from '../utils/timerHelpers';
import { formatDateString } from '../utils/dateHelpers';
import {
  PayoutDayCell,
  PayoutMonthGroup,
  PayoutSummary,
  ReleaseEvent,
  ReleaseScheduleRow,
  buildPayoutCells,
  buildReleaseEvents,
  buildReleaseSchedule,
  groupCellsByMonth,
  lastImportMs,
  summarizePayouts,
} from '../utils/payoutCalculator';
import type { PayoutInputs } from '../utils/payoutForecast';
import { DAY_MS, WithdrawalPlan, WithdrawalReminder, planReminder, planWithdrawals } from '../utils/withdrawals';

/** After this long without an import, Payouts says its numbers may be out of date. */
export const STALE_IMPORT_MS = 3 * 24 * 60 * 60 * 1000;

export { lastImportMs } from '../utils/payoutCalculator';

export interface PayoutData {
  fundsReleaseDays: number;
  withdrawalIntervalDays: number;
  nowMs: number;
  /** Today's local YYYY-MM-DD. */
  today: string;
  cells: PayoutDayCell[];
  /** Every release, past and future, soonest first. */
  events: ReleaseEvent[];
  schedule: ReleaseScheduleRow[];
  summary: PayoutSummary;
  monthGroups: PayoutMonthGroup[];
  /** The next withdrawal; null until one is recorded. */
  plan: WithdrawalPlan | null;
  /** The withdrawal the user scheduled, against the plan; null for none. */
  reminder: WithdrawalReminder | null;
  lastImport: number | null;
  importIsStale: boolean;
  isEmpty: boolean;
  /**
   * Sessions or work logs haven't loaded yet, or they or the tasks are still
   * loading, so the numbers may jump.
   */
  isLoading: boolean;
}

export const PayoutDataContext = createContext<PayoutData | null>(null);

/** The app's payout data; provided by PayoutDataProvider. */
export function usePayoutData(): PayoutData {
  const context = useContext(PayoutDataContext);
  if (!context) {
    throw new Error('usePayoutData must be used within a PayoutDataProvider');
  }
  return context;
}

/** What the payout math works from, and whether it's still loading (so the numbers may jump). */
export function usePayoutInputs(): PayoutInputs & { isLoading: boolean } {
  const { sessions, isLoading: sessionsLoading, hasLoaded: sessionsLoaded } = useSessionManagementContext();
  const { tasks, isLoading: tasksLoading } = useTaskManagementContext();
  const { entries, isLoading: workLogsLoading, hasLoaded: workLogsLoaded } = useWorkLogContext();
  const { withdrawals, scheduled } = useWithdrawals();
  const { days: fundsReleaseDays } = useFundsReleaseSettings();
  const { days: withdrawalIntervalDays } = useWithdrawalIntervalSetting();
  return {
    entries,
    sessions,
    tasks,
    withdrawals,
    scheduled,
    fundsReleaseDays,
    withdrawalIntervalDays,
    isLoading:
      !sessionsLoaded ||
      !workLogsLoaded ||
      Boolean(sessionsLoading && sessions.length === 0) ||
      Boolean(tasksLoading) ||
      workLogsLoading,
  };
}

/** The payout data itself. Use once, in PayoutDataProvider. */
export function usePayoutDataState(): PayoutData {
  const { entries, sessions, tasks, withdrawals, scheduled, fundsReleaseDays, withdrawalIntervalDays, isLoading } =
    usePayoutInputs();

  const nowMs = useNowMs(true, hasRunningTimer(sessions) ? 1000 : 60_000);
  const today = formatDateString(new Date(nowMs));

  const cells = useMemo(
    () => buildPayoutCells(entries, sessions, tasks, fundsReleaseDays, nowMs),
    [entries, sessions, tasks, fundsReleaseDays, nowMs]
  );
  const events = useMemo(
    () => buildReleaseEvents(cells, entries, fundsReleaseDays),
    [cells, entries, fundsReleaseDays]
  );
  const schedule = useMemo(() => buildReleaseSchedule(events, nowMs), [events, nowMs]);
  const summary = useMemo(() => summarizePayouts(cells, today, schedule, nowMs), [cells, today, schedule, nowMs]);
  const monthGroups = useMemo(() => groupCellsByMonth(cells), [cells]);
  const plan = useMemo(
    () => planWithdrawals(events, withdrawals, withdrawalIntervalDays * DAY_MS, nowMs),
    [events, withdrawals, withdrawalIntervalDays, nowMs]
  );
  const reminder = useMemo(() => planReminder(scheduled, plan, events), [scheduled, plan, events]);

  const lastImport = lastImportMs(entries);
  return {
    fundsReleaseDays,
    withdrawalIntervalDays,
    nowMs,
    today,
    cells,
    events,
    schedule,
    summary,
    monthGroups,
    plan,
    reminder,
    lastImport,
    importIsStale: lastImport !== null && nowMs - lastImport > STALE_IMPORT_MS,
    isEmpty: entries.length === 0 && cells.length === 0,
    isLoading,
  };
}
