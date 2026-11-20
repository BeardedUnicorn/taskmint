/**
 * The Today widget's part of the snapshot: today's money and time as Home
 * has them, the daily goal, this week's totals (a tall widget shows them),
 * and the live timer's task. The phone shows the task with today's time and
 * money (the widget and the running timer's notification), and counts both
 * on its own while the timer runs.
 */

import type { WidgetSnapshot } from '../backend/types';
import type { CalendarWeek } from '../components/pages/calendar/calendarMonth';
import { periodTotals } from '../components/pages/home/homeTotals';
import type { DailyGoalProgressData } from '../hooks/useDailyGoalProgressMonitor';
import type { PayoutData } from '../hooks/usePayoutData';
import type { Task } from '../types/task';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import { earningsForMs, instanceRate } from '../utils/earnings';
import { formatDurationCompact } from '../utils/formatters';
import { lastUsedByTask } from '../utils/taskOrdering';
import {
  getInstanceDateString,
  getInstanceElapsedMs,
  getTimersOnDate,
  instanceTaskId,
  instanceTaskName,
  mostRecentlyPaused,
  pausedAtMs,
} from '../utils/timerHelpers';
import { widgetMoney } from './widgetText';

interface Live {
  session: TaskSession;
  instance: TimerInstance;
}

/** The timer running now, else the one paused last in any session (as the tray and the phone's notification have it). */
function liveTimer(sessions: TaskSession[]): Live | null {
  for (const session of sessions) {
    const instance = session.timerInstances.find(timer => timer.state === TimerState.running);
    if (instance) return { session, instance };
  }
  let last: Live | null = null;
  for (const session of sessions) {
    const instance = mostRecentlyPaused(session);
    if (instance && (!last || pausedAtMs(instance) > pausedAtMs(last.instance))) {
      last = { session, instance };
    }
  }
  return last;
}

/**
 * How today's money grows while `live` (begun today) runs, in terms that stay
 * put as it does: what today comes to without the running timer, the timer's
 * rate, and where its time counts from. Null when the money doesn't grow with
 * it: no rate, or a day whose money is the site's (a timed import).
 */
function earningOf(
  live: Live,
  payout: Pick<PayoutData, 'cells' | 'today' | 'nowMs'>,
  sessions: TaskSession[],
  tasks: Task[],
  earnedCents: number,
  fromMs: number
): WidgetSnapshot['today']['earning'] {
  const taskId = instanceTaskId(live.instance, live.session);
  const rate = instanceRate(live.instance, live.session, tasks);
  const cell = payout.cells.find(of => of.taskId === taskId && of.workDay === payout.today);
  if (rate <= 0 || !cell || cell.importedMinutes > 0) return null;
  // The task's other timers today, as the day's estimate adds them up
  let others = 0;
  for (const session of sessions) {
    for (const instance of getTimersOnDate(session, payout.today)) {
      if (instance === live.instance || instanceTaskId(instance, session) !== taskId) continue;
      others += earningsForMs(getInstanceElapsedMs(instance, payout.nowMs), instanceRate(instance, session, tasks));
    }
  }
  return {
    baseCents: earnedCents - cell.estimatedCents + Math.round(others * 100),
    perHourCents: Math.round(rate * 100),
    fromMs,
  };
}

/**
 * What today's money would grow by an hour with a timer on `taskId` at
 * `rate` running: null when it wouldn't grow (no rate, or the task's money
 * today is the site's, from a timed import).
 */
function growthPerHour(payout: Pick<PayoutData, 'cells' | 'today'>, taskId: string, rate: number): number | null {
  const cell = payout.cells.find(of => of.taskId === taskId && of.workDay === payout.today);
  return rate > 0 && !(cell && cell.importedMinutes > 0) ? Math.round(rate * 100) : null;
}

/** The task used most recently, of those not archived: what a phone's Start button begins. */
function startTask(
  payout: Pick<PayoutData, 'cells' | 'today'>,
  sessions: TaskSession[],
  tasks: Task[]
): WidgetSnapshot['start'] {
  const lastUsed = lastUsedByTask(sessions);
  let latest: Task | null = null;
  for (const task of tasks) {
    const usedMs = lastUsed.get(task.id);
    if (task.isArchived || usedMs === undefined) continue;
    if (!latest || usedMs > (lastUsed.get(latest.id) as number)) latest = task;
  }
  return (
    latest && {
      taskId: latest.id,
      task: latest.name,
      perHourCents: growthPerHour(payout, latest.id, latest.hourlyRate ?? 0),
    }
  );
}

export function todayWidget(
  payout: Pick<PayoutData, 'cells' | 'today' | 'nowMs'>,
  goal: Pick<DailyGoalProgressData, 'enabled' | 'percent'>,
  sessions: TaskSession[],
  week: Pick<CalendarWeek, 'earnedCents' | 'estimatedCents' | 'timeMs'>,
  tasks: Task[]
): Pick<WidgetSnapshot, 'today' | 'timer' | 'start'> {
  const totals = periodTotals(payout.cells, payout.today, payout.today);

  const live = liveTimer(sessions);
  const running = live?.instance.state === TimerState.running;
  const fromMs = live ? payout.nowMs - getInstanceElapsedMs(live.instance, payout.nowMs) : 0;
  const timer = live && {
    task: instanceTaskName(live.instance, live.session),
    countingFromMs: running ? fromMs : null,
    perHourCents: growthPerHour(
      payout,
      instanceTaskId(live.instance, live.session),
      instanceRate(live.instance, live.session, tasks)
    ),
  };

  // A timer's whole time belongs to the day it started (getInstanceDateString),
  // so today's time and money count only while one begun today runs. They
  // then grow by the second, and where they count from stays put.
  const counts = running && getInstanceDateString(live.instance, live.session.date) === payout.today;
  const earning = counts ? earningOf(live, payout, sessions, tasks, totals.earnedCents, fromMs) : null;

  return {
    today: {
      money: widgetMoney(totals.earnedCents, totals.estimatedCents > 0),
      time: formatDurationCompact(totals.timeMs),
      countingFromMs: counts ? payout.nowMs - totals.timeMs : null,
      timeMs: counts ? null : totals.timeMs,
      earning,
      // Still while the money is: a figure that moved each second would send the snapshot each second
      moneyCents: earning ? null : totals.earnedCents,
      goalPercent: goal.enabled ? Math.round(goal.percent) : null,
      week: {
        money: widgetMoney(week.earnedCents, week.estimatedCents > 0),
        time: formatDurationCompact(week.timeMs),
      },
    },
    timer,
    start: startTask(payout, sessions, tasks),
  };
}
