import { describe, expect, it } from 'vitest';
import { createMockWithdrawal } from '../../../../__tests__/setup/payout-test-utils';
import { CalendarDay, CalendarWeek } from '../calendarMonth';
import { describeDay, describeWeek, earnedText, goalText, weekTitle } from '../calendarText';

function calendarDay(overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date: '2026-11-05',
    dayOfMonth: 5,
    inMonth: true,
    isToday: false,
    earnedCents: 0,
    estimatedCents: 0,
    timeMs: 0,
    releasedCents: 0,
    releasedEstimatedCents: 0,
    releasesAhead: false,
    withdrawals: [],
    opensAtMs: null,
    openNow: false,
    goal: null,
    ...overrides,
  };
}

const week = (overrides: Partial<CalendarWeek> = {}): CalendarWeek => ({
  days: [calendarDay({ date: '2026-11-01', dayOfMonth: 1 })],
  earnedCents: 0,
  estimatedCents: 0,
  timeMs: 0,
  ...overrides,
});

describe('describeDay', () => {
  it('says what happened on the day', () => {
    expect(describeDay(calendarDay())).toBe('Thursday, November 5, 2026: nothing tracked');
    expect(
      describeDay(
        calendarDay({
          earnedCents: 68334,
          estimatedCents: 5000,
          timeMs: 3_600_000,
          releasedCents: 71250,
          withdrawals: [createMockWithdrawal({ takenAt: new Date(2026, 10, 5, 18, 25).toISOString() })],
          opensAtMs: new Date(2026, 10, 5, 20, 0).getTime(),
          openNow: true,
        })
      )
    ).toBe(
      'Thursday, November 5, 2026: worked 1h 0m, earned about $683.34; $712.50 released; withdrew $712.50 at 6:25 PM; next withdrawal opens at 8:00 PM; withdrawal open now'
    );
    expect(describeDay(calendarDay({ earnedCents: 100, releasedCents: 50, releasesAhead: true }))).toBe(
      'Thursday, November 5, 2026: earned $1.00; $0.50 to be released'
    );
  });

  it('says how the day did against its goal, when it has one and was worked', () => {
    expect(describeDay(calendarDay({ earnedCents: 25000, timeMs: 7_200_000, goal: 400 }))).toBe(
      'Thursday, November 5, 2026: worked 2h 0m, earned $250.00; 63% of the daily goal'
    );
    expect(describeDay(calendarDay({ goal: 400 }))).toBe('Thursday, November 5, 2026: nothing tracked');
  });
});

describe('goalText', () => {
  it('rounds, and goes past 100%', () => {
    expect(goalText(calendarDay({ earnedCents: 60000, goal: 400 }))).toBe('150% of the daily goal');
    expect(goalText(calendarDay({ earnedCents: 60000 }))).toBeNull();
  });
});

describe('earnedText', () => {
  it('marks an amount with estimates in it', () => {
    expect(earnedText({ earnedCents: 45000, estimatedCents: 0 })).toBe('$450.00');
    expect(earnedText({ earnedCents: 45000, estimatedCents: 5000 })).toBe('~$450.00');
  });
});

describe('describeWeek', () => {
  it('names the week by its first day, with its time and earnings', () => {
    expect(weekTitle(week())).toBe('Week of Nov 1');
    expect(describeWeek(week())).toBe('Week of Nov 1: nothing tracked');
    expect(describeWeek(week({ earnedCents: 40200, estimatedCents: 200, timeMs: 50_700_000 }))).toBe(
      'Week of Nov 1: 14h 5m, ~$402.00'
    );
    expect(describeWeek(week({ earnedCents: 40200 }))).toBe('Week of Nov 1: 0m, $402.00');
  });
});
