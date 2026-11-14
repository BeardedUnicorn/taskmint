/**
 * Sends the home-screen widgets (Android) what they show: Today, Payouts,
 * the Calendar agenda and the This week chart (widgets/widgetSnapshot).
 * Worked out here, where the money math is, and sent only when its text
 * changes: money in whole dollars and time in minutes, so a running timer
 * sends a new snapshot about once a minute rather than every second (the
 * widget's own clock counts the timer).
 */

import { useEffect, useMemo } from 'react';
import { getBackend } from '../backend';
import { goalForDay } from '../components/pages/calendar/calendarMonth';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useDailyGoalProgress } from '../contexts/DailyGoalProgressContext';
import { widgetSnapshot } from '../widgets/widgetSnapshot';
import { useDailyGoals } from './useDailyGoals';
import { usePayoutData } from './usePayoutData';
import { useWithdrawals } from './useWithdrawals';

/** Sends the widgets their figures as they change, once the data has loaded. */
export function useHomeWidgets(): void {
  const payout = usePayoutData();
  const goal = useDailyGoalProgress();
  const { sessions } = useSessionManagementContext();
  const { withdrawals } = useWithdrawals();
  const { currentGoal, achievements } = useDailyGoals();
  const goalFor = useMemo(() => goalForDay(achievements, currentGoal), [achievements, currentGoal]);
  const ready = !payout.isLoading;
  const snapshot = useMemo(
    () => JSON.stringify(widgetSnapshot({ payout, goal, sessions, withdrawals, goalFor })),
    // The payout data ticks every second while a timer runs; the text
    // only changes about once a minute, and only a change is sent
    [payout, goal, sessions, withdrawals, goalFor]
  );

  useEffect(() => {
    if (!ready) return;
    getBackend().platform.widgets?.update({ updatedAtMs: Date.now(), ...JSON.parse(snapshot) });
  }, [ready, snapshot]);
}
