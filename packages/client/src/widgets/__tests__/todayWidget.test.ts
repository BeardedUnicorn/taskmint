/** The Today widget: today's money, time and goal, this week, and the live timer's task. */

import { describe, expect, it } from 'vitest';
import { createMockPayoutData } from '../../__tests__/setup/payout-test-utils';
import { createMockTaskSession, createMockTimerInstance } from '../../__tests__/setup/session-test-utils';
import { todayWidget } from '../todayWidget';
import { MINUTE, NOW, TASKS, TODAY, cell, working } from './widgetFixtures';

const goal = { enabled: true, percent: 63.6 };
const noGoal = { enabled: false, percent: 0 };
const week = { earnedCents: 31_049, estimatedCents: 4_550, timeMs: 860 * MINUTE };
const payout = (cells = [cell({ estimatedCents: 4_550, trackedMs: 133 * MINUTE })]) =>
  createMockPayoutData({ nowMs: NOW, cells });

/** A finished 83-minute timer on Writing this morning. */
const earlier = createMockTaskSession({
  id: 'earlier',
  taskId: 't',
  taskName: 'Writing',
  date: TODAY,
  timerInstances: [
    createMockTimerInstance({
      id: 'done',
      startTime: new Date(NOW - 300 * MINUTE).toISOString(),
      duration: 83 * MINUTE,
    }),
    // Another task's time isn't the running timer's cell's
    createMockTimerInstance({
      id: 'other',
      startTime: new Date(NOW - 200 * MINUTE).toISOString(),
      duration: 10 * MINUTE,
      task: { taskId: 'u', taskName: 'Review', hourlyRate: 20 },
    }),
  ],
});

describe('todayWidget', () => {
  it("shows today's money and time, the goal, this week, and the running timer's task", () => {
    expect(todayWidget(payout(), goal, [earlier, working(false)], week, TASKS)).toEqual({
      today: {
        money: '~$46',
        time: '2h 13m',
        // Today's time counts with the timer, from where 2h 13m ago puts it
        countingFromMs: NOW - 133 * MINUTE,
        timeMs: null,
        // and its money from the 83 minutes before, at the timer's $30 an hour
        earning: { baseCents: 4_150, perHourCents: 3_000, fromMs: NOW - 50 * MINUTE },
        goalPercent: 64,
        week: { money: '~$310', time: '14h 20m' },
      },
      timer: { task: 'Writing', countingFromMs: NOW - 50 * MINUTE },
    });
  });

  it("adds the day's other money to what the running timer earns", () => {
    const cells = [
      cell({ estimatedCents: 2_500, trackedMs: 50 * MINUTE }),
      cell({ taskId: 'u', actualCents: 12_000, importedMinutes: 90 }),
    ];
    expect(todayWidget(payout(cells), goal, [working(false)], week, TASKS).today).toMatchObject({
      money: '~$145',
      earning: { baseCents: 12_000, perHourCents: 3_000, fromMs: NOW - 50 * MINUTE },
    });
  });

  it("leaves the money still when it doesn't grow with the timer", () => {
    const earning = (cells = payout().cells, tasks = TASKS) =>
      todayWidget(payout(cells), goal, [working(false)], week, tasks).today.earning;
    // No rate
    expect(earning(undefined, [])).toBeNull();
    // The day's money is the site's
    expect(earning([cell({ actualCents: 12_000, importedMinutes: 90, trackedMs: 50 * MINUTE })])).toBeNull();
    // (No cell for the timer yet)
    expect(earning([])).toBeNull();
  });

  it("holds today's figures still while the timer is paused, or one begun yesterday still runs", () => {
    const still = { countingFromMs: null, timeMs: 133 * MINUTE, earning: null };
    expect(todayWidget(payout(), goal, [working(true)], week, TASKS).today).toMatchObject(still);
    expect(todayWidget(payout(), goal, [], week, TASKS).today).toMatchObject(still);

    // Its whole time is yesterday's, so today's doesn't grow with it
    const sinceYesterday = createMockTaskSession({
      taskName: 'Writing',
      isActive: true,
      timerInstances: [
        createMockTimerInstance({ startTime: new Date(NOW - 20 * 60 * MINUTE).toISOString(), isRunning: true }),
      ],
    });
    const overnight = todayWidget(payout(), goal, [sinceYesterday], week, TASKS);
    expect(overnight.today).toMatchObject(still);
    expect(overnight.timer).toEqual({ task: 'Writing', countingFromMs: NOW - 20 * 60 * MINUTE });
  });

  it('names a paused timer, the one paused last in any session, and leaves the goal out when there is none', () => {
    expect(todayWidget(payout(), noGoal, [working(true)], week, TASKS)).toMatchObject({
      today: { goalPercent: null },
      timer: { task: 'Writing', countingFromMs: null },
    });

    const pausedAt = (task: string, minutesAgo: number) =>
      createMockTaskSession({
        id: task,
        taskName: task,
        timerInstances: [
          createMockTimerInstance({
            startTime: new Date(NOW - 90 * MINUTE).toISOString(),
            isPaused: true,
            pausedAt: new Date(NOW - minutesAgo * MINUTE).toISOString(),
          }),
        ],
      });
    const sessions = [pausedAt('Review', 30), pausedAt('Editing', 5), pausedAt('Planning', 60)];
    expect(todayWidget(payout(), noGoal, sessions, week, TASKS).timer).toEqual({
      task: 'Editing',
      countingFromMs: null,
    });
  });

  it('has no timer when nothing runs or waits paused; imported money is not an estimate', () => {
    const imported = payout([cell({ actualCents: 12_000, importedMinutes: 90 })]);
    const finished = createMockTaskSession({
      isActive: true,
      timerInstances: [createMockTimerInstance({ duration: 1_000 })],
    });
    expect(todayWidget(imported, noGoal, [], { ...week, estimatedCents: 0 }, TASKS)).toMatchObject({
      today: { money: '$120', time: '1h 30m', week: { money: '$310' } },
      timer: null,
    });
    // An active session whose timers have all finished has nothing to show
    expect(todayWidget(imported, noGoal, [finished], week, TASKS).timer).toBeNull();
  });
});
