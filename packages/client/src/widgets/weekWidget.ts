/**
 * The This week chart's part of the snapshot: a bar a day, Sunday to
 * Saturday, of each day's money (or its time, for a week with no money: no
 * rates), today's goal as a line across, and the week's totals. Bar heights
 * are in whole percents of the chart, so they change at most about once a
 * minute while a timer runs.
 */

import type { WidgetWeek } from '../backend/types';
import type { CalendarWeek } from '../components/pages/calendar/calendarMonth';
import { describeDay } from '../components/pages/calendar/calendarText';
import { parseDateStringLocal } from '../utils/dateHelpers';
import { formatDurationCompact } from '../utils/formatters';
import { formattingLocale } from '../utils/locale';
import { formatWholeCents } from '../utils/payoutCalculator';
import { widgetMoney } from './widgetText';

/** A level of the chart's height: a whole percent, as Android's drawable levels (0–10000) take it. */
const level = (value: number, scale: number) => (scale > 0 ? Math.round((value / scale) * 100) * 100 : 0);

/** `goal` is today's goal in dollars, or null. */
export function weekWidget(week: CalendarWeek, today: string, goal: number | null): WidgetWeek {
  const measure = week.earnedCents > 0 || week.timeMs === 0 ? 'money' : 'time';
  const value = (day: CalendarWeek['days'][number]) => (measure === 'money' ? day.earnedCents : day.timeMs);
  const goalCents = measure === 'money' && goal ? goal * 100 : null;
  // Headroom over the tallest bar (or the goal), so neither touches the top
  const scale = Math.max(...week.days.map(value), goalCents ?? 0) * 1.1;

  // Money and time, or the time alone for a week with no money
  const time = formatDurationCompact(week.timeMs);
  return {
    totals: week.earnedCents > 0 ? `${widgetMoney(week.earnedCents, week.estimatedCents > 0)} · ${time}` : time,
    measure,
    goalLevel: goalCents === null ? null : level(goalCents, scale),
    days: week.days.map(day => {
      let amount = '';
      if (value(day) > 0) {
        amount =
          measure === 'money'
            ? widgetMoney(day.earnedCents, day.estimatedCents > 0)
            : formatDurationCompact(day.timeMs);
      }
      return {
        letter: parseDateStringLocal(day.date).toLocaleDateString(formattingLocale(), { weekday: 'narrow' }),
        level: level(value(day), scale),
        amount,
        isToday: day.isToday,
        isFuture: day.date > today,
        spoken: describeDay(day, formatWholeCents),
      };
    }),
  };
}
