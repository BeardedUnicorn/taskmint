/** The This week chart: a bar a day, the goal's line, and the week's totals. */

import { describe, expect, it } from 'vitest';
import { buildCalendarWeeks } from '../../components/pages/calendar/calendarMonth';
import type { PayoutDayCell } from '../../utils/payoutCalculator';
import { weekWidget } from '../weekWidget';
import { MINUTE, NOW, TODAY, cell } from './widgetFixtures';

const thisWeek = (cells: PayoutDayCell[]) =>
  buildCalendarWeeks('2026-11-08', 1, {
    cells,
    events: [],
    withdrawals: [],
    plan: null,
    nowMs: NOW,
    goalFor: () => null,
  })[0];

describe('weekWidget', () => {
  it("draws each day's money against the tallest day or the goal, with the goal's line", () => {
    const week = thisWeek([
      cell({ workDay: '2026-11-09', actualCents: 6_500, importedMinutes: 130 }),
      cell({ workDay: TODAY, estimatedCents: 4_550, trackedMs: 133 * MINUTE }),
    ]);
    const chart = weekWidget(week, TODAY, 100);
    // The goal ($100) is the top: the scale is $110
    expect(chart).toMatchObject({ totals: '~$111 · 4h 23m', measure: 'money', goalLevel: 9100 });
    expect(chart.days.map(day => [day.letter, day.level, day.amount, day.isToday, day.isFuture])).toEqual([
      ['S', 0, '', false, false],
      ['M', 5900, '$65', false, false],
      ['T', 0, '', false, false],
      ['W', 0, '', false, false],
      ['T', 0, '', false, false],
      ['F', 4100, '~$46', true, false],
      ['S', 0, '', false, true],
    ]);
    expect(chart.days[1].spoken).toBe('Monday, November 9, 2026: worked 2h 10m, earned $65');
    expect(chart.days[0].spoken).toBe('Sunday, November 8, 2026: nothing tracked');

    // Without a goal, the tallest day is the top
    const noGoal = weekWidget(week, TODAY, null);
    expect(noGoal.goalLevel).toBeNull();
    expect(noGoal.days[1].level).toBe(9100);
  });

  it('draws time when the week has time but no money, without a goal line', () => {
    const chart = weekWidget(thisWeek([cell({ workDay: '2026-11-10', trackedMs: 90 * MINUTE })]), TODAY, 100);
    expect(chart).toMatchObject({ totals: '1h 30m', measure: 'time', goalLevel: null });
    expect(chart.days[2]).toMatchObject({ level: 9100, amount: '1h 30m' });
  });

  it('draws no bars for an empty week', () => {
    const chart = weekWidget(thisWeek([]), TODAY, null);
    expect(chart).toMatchObject({ totals: '0m', measure: 'money' });
    expect(chart.days.every(day => day.level === 0 && day.amount === '')).toBe(true);
  });
});
