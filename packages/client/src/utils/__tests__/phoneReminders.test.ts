/**
 * A phone's reminder alarms, worked out ahead from what's tracked now: the
 * long-run reminder, the end-of-day summary, and the goal's milestones.
 */

import { describe, it, expect } from 'vitest';
import { DAILY_SUMMARY_ID, GOAL_MILESTONE_ID, LONG_RUN_REMINDER_ID } from '@taskmint/contracts';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
} from '../../__tests__/setup/session-test-utils';
import type { DailyGoal } from '../../types/goal';
import { dailySummaryAlarm, goalMilestoneAlarms, longRunAlarm } from '../phoneReminders';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** 1 PM local, the timer's start, and 2 PM, now. */
const START = new Date(2026, 10, 13, 13, 0).getTime();
const NOW = START + HOUR;

const tasks = [createMockTask({ id: 'task-1', name: 'Writing', hourlyRate: 20 })];

/** A session on "Writing" ($20/h) whose timer started at 1 PM, with 10 minutes paused before now. */
function working({ paused = false, startMs = START } = {}) {
  return [
    createMockTaskSession({
      taskId: 'task-1',
      taskName: 'Writing',
      isActive: true,
      date: '2026-11-13',
      timerInstances: [
        createMockTimerInstance({
          startTime: new Date(startMs).toISOString(),
          pausedDuration: 10 * MINUTE,
          isRunning: !paused,
          isPaused: paused,
          pausedAt: paused ? new Date(NOW).toISOString() : undefined,
        }),
      ],
    }),
  ];
}

const goal = (overrides: Partial<DailyGoal> = {}): DailyGoal => ({
  targetAmount: 100,
  currency: 'USD',
  isEnabled: true,
  lastNotifiedPercent: 0,
  lastNotificationDate: '2026-11-13',
  createdAt: 'x',
  updatedAt: 'x',
  ...overrides,
});

describe('longRunAlarm', () => {
  it('goes off when the running timer reaches the hours, pauses left out', () => {
    expect(longRunAlarm(working(), 4, NOW)).toEqual({
      id: LONG_RUN_REMINDER_ID,
      atMs: START + 10 * MINUTE + 4 * HOUR,
      kind: 'longRun',
      title: 'Still working?',
      body: "Writing's timer has been running for 04:00.",
    });
  });

  it('has none when off, without a running timer, or once past it', () => {
    expect(longRunAlarm(working(), 0, NOW)).toBeNull();
    expect(longRunAlarm(working({ paused: true }), 4, NOW)).toBeNull();
    expect(longRunAlarm([], 4, NOW)).toBeNull();
    expect(longRunAlarm(working(), 4, START + 5 * HOUR)).toBeNull();
  });
});

describe('dailySummaryAlarm', () => {
  it("sends the day's summary at its time, with what's tracked by then", () => {
    const alarm = dailySummaryAlarm({ sessions: working(), tasks, goal: goal(), time: '18:00', nowMs: NOW });
    expect(alarm).toMatchObject({
      id: DAILY_SUMMARY_ID,
      atMs: new Date(2026, 10, 13, 18, 0).getTime(),
      kind: 'dailySummary',
      // 1 PM to 6 PM, less the 10 minutes paused
      title: 'Today: 4h 50m tracked',
    });
    expect(alarm!.body).toBe('$96.67 earned across 1 task · 97% of your $100.00 goal · a timer is still running');
  });

  it('has none once its time has passed, or with nothing tracked', () => {
    expect(dailySummaryAlarm({ sessions: working(), tasks, goal: null, time: '13:30', nowMs: NOW })).toBeNull();
    expect(dailySummaryAlarm({ sessions: [], tasks, goal: null, time: '18:00', nowMs: NOW })).toBeNull();
  });
});

describe('goalMilestoneAlarms', () => {
  // $20/h from 1 PM, 10 minutes paused: $16.67 by 2 PM
  const at = (hours: number, minutes: number) => new Date(2026, 10, 13, hours, minutes).getTime();

  it('sets each milestone the running timer earns its way to today', () => {
    const alarms = goalMilestoneAlarms({ sessions: working(), tasks, goal: goal(), nowMs: NOW });
    expect(alarms.map(alarm => alarm && [alarm.id, alarm.atMs])).toEqual([
      [GOAL_MILESTONE_ID, at(15, 40)],
      [GOAL_MILESTONE_ID + 1, at(16, 55)],
      [GOAL_MILESTONE_ID + 2, at(18, 10)],
      [GOAL_MILESTONE_ID + 3, at(19, 25)],
    ]);
    expect(alarms.map(alarm => alarm?.title)).toEqual([
      'Halfway to your goal!',
      "You're 75% there!",
      'Goal Achieved!',
      'Goal CRUSHED!',
    ]);
    expect(alarms[0]).toMatchObject({ kind: 'goalMilestone', body: expect.stringContaining('$50.00 of your $100.00') });
    expect(alarms[3]!.body).toContain('exceeded your daily target by $25.00');
  });

  it('leaves out milestones already announced or reached, and those past midnight', () => {
    const announced75 = goalMilestoneAlarms({
      sessions: working(),
      tasks,
      goal: goal({ lastNotifiedPercent: 75 }),
      nowMs: NOW,
    });
    expect(announced75.map(alarm => alarm?.id ?? null)).toEqual([
      null,
      null,
      GOAL_MILESTONE_ID + 2,
      GOAL_MILESTONE_ID + 3,
    ]);

    // An older build stored 101 for "well past it"
    expect(
      goalMilestoneAlarms({ sessions: working(), tasks, goal: goal({ lastNotifiedPercent: 101 }), nowMs: NOW })
    ).toEqual([null, null, null, null]);

    // $60 earned by 4:10 PM: 50% is behind it (the app announces that one)
    const later = goalMilestoneAlarms({ sessions: working(), tasks, goal: goal(), nowMs: at(16, 10) });
    expect(later[0]).toBeNull();
    expect(later[1]?.atMs).toBe(at(16, 55));

    // Started at 10 PM: every milestone would come after midnight
    const lateStart = new Date(2026, 10, 13, 22, 0).getTime();
    const night = goalMilestoneAlarms({
      sessions: working({ startMs: lateStart }),
      tasks,
      goal: goal(),
      nowMs: lateStart + 20 * MINUTE,
    });
    expect(night.map(alarm => alarm?.id ?? null)).toEqual([null, null, null, null]);
  });

  it("counts yesterday's announced milestones as none", () => {
    const alarms = goalMilestoneAlarms({
      sessions: working(),
      tasks,
      goal: goal({ lastNotifiedPercent: 125, lastNotificationDate: '2026-11-12' }),
      nowMs: NOW,
    });
    expect(alarms.every(Boolean)).toBe(true);
  });

  it('sets none without a goal, or without a running timer earning', () => {
    const none = [null, null, null, null];
    expect(goalMilestoneAlarms({ sessions: working(), tasks, goal: null, nowMs: NOW })).toEqual(none);
    expect(goalMilestoneAlarms({ sessions: working(), tasks, goal: goal({ isEnabled: false }), nowMs: NOW })).toEqual(
      none
    );
    expect(goalMilestoneAlarms({ sessions: working(), tasks, goal: goal({ targetAmount: 0 }), nowMs: NOW })).toEqual(
      none
    );
    expect(goalMilestoneAlarms({ sessions: working({ paused: true }), tasks, goal: goal(), nowMs: NOW })).toEqual(none);
  });
});
