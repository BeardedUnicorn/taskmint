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
      today: {
        money: '~$46',
        time: '2h 13m',
        // Today's time counts with the timer, from where 2h 13m ago puts it
        countingFromMs: NOW - 133 * MINUTE,
        timeMs: null,
        goalPercent: 64,
        week: { money: '~$310', time: '14h 20m' },
      },
      timer: { task: 'Writing', countingFromMs: NOW - 50 * MINUTE, status: null, pausedFor: null, pausedMs: null },
    });
  });

  it("holds today's time still while the timer is paused, or one begun yesterday still runs", () => {
    const still = { countingFromMs: null, timeMs: 133 * MINUTE };
    expect(todayWidget(payout(), goal, [working(true)], week).today).toMatchObject(still);
    expect(todayWidget(payout(), goal, [], week).today).toMatchObject(still);

    // Its whole time is yesterday's, so today's doesn't grow with it
    const sinceYesterday = createMockTaskSession({
      taskName: 'Writing',
      isActive: true,
      timerInstances: [
        createMockTimerInstance({ startTime: new Date(NOW - 20 * 60 * MINUTE).toISOString(), isRunning: true }),
      ],
    });
    const overnight = todayWidget(payout(), goal, [sinceYesterday], week);
    expect(overnight.today).toMatchObject(still);
    expect(overnight.timer).toMatchObject({ countingFromMs: NOW - 20 * 60 * MINUTE });
  });

  it('says where a paused timer stopped, and leaves the goal out when there is none', () => {
    expect(todayWidget(payout(), noGoal, [working(true)], week)).toMatchObject({
      today: { goalPercent: null },
      timer: {
        task: 'Writing',
        countingFromMs: null,
        status: 'Paused at 50m',
        pausedFor: '50m',
        pausedMs: 50 * MINUTE,
      },
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
