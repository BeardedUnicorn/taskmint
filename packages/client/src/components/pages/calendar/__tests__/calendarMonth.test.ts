import { describe, expect, it } from 'vitest';
import { PayoutDayCell } from '../../../../utils/payoutCalculator';
import {
  createMockPlan,
  createMockReleaseEvent,
  createMockWithdrawal,
} from '../../../../__tests__/setup/payout-test-utils';
import { buildCalendarMonth, CalendarMonthInput, cellTimeMs } from '../calendarMonth';

const NOW = new Date(2026, 10, 7, 12, 0).getTime();

function cell(overrides: Partial<PayoutDayCell> = {}): PayoutDayCell {
  return {
    workDay: '2026-11-05',
    taskId: 'task-1',
    taskName: 'Armadillo',
    actualCents: 63334,
    estimatedCents: 0,
    trackedMs: 0,
    importedMinutes: 380,
    statuses: ['Pending Approval'],
    releaseDay: '2026-11-13',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  };
}

const input = (overrides: Partial<CalendarMonthInput> = {}): CalendarMonthInput => ({
  cells: [],
  events: [],
  withdrawals: [],
  plan: null,
  nowMs: NOW,
  goalFor: () => null,
  ...overrides,
});

const day = (view: ReturnType<typeof buildCalendarMonth>, date: string) =>
  view.weeks.flatMap(week => week.days).find(d => d.date === date)!;

describe('cellTimeMs', () => {
  it('takes the tracked time, else the reported time', () => {
    expect(cellTimeMs(cell({ trackedMs: 60_000 }))).toBe(60_000);
    expect(cellTimeMs(cell())).toBe(380 * 60_000);
  });
});

describe('buildCalendarMonth', () => {
  it('lays the month out in Sunday weeks, as many as it spans, across the DST change', () => {
    const november = buildCalendarMonth('2026-11', input());
    expect(november.weeks).toHaveLength(5);
    expect(november.weeks[0].days.map(d => d.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(november.weeks[4].days[6]).toMatchObject({ date: '2026-12-05', dayOfMonth: 5, inMonth: false });
    expect(day(november, '2026-11-07').isToday).toBe(true);
    // Every date once, none skipped or repeated
    const dates = november.weeks.flatMap(week => week.days.map(d => d.date));
    expect(new Set(dates).size).toBe(35);

    const august = buildCalendarMonth('2026-08', input());
    expect(august.weeks).toHaveLength(6);
    expect(august.weeks[0].days[0]).toMatchObject({ date: '2026-07-26', inMonth: false });
  });

  it("puts each day's work, releases, withdrawals and goal on it, and totals the weeks", () => {
    const view = buildCalendarMonth(
      '2026-11',
      input({
        cells: [
          cell(),
          cell({ taskId: 'task-2', actualCents: 0, estimatedCents: 5000, trackedMs: 3_600_000, isEstimate: true }),
          cell({ workDay: '2026-12-01', actualCents: 10000 }),
        ],
        events: [
          createMockReleaseEvent({ releaseMs: new Date(2026, 10, 5, 9).getTime(), actualCents: 30000 }),
          createMockReleaseEvent({
            releaseMs: new Date(2026, 10, 5, 23).getTime(),
            actualCents: 0,
            estimatedCents: 1000,
            status: undefined,
          }),
          createMockReleaseEvent({ releaseMs: new Date(2026, 10, 10, 23, 53).getTime(), actualCents: 52500 }),
          // October's: not this month's
          createMockReleaseEvent({ releaseMs: new Date(2026, 9, 20, 9).getTime(), actualCents: 99999 }),
        ],
        withdrawals: [createMockWithdrawal({ takenAt: new Date(2026, 10, 5, 18, 25).toISOString() })],
        goalFor: date => (date === '2026-11-05' ? 400 : null),
      })
    );

    expect(day(view, '2026-11-05')).toMatchObject({
      earnedCents: 68334,
      estimatedCents: 5000,
      timeMs: 380 * 60_000 + 3_600_000,
      releasedCents: 31000,
      releasedEstimatedCents: 1000,
      releasesAhead: false,
      goal: 400,
      opensAtMs: null,
      openNow: false,
    });
    expect(day(view, '2026-11-05').withdrawals).toHaveLength(1);
    expect(day(view, '2026-11-10')).toMatchObject({ releasedCents: 52500, releasesAhead: true });
    expect(view.weeks[0]).toMatchObject({
      earnedCents: 68334,
      estimatedCents: 5000,
      timeMs: 380 * 60_000 + 3_600_000,
    });
    // Dec 1 is in the last week, which totals it, but not in the month's own totals
    expect(day(view, '2026-12-01')).toMatchObject({ inMonth: false, earnedCents: 10000 });
    expect(view.weeks[4]).toMatchObject({ earnedCents: 10000, estimatedCents: 0 });

    expect(view.summary).toEqual({
      timeMs: 380 * 60_000 + 3_600_000,
      earnedCents: 68334,
      estimatedCents: 5000,
      daysWorked: 1,
      releasedCents: 31000,
      releasingCents: 52500,
      withdrawnCents: 71250,
    });
    expect(view.isEmpty).toBe(false);
  });

  it("marks the next withdrawal's opening on its day, or today when it's open", () => {
    const opens = new Date(2026, 10, 10, 18, 25).getTime();
    const waiting = buildCalendarMonth('2026-11', input({ plan: createMockPlan({ opensAtMs: opens }) }));
    expect(day(waiting, '2026-11-10').opensAtMs).toBe(opens);
    expect(day(waiting, '2026-11-07').openNow).toBe(false);

    const open = buildCalendarMonth('2026-11', input({ plan: createMockPlan({ opensAtMs: NOW, isOpen: true }) }));
    expect(day(open, '2026-11-07')).toMatchObject({ openNow: true, opensAtMs: null });
  });

  it('counts a day with only time as worked, and says when there is nothing at all', () => {
    const view = buildCalendarMonth('2026-11', input({ cells: [cell({ actualCents: 0, trackedMs: 60_000 })] }));
    expect(view.summary.daysWorked).toBe(1);
    expect(buildCalendarMonth('2026-11', input()).isEmpty).toBe(true);
  });
});
