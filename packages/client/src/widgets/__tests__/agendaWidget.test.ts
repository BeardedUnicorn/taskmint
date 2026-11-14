/** The Calendar widget's list: weeks with something in them, their days, and this week always. */

import { describe, expect, it } from 'vitest';
import { createMockPlan, createMockReleaseEvent, createMockWithdrawal } from '../../__tests__/setup/payout-test-utils';
import { buildCalendarWeeks, CalendarMonthInput } from '../../components/pages/calendar/calendarMonth';
import type { WidgetAgendaRow } from '../../backend/types';
import { AGENDA_WEEKS_AHEAD, AGENDA_WEEKS_BACK, agendaWidget } from '../agendaWidget';
import { MINUTE, NOW, TODAY, cell } from './widgetFixtures';

// Oct 18 (three Sundays before this week's, Nov 8) through Dec 26
const FIRST_SUNDAY = '2026-10-18';

function agenda(input: Partial<CalendarMonthInput>) {
  const full: CalendarMonthInput = {
    cells: [],
    events: [],
    withdrawals: [],
    plan: null,
    nowMs: NOW,
    goalFor: () => null,
    ...input,
  };
  const weeks = buildCalendarWeeks(FIRST_SUNDAY, AGENDA_WEEKS_BACK + 1 + AGENDA_WEEKS_AHEAD, full);
  return agendaWidget(weeks, AGENDA_WEEKS_BACK, { today: TODAY, cells: full.cells });
}

const summary = (row: WidgetAgendaRow) => (row.kind === 'week' ? `week ${row.date}` : `${row.date} ${row.position}`);

describe('agendaWidget', () => {
  it('lists the weeks with something in them and this week, each with its days, and opens at this week', () => {
    const view = agenda({
      cells: [
        // Three weeks back: work on two days
        cell({ workDay: '2026-10-20', estimatedCents: 6_500, trackedMs: 130 * MINUTE }),
        cell({ workDay: '2026-10-22', actualCents: 4_000, importedMinutes: 60 }),
        // This week: two days, today among them
        cell({ workDay: '2026-11-12', actualCents: 12_000, importedMinutes: 240 }),
        cell({ workDay: TODAY, estimatedCents: 4_550, trackedMs: 133 * MINUTE }),
      ],
      // Two weeks on: a release still to come
      events: [createMockReleaseEvent({ releaseMs: new Date(2026, 10, 27, 23, 53).getTime(), estimatedCents: 500 })],
      goalFor: date => (date === TODAY ? 100 : null),
    });

    expect(view.rows.map(summary)).toEqual([
      'week 2026-10-18',
      '2026-10-20 top',
      '2026-10-22 bottom',
      'week 2026-11-08',
      '2026-11-12 top',
      '2026-11-13 bottom',
      'week 2026-11-22',
      '2026-11-27 single',
    ]);
    expect(view.thisWeekIndex).toBe(3);
    expect(view.month).toBe('November');
    expect(view.monthMoney).toBe('~$166');

    expect(view.rows[0]).toEqual({
      kind: 'week',
      date: '2026-10-18',
      title: 'Week of Oct 18',
      totals: '3h 10m · ~$105',
    });
    expect(view.rows[5]).toEqual({
      kind: 'day',
      date: TODAY,
      weekday: 'Fri',
      dayOfMonth: '13',
      isToday: true,
      time: '2h 13m',
      goalPercent: 46,
      money: '~$46',
      badges: [],
      position: 'bottom',
      spoken: 'Friday, November 13, 2026: worked 2h 13m, earned about $46; 46% of the daily goal',
    });
    expect(view.rows[7]).toMatchObject({
      time: null,
      goalPercent: null,
      money: null,
      badges: [{ kind: 'releaseAhead', text: '~$530' }],
    });
    expect(view.rows[6]).toMatchObject({ kind: 'week', totals: null });
  });

  it('shows today alone when nothing else is on, and no month money', () => {
    const view = agenda({});
    expect(view.rows.map(summary)).toEqual(['week 2026-11-08', '2026-11-13 single']);
    expect(view.thisWeekIndex).toBe(0);
    expect(view.monthMoney).toBeNull();
  });

  it("badges a day's releases, withdrawals and the withdrawal's opening, three at most", () => {
    const withdrawal = (id: string, cents: number) =>
      createMockWithdrawal({ id, amountCents: cents, takenAt: new Date(2026, 10, 10, 9, 0).toISOString() });
    const view = agenda({
      events: [createMockReleaseEvent({ releaseMs: new Date(2026, 10, 10, 8, 0).getTime() })],
      withdrawals: [withdrawal('a', 71_250), withdrawal('b', 10_000), withdrawal('c', 5_000)],
      plan: createMockPlan({ opensAtMs: new Date(2026, 10, 16, 18, 25).getTime() }),
    });
    const day = (date: string) => view.rows.find(row => row.kind === 'day' && row.date === date);
    expect(day('2026-11-10')).toMatchObject({
      badges: [
        { kind: 'release', text: '$525' },
        { kind: 'withdrawal', text: '$713' },
        { kind: 'withdrawal', text: '$100' },
      ],
    });
    expect(day('2026-11-16')).toMatchObject({ badges: [{ kind: 'opens', text: '6:25 PM' }] });

    const open = agenda({ plan: createMockPlan({ isOpen: true }) });
    expect(open.rows[1]).toMatchObject({ isToday: true, badges: [{ kind: 'openNow', text: 'Open now' }] });
  });

  it('puts the middle days of a week between its first and last', () => {
    const view = agenda({
      cells: ['2026-11-09', '2026-11-10', '2026-11-11'].map(workDay => cell({ workDay, actualCents: 100 })),
    });
    expect(view.rows.map(summary)).toEqual([
      'week 2026-11-08',
      '2026-11-09 top',
      '2026-11-10 middle',
      '2026-11-11 middle',
      '2026-11-13 bottom',
    ]);
  });
});
