/**
 * The Calendar's days and weeks in words: the labels screen readers hear for
 * a day or a week, and the amounts both the month grid and the phone's agenda
 * show.
 */

import { formatCents } from '../../../utils/payoutCalculator';
import { formatDate, formatDurationCompact } from '../../../utils/formatters';
import { formatClockTime, formatShortDate } from '../../../utils/locale';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { CalendarDay, CalendarWeek, dayGoalPercent, dayWorked } from './calendarMonth';

/** "$450.00", or "~$450.00" when part of it is estimated from tracked time. */
export const earnedText = ({ earnedCents, estimatedCents }: { earnedCents: number; estimatedCents: number }) =>
  `${estimatedCents > 0 ? '~' : ''}${formatCents(earnedCents)}`;

/** "62% of the daily goal" for a worked day with a goal, else null. */
export function goalText(day: CalendarDay): string | null {
  const percent = dayGoalPercent(day);
  return percent === null ? null : `${Math.round(percent)}% of the daily goal`;
}

/** The day in words, for screen readers, with its amounts as `money` writes them (to the cent by default). */
export function describeDay(day: CalendarDay, money: (cents: number) => string = formatCents): string {
  const parts: string[] = [];
  if (dayWorked(day)) {
    const earned = `earned ${day.estimatedCents > 0 ? 'about ' : ''}${money(day.earnedCents)}`;
    parts.push(day.timeMs > 0 ? `worked ${formatDurationCompact(day.timeMs)}, ${earned}` : earned);
  }
  const goal = goalText(day);
  if (goal) parts.push(goal);
  if (day.releasedCents > 0) {
    parts.push(`${money(day.releasedCents)} ${day.releasesAhead ? 'to be released' : 'released'}`);
  }
  for (const withdrawal of day.withdrawals) {
    parts.push(`withdrew ${money(withdrawal.amountCents)} at ${formatClockTime(withdrawal.takenAt)}`);
  }
  if (day.opensAtMs !== null) parts.push(`next withdrawal opens at ${formatClockTime(day.opensAtMs)}`);
  if (day.openNow) parts.push('withdrawal open now');
  return `${formatDate(parseDateStringLocal(day.date))}: ${parts.length > 0 ? parts.join('; ') : 'nothing tracked'}`;
}

/** "Week of Nov 1" */
export const weekTitle = (week: CalendarWeek) => `Week of ${formatShortDate(parseDateStringLocal(week.days[0].date))}`;

/** The week in words: "Week of Nov 1: 14h 5m, $402.00". */
export function describeWeek(week: CalendarWeek): string {
  const worked = week.earnedCents > 0 || week.timeMs > 0;
  return `${weekTitle(week)}: ${worked ? `${formatDurationCompact(week.timeMs)}, ${earnedText(week)}` : 'nothing tracked'}`;
}
