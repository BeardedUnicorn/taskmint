/**
 * The Today widget's part of the snapshot: today's money and time as Home
 * has them, the daily goal, this week's totals (a tall widget shows them),
 * and the live timer, which the widget's own clock counts.
 */

import type { WidgetSnapshot } from '../backend/types';
import type { CalendarWeek } from '../components/pages/calendar/calendarMonth';
import { periodTotals } from '../components/pages/home/homeTotals';
import type { DailyGoalProgressData } from '../hooks/useDailyGoalProgressMonitor';
import type { PayoutData } from '../hooks/usePayoutData';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import { formatDurationCompact } from '../utils/formatters';
import { getInstanceElapsedMs, instanceTaskName, mostRecentlyPaused } from '../utils/timerHelpers';
import { widgetMoney } from './widgetText';

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

export function todayWidget(
  payout: Pick<PayoutData, 'cells' | 'today' | 'nowMs'>,
  goal: Pick<DailyGoalProgressData, 'enabled' | 'percent'>,
  sessions: TaskSession[],
  week: Pick<CalendarWeek, 'earnedCents' | 'estimatedCents' | 'timeMs'>
): Pick<WidgetSnapshot, 'today' | 'timer'> {
  const totals = periodTotals(payout.cells, payout.today, payout.today);

  const live = liveTimer(sessions);
  const elapsedMs = live ? getInstanceElapsedMs(live.instance, payout.nowMs) : 0;
  const running = live?.instance.state === TimerState.running;
  const timer = live && {
    task: instanceTaskName(live.instance, live.session),
    countingFromMs: running ? payout.nowMs - elapsedMs : null,
    status: running ? null : `Paused at ${formatDurationCompact(elapsedMs)}`,
    pausedFor: running ? null : formatDurationCompact(elapsedMs),
  };

  return {
    today: {
      money: widgetMoney(totals.earnedCents, totals.estimatedCents > 0),
      time: formatDurationCompact(totals.timeMs),
      goalPercent: goal.enabled ? Math.round(goal.percent) : null,
      week: {
        money: widgetMoney(week.earnedCents, week.estimatedCents > 0),
        time: formatDurationCompact(week.timeMs),
      },
    },
    timer,
  };
}
