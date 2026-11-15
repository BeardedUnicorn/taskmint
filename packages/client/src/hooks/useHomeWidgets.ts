/**
 * Sends the home-screen widgets (Android) what they show: Today, Payouts,
 * the Calendar agenda and the This week chart (widgets/widgetSnapshot).
 * Worked out here, where the money math is, and sent only when its text
 * changes: money in whole dollars and time in minutes, so a running timer
 * sends a new snapshot about once a minute rather than every second (the
 * widget's own clock counts the timer).
 *
 * With cloud sync, every device (the desktop and the web app too) also
 * publishes them (widgets/publishedWidgets), so a phone with TaskMint closed
 * shows what happened on another device: a running timer's growing figures
 * only every quarter of an hour, a change to the timer or the day at once.
 */

import { useEffect, useMemo, useRef } from 'react';
import { getBackend } from '../backend';
import { getCloudSync } from '../cloud';
import { goalForDay } from '../components/pages/calendar/calendarMonth';
import { useSessionManagementContext } from '../contexts/SessionManagementContext';
import { useDailyGoalProgress } from '../contexts/DailyGoalProgressContext';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';
import { useNotificationPreferences } from '../notifications/preferences';
import { deviceZone } from '../utils/payoutForecast';
import { type PublishedMark, publishedWidgets, widgetsDue } from '../widgets/publishedWidgets';
import { widgetSnapshot } from '../widgets/widgetSnapshot';
import { useDailyGoals } from './useDailyGoals';
import { usePayoutData } from './usePayoutData';
import { useWithdrawals } from './useWithdrawals';

/** Sends the widgets their figures as they change, once the data has loaded. */
export function useHomeWidgets(): void {
  const payout = usePayoutData();
  const goal = useDailyGoalProgress();
  const { sessions } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  const { withdrawals } = useWithdrawals();
  const { currentGoal, achievements } = useDailyGoals();
  const goalFor = useMemo(() => goalForDay(achievements, currentGoal), [achievements, currentGoal]);
  const ready = !payout.isLoading;
  const snapshot = useMemo(
    () => JSON.stringify(widgetSnapshot({ payout, goal, sessions, tasks, withdrawals, goalFor })),
    // The payout data ticks every second while a timer runs; the text
    // only changes about once a minute, and only a change is sent
    [payout, goal, sessions, tasks, withdrawals, goalFor]
  );

  useEffect(() => {
    if (!ready) return;
    const send = () => getBackend().platform.widgets?.update({ updatedAtMs: Date.now(), ...JSON.parse(snapshot) });
    send();
    // While the page was hidden the phone may have shown figures another
    // device published: back in front, the page's are the ones to show again
    const onVisible = () => {
      if (document.visibilityState === 'visible') send();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready, snapshot]);

  // The timer's notification follows the same switch with the app closed
  const [{ desktopEnabled }] = useNotificationPreferences();
  useEffect(() => {
    getBackend().platform.backgroundSync?.setTimerNotice(desktopEnabled);
  }, [desktopEnabled]);

  const sync = getCloudSync();
  const published = useRef<PublishedMark | null>(null);
  useEffect(() => {
    if (!ready || !sync) return;
    const figures = JSON.parse(snapshot);
    const mark = widgetsDue(published.current, figures, Date.now());
    const doc = mark && publishedWidgets(figures, deviceZone());
    if (!doc) return;
    published.current = mark;
    sync.publishWidgets(doc);
  }, [ready, sync, snapshot]);
}
