/**
 * Everything the home-screen widgets show (Android), worked out from the
 * same figures the pages use: the Calendar's day math for the agenda and the
 * week chart, Home's for Today, the payout plan for Payouts. Sent by
 * useHomeWidgets whenever its text changes.
 */

import dayjs from 'dayjs';
import type { WidgetSnapshot } from '../backend/types';
import { buildCalendarWeeks } from '../components/pages/calendar/calendarMonth';
import { thisWeek } from '../components/pages/home/homeTotals';
import type { DailyGoalProgressData } from '../hooks/useDailyGoalProgressMonitor';
import type { PayoutData } from '../hooks/usePayoutData';
import type { TaskSession } from '../types/timer';
import type { Withdrawal } from '../types/withdrawal';
import { AGENDA_WEEKS_AHEAD, AGENDA_WEEKS_BACK, agendaWidget } from './agendaWidget';
import { payoutsWidget } from './payoutsWidget';
import { todayWidget } from './todayWidget';
import { weekWidget } from './weekWidget';

export interface WidgetInputs {
  payout: Pick<PayoutData, 'cells' | 'events' | 'schedule' | 'plan' | 'today' | 'nowMs'>;
  goal: Pick<DailyGoalProgressData, 'enabled' | 'percent'>;
  sessions: TaskSession[];
  withdrawals: Withdrawal[];
  /** A day's goal in dollars, or null (calendarMonth's goalForDay). */
  goalFor: (date: string) => number | null;
}

/** The snapshot, without its time (set when it's sent). */
export function widgetSnapshot({
  payout,
  goal,
  sessions,
  withdrawals,
  goalFor,
}: WidgetInputs): Omit<WidgetSnapshot, 'updatedAtMs'> {
  const { cells, events, plan, today, nowMs } = payout;
  const firstSunday = dayjs(thisWeek(dayjs(today)).from).subtract(AGENDA_WEEKS_BACK * 7, 'day');
  const weeks = buildCalendarWeeks(firstSunday.format('YYYY-MM-DD'), AGENDA_WEEKS_BACK + 1 + AGENDA_WEEKS_AHEAD, {
    cells,
    events,
    withdrawals,
    plan,
    nowMs,
    goalFor,
  });
  const week = weeks[AGENDA_WEEKS_BACK];

  return {
    version: 2,
    day: today,
    ...todayWidget(payout, goal, sessions, week),
    payouts: payoutsWidget(payout),
    agenda: agendaWidget(weeks, AGENDA_WEEKS_BACK, payout),
    week: weekWidget(week, today, goalFor(today)),
  };
}
