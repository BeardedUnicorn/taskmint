/** The Today widget: today's money, time and goal, this week, and the live timer. */

import { describe, expect, it } from 'vitest';
import { createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { createMockTaskSession, createMockTimerInstance } from '../../__tests__/setup/session-test-utils';
import { todayWidget } from '../todayWidget';
import { MINUTE, NOW, cell, working } from './widgetFixtures';

const goal = { enabled: true, percent: 63.6 };
const noGoal = { enabled: false, percent: 0 };
const week = { earnedCents: 31_049, estimatedCents: 4_550, timeMs: 860 * MINUTE };
const payout = (cells = [cell({ estimatedCents: 4_550, trackedMs: 133 * MINUTE })]) =>
  createMockPayoutData({ nowMs: NOW, cells });

describe('todayWidget', () => {
  it("shows today's money and time, the goal, this week, and the running timer counting", () => {
    expect(todayWidget(payout(), goal, [working(false)], week)).toEqual({
      today: { money: '~$46', time: '2h 13m', goalPercent: 64, week: { money: '~$310', time: '14h 20m' } },
      timer: { task: 'Writing', countingFromMs: NOW - 50 * MINUTE, status: null, pausedFor: null },
    });
  });

  it('says where a paused timer stopped, and leaves the goal out when there is none', () => {
    expect(todayWidget(payout(), noGoal, [working(true)], week)).toMatchObject({
      today: { goalPercent: null },
      timer: { task: 'Writing', countingFromMs: null, status: 'Paused at 50m', pausedFor: '50m' },
    });
  });

  it('has no timer when nothing runs or waits paused; imported money is not an estimate', () => {
    const imported = payout([cell({ actualCents: 12_000, importedMinutes: 90 })]);
    const finished = createMockTaskSession({
      isActive: true,
      timerInstances: [createMockTimerInstance({ duration: 1_000 })],
    });
    expect(todayWidget(imported, noGoal, [], { ...week, estimatedCents: 0 })).toMatchObject({
      today: { money: '$120', time: '1h 30m', week: { money: '$310' } },
      timer: null,
    });
    // An active session whose timers have all finished has nothing to show
    expect(todayWidget(imported, noGoal, [finished], week).timer).toBeNull();
  });
});
