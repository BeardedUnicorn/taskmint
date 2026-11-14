/**
 * The Calendar widget's list: the phone's Calendar agenda, from recent weeks
 * to the upcoming releases. Each week shown is a header with its totals, then
 * its days with something on them, and today (as the Calendar lists them).
 * This week always shows; up to AGENDA_WEEKS_BACK earlier weeks and
 * AGENDA_WEEKS_AHEAD later ones show when there's something in them. The
 * list opens at this week.
 */

import type { WidgetAgenda, WidgetAgendaRow, WidgetBadgeKind, WidgetRowPosition } from '../backend/types';
import {
  CalendarDay,
  CalendarWeek,
  dayGoalPercent,
  dayHasActivity,
  dayWorked,
} from '../components/pages/calendar/calendarMonth';
import { describeDay, weekTitle } from '../components/pages/calendar/calendarText';
import { periodTotals } from '../components/pages/home/homeTotals';
import { parseDateStringLocal } from '../utils/dateHelpers';
import { formatDurationCompact } from '../utils/formatters';
import { formatClockTime, formattingLocale } from '../utils/locale';
import { formatWholeCents, PayoutDayCell } from '../utils/payoutCalculator';
import { widgetMoney } from './widgetText';

export const AGENDA_WEEKS_BACK = 3;
export const AGENDA_WEEKS_AHEAD = 6;
/** The badges a day's row has room for. */
export const AGENDA_BADGES = 3;

function badges(day: CalendarDay): { kind: WidgetBadgeKind; text: string }[] {
  const all: { kind: WidgetBadgeKind; text: string }[] = [];
  if (day.releasedCents > 0) {
    all.push({
      kind: day.releasesAhead ? 'releaseAhead' : 'release',
      text: widgetMoney(day.releasedCents, day.releasedEstimatedCents > 0),
    });
  }
  for (const withdrawal of day.withdrawals) {
    all.push({ kind: 'withdrawal', text: formatWholeCents(withdrawal.amountCents) });
  }
  if (day.opensAtMs !== null) all.push({ kind: 'opens', text: formatClockTime(day.opensAtMs) });
  if (day.openNow) all.push({ kind: 'openNow', text: 'Open now' });
  return all.slice(0, AGENDA_BADGES);
}

function position(index: number, count: number): WidgetRowPosition {
  if (count === 1) return 'single';
  if (index === 0) return 'top';
  return index === count - 1 ? 'bottom' : 'middle';
}

function dayRow(day: CalendarDay, index: number, count: number): WidgetAgendaRow {
  const goalPercent = dayGoalPercent(day);
  return {
    kind: 'day',
    date: day.date,
    weekday: parseDateStringLocal(day.date).toLocaleDateString(formattingLocale(), { weekday: 'short' }),
    dayOfMonth: String(day.dayOfMonth),
    isToday: day.isToday,
    time: day.timeMs > 0 ? formatDurationCompact(day.timeMs) : null,
    goalPercent: goalPercent === null ? null : Math.round(goalPercent),
    money: dayWorked(day) ? widgetMoney(day.earnedCents, day.estimatedCents > 0) : null,
    badges: badges(day),
    position: position(index, count),
    spoken: describeDay(day, formatWholeCents),
  };
}

/**
 * `weeks` run from AGENDA_WEEKS_BACK weeks before this week (`weeks[thisWeek]`)
 * to AGENDA_WEEKS_AHEAD after it; `today` is YYYY-MM-DD.
 */
export function agendaWidget(
  weeks: CalendarWeek[],
  thisWeek: number,
  { today, cells }: { today: string; cells: PayoutDayCell[] }
): WidgetAgenda {
  const rows: WidgetAgendaRow[] = [];
  let thisWeekIndex = 0;
  weeks.forEach((week, index) => {
    const days = week.days.filter(day => dayHasActivity(day) || day.isToday);
    if (index !== thisWeek && !week.days.some(dayHasActivity)) return;
    if (index === thisWeek) thisWeekIndex = rows.length;
    const worked = week.earnedCents > 0 || week.timeMs > 0;
    rows.push({
      kind: 'week',
      date: week.days[0].date,
      title: weekTitle(week),
      totals: worked
        ? `${formatDurationCompact(week.timeMs)} · ${widgetMoney(week.earnedCents, week.estimatedCents > 0)}`
        : null,
    });
    days.forEach((day, at) => rows.push(dayRow(day, at, days.length)));
  });

  const month = today.slice(0, 7);
  const monthTotals = periodTotals(cells, `${month}-01`, `${month}-31`);
  return {
    month: parseDateStringLocal(today).toLocaleDateString(formattingLocale(), { month: 'long' }),
    monthMoney:
      monthTotals.earnedCents > 0 ? widgetMoney(monthTotals.earnedCents, monthTotals.estimatedCents > 0) : null,
    rows,
    thisWeekIndex,
  };
}
