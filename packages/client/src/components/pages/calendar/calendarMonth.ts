/**
 * The Calendar's month: its weeks of days, each day's work, releases,
 * withdrawals and the next withdrawal's opening, the week totals, and the
 * month's own totals. Pure, from the payout data (see hooks/usePayoutData).
 *
 * Days are local calendar days built with dayjs's local math (never its
 * timezone plugin; see utils/dateHelpers), so DST never repeats or skips one.
 */

import dayjs from 'dayjs';
import { Withdrawal } from '../../../types/withdrawal';
import { formatDateString } from '../../../utils/dateHelpers';
import { PayoutDayCell, ReleaseEvent } from '../../../utils/payoutCalculator';
import { WithdrawalPlan } from '../../../utils/withdrawals';

/** A day's time: what was tracked, else what the site reported. */
export function cellTimeMs(cell: PayoutDayCell): number {
  return cell.trackedMs > 0 ? cell.trackedMs : cell.importedMinutes * 60_000;
}

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  dayOfMonth: number;
  /** In the shown month (not a neighbouring month's day in its weeks). */
  inMonth: boolean;
  isToday: boolean;
  /** The day's work: imported and estimated money, and time. */
  earnedCents: number;
  estimatedCents: number;
  timeMs: number;
  /** Money released on the day (from earlier work days). */
  releasedCents: number;
  /** Part of releasedCents: estimates. */
  releasedEstimatedCents: number;
  /** Some of the day's releases are still to come. */
  releasesAhead: boolean;
  withdrawals: Withdrawal[];
  /** When the next withdrawal opens, when that's on this day. */
  opensAtMs: number | null;
  /** The withdrawal is open now (shown on today). */
  openNow: boolean;
  /** The daily goal in dollars, when one applies to the day. */
  goal: number | null;
}

export interface CalendarWeek {
  days: CalendarDay[];
  earnedCents: number;
  estimatedCents: number;
  timeMs: number;
}

export interface CalendarMonthSummary {
  timeMs: number;
  earnedCents: number;
  estimatedCents: number;
  daysWorked: number;
  /** Released in the month by now. */
  releasedCents: number;
  /** Still to be released in the month. */
  releasingCents: number;
  withdrawnCents: number;
}

export interface CalendarMonth {
  /** YYYY-MM */
  month: string;
  weeks: CalendarWeek[];
  summary: CalendarMonthSummary;
  /** Nothing tracked, imported or withdrawn, ever. */
  isEmpty: boolean;
}

export interface CalendarMonthInput {
  cells: PayoutDayCell[];
  events: ReleaseEvent[];
  withdrawals: Withdrawal[];
  plan: WithdrawalPlan | null;
  nowMs: number;
  /** The daily goal (dollars) for a day, or null. */
  goalFor: (date: string) => number | null;
}

function addTo(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** The local YYYY-MM-DD of an instant. */
const dayOf = (ms: number | string) => formatDateString(new Date(ms));

/** `month` is YYYY-MM. Weeks start on Sunday; there are as many as the month spans. */
export function buildCalendarMonth(month: string, input: CalendarMonthInput): CalendarMonth {
  const { cells, events, withdrawals, plan, nowMs, goalFor } = input;
  const today = dayOf(nowMs);

  const earned = new Map<string, number>();
  const estimated = new Map<string, number>();
  const time = new Map<string, number>();
  for (const cell of cells) {
    addTo(earned, cell.workDay, cell.actualCents + cell.estimatedCents);
    addTo(estimated, cell.workDay, cell.estimatedCents);
    addTo(time, cell.workDay, cellTimeMs(cell));
  }

  const released = new Map<string, number>();
  const releasedEstimated = new Map<string, number>();
  const ahead = new Set<string>();
  for (const event of events) {
    const day = dayOf(event.releaseMs);
    addTo(released, day, event.actualCents + event.estimatedCents);
    addTo(releasedEstimated, day, event.estimatedCents);
    if (event.releaseMs > nowMs) ahead.add(day);
  }

  const withdrawalsByDay = new Map<string, Withdrawal[]>();
  for (const withdrawal of withdrawals) {
    const day = dayOf(withdrawal.takenAt);
    withdrawalsByDay.set(day, [...(withdrawalsByDay.get(day) ?? []), withdrawal]);
  }
  const opensOn = plan && !plan.isOpen ? dayOf(plan.opensAtMs) : null;

  const first = dayjs(`${month}-01`);
  const last = first.endOf('month');
  const weeks: CalendarWeek[] = [];
  for (let start = first.subtract(first.day(), 'day'); !start.isAfter(last, 'day'); start = start.add(7, 'day')) {
    const days: CalendarDay[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const at = start.add(offset, 'day');
      const date = at.format('YYYY-MM-DD');
      days.push({
        date,
        dayOfMonth: at.date(),
        inMonth: at.month() === first.month(),
        isToday: date === today,
        earnedCents: earned.get(date) ?? 0,
        estimatedCents: estimated.get(date) ?? 0,
        timeMs: time.get(date) ?? 0,
        releasedCents: released.get(date) ?? 0,
        releasedEstimatedCents: releasedEstimated.get(date) ?? 0,
        releasesAhead: ahead.has(date),
        withdrawals: withdrawalsByDay.get(date) ?? [],
        opensAtMs: plan && date === opensOn ? plan.opensAtMs : null,
        openNow: Boolean(plan?.isOpen) && date === today,
        goal: goalFor(date),
      });
    }
    weeks.push({
      days,
      earnedCents: days.reduce((sum, day) => sum + day.earnedCents, 0),
      estimatedCents: days.reduce((sum, day) => sum + day.estimatedCents, 0),
      timeMs: days.reduce((sum, day) => sum + day.timeMs, 0),
    });
  }

  const summary: CalendarMonthSummary = {
    timeMs: 0,
    earnedCents: 0,
    estimatedCents: 0,
    daysWorked: 0,
    releasedCents: 0,
    releasingCents: 0,
    withdrawnCents: 0,
  };
  for (const day of weeks.flatMap(week => week.days)) {
    if (!day.inMonth) continue;
    summary.timeMs += day.timeMs;
    summary.earnedCents += day.earnedCents;
    summary.estimatedCents += day.estimatedCents;
    if (day.timeMs > 0 || day.earnedCents > 0) summary.daysWorked += 1;
    summary.withdrawnCents += day.withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amountCents, 0);
  }
  for (const event of events) {
    if (!dayOf(event.releaseMs).startsWith(month)) continue;
    const cents = event.actualCents + event.estimatedCents;
    if (event.releaseMs > nowMs) summary.releasingCents += cents;
    else summary.releasedCents += cents;
  }

  return {
    month,
    weeks,
    summary,
    isEmpty: cells.length === 0 && events.length === 0 && withdrawals.length === 0,
  };
}
