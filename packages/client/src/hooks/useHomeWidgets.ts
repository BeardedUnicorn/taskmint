/**
 * What the home-screen widgets show (Android): Today (its money and time as
 * Home has them, the daily goal, the live timer) and Payouts (the next
 * withdrawal, the next release). Worked out here, where the money math is,
 * and sent whenever it changes; money in whole dollars and time in minutes,
 * so a running timer sends a new snapshot about once a minute rather than
 * every second (the widget's own clock counts the timer).
 */

import { useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { getBackend } from '../backend';
import type { WidgetSnapshot } from '../backend/types';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useDailyGoalProgress } from '../contexts/DailyGoalProgressContext';
import { periodTotals } from '../components/pages/home/homeTotals';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import { formatDurationCompact } from '../utils/formatters';
import { formatWeekdayDate, formatWeekdayDateTime } from '../utils/locale';
import { formatWholeCents } from '../utils/payoutCalculator';
import { getInstanceElapsedMs, instanceTaskName, mostRecentlyPaused } from '../utils/timerHelpers';
import type { DailyGoalProgressData } from './useDailyGoalProgressMonitor';
import { type PayoutData, usePayoutData } from './usePayoutData';

/** "~$45": an estimate is marked. */
const money = (cents: number, estimated: boolean) => `${estimated ? '~' : ''}${formatWholeCents(cents)}`;

/** The timer running now, else the one paused last in the active session (as the tray and the phone's notification have it). */
function liveTimer(sessions: TaskSession[]): { session: TaskSession; instance: TimerInstance } | null {
  for (const session of sessions) {
    const instance = session.timerInstances.find(timer => timer.state === TimerState.running);
    if (instance) return { session, instance };
  }
  const active = sessions.find(session => session.isActive);
  const paused = active && mostRecentlyPaused(active);
  return active && paused ? { session: active, instance: paused } : null;
}

/** The snapshot, without its time (set when it's sent). */
export function widgetSnapshot(
  payout: Pick<PayoutData, 'cells' | 'today' | 'plan' | 'summary' | 'nowMs'>,
  goal: Pick<DailyGoalProgressData, 'enabled' | 'percent'>,
  sessions: TaskSession[]
): Omit<WidgetSnapshot, 'updatedAtMs'> {
  const totals = periodTotals(payout.cells, payout.today, payout.today);

  const live = liveTimer(sessions);
  const elapsedMs = live ? getInstanceElapsedMs(live.instance, payout.nowMs) : 0;
  const running = live?.instance.state === TimerState.running;
  const timer = live && {
    task: instanceTaskName(live.instance, live.session),
    countingFromMs: running ? payout.nowMs - elapsedMs : null,
    status: running ? null : `Paused at ${formatDurationCompact(elapsedMs)}`,
  };

  const { plan, summary } = payout;
  const nextRelease = summary.nextReleaseDay
    ? `Next release ${formatWeekdayDate(dayjs(summary.nextReleaseDay).toDate())} · ${formatWholeCents(summary.nextReleaseCents)}`
    : null;
  const payouts = plan
    ? {
        amount: money(plan.next.totalCents, plan.next.estimatedCents > 0),
        status: plan.isOpen ? 'Withdrawal open' : `Opens ${formatWeekdayDateTime(plan.opensAtMs)}`,
        opensAtMs: plan.isOpen ? null : plan.opensAtMs,
        nextRelease,
      }
    : { amount: '', status: 'Record a withdrawal in TaskMint to see the next one.', opensAtMs: null, nextRelease };

  return {
    today: {
      money: money(totals.earnedCents, totals.estimatedCents > 0),
      time: formatDurationCompact(totals.timeMs),
      goalPercent: goal.enabled ? Math.round(goal.percent) : null,
    },
    timer,
    payouts,
  };
}

/** Sends the widgets their figures as they change, once the data has loaded. */
export function useHomeWidgets(): void {
  const payout = usePayoutData();
  const goal = useDailyGoalProgress();
  const { sessions } = useSessionManagementContext();
  const ready = !payout.isLoading;
  const snapshot = useMemo(
    () => JSON.stringify(widgetSnapshot(payout, goal, sessions)),
    // The payout data ticks every second while a timer runs; the text
    // only changes once a minute, and only a change is sent
    [payout, goal, sessions]
  );

  useEffect(() => {
    if (!ready) return;
    getBackend().platform.widgets?.update({ updatedAtMs: Date.now(), ...JSON.parse(snapshot) });
  }, [ready, snapshot]);
}
