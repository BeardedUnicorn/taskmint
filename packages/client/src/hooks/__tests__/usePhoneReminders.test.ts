/**
 * A phone's reminder alarms: set, moved or taken back as what's tracked
 * changes, only when they change.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DAILY_SUMMARY_ID, GOAL_MILESTONE_ID, LONG_RUN_REMINDER_ID } from '@taskmint/contracts';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
} from '../../__tests__/setup/session-test-utils';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { NOTIFICATION_PREFERENCES_KEY } from '../../notifications/preferences';
import type { DailyGoal } from '../../types/goal';
import { goalAlarmAnnounced } from '../../utils/goalAlarms';
import { writeLocal } from '../../utils/localStore';
import { PLAN_INTERVAL_MS, usePhoneReminders } from '../usePhoneReminders';

const goalState = vi.hoisted(() => ({ currentGoal: null as DailyGoal | null }));
vi.mock('../useDailyGoals', () => ({ useDailyGoals: () => ({ currentGoal: goalState.currentGoal }) }));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = new Date(2026, 10, 13, 13, 0).getTime();
const NOW = START + HOUR;
const GOAL_IDS = [0, 1, 2, 3].map(index => GOAL_MILESTONE_ID + index);

const tasks = [createMockTask({ id: 'task-1', name: 'Writing', hourlyRate: 20 })];
const working = (paused = false) => [
  createMockTaskSession({
    taskId: 'task-1',
    taskName: 'Writing',
    isActive: true,
    date: '2026-11-13',
    timerInstances: [
      createMockTimerInstance({
        startTime: new Date(START).toISOString(),
        isRunning: !paused,
        isPaused: paused,
        pausedAt: paused ? new Date(NOW).toISOString() : undefined,
      }),
    ],
  }),
];

function renderReminders(initial = { sessions: working(), ready: true }) {
  return renderHook(props => usePhoneReminders({ ...props, tasks }), { initialProps: initial });
}

/** Lets the promises the hook started settle. */
const settle = () => act(async () => undefined);

describe('usePhoneReminders', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    localStorage.clear();
    installFakeBackendForTest({});
    fakeBackend().platform.notifications.schedule.mockResolvedValue(true);
    goalState.currentGoal = {
      targetAmount: 100,
      currency: 'USD',
      isEnabled: true,
      lastNotifiedPercent: 0,
      lastNotificationDate: '2026-11-13',
      createdAt: 'x',
      updatedAt: 'x',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const scheduled = () => fakeBackend().platform.notifications.schedule.mock.calls.map(([alarm]) => alarm.id);
  const cancelled = () => fakeBackend().platform.notifications.cancel.mock.calls.map(([id]) => id);

  it("sets the long run, the day's summary and the goal's milestones, once each", async () => {
    const { rerender } = renderReminders();
    await settle();
    expect(scheduled()).toEqual([LONG_RUN_REMINDER_ID, DAILY_SUMMARY_ID, ...GOAL_IDS]);
    expect(fakeBackend().platform.notifications.schedule.mock.calls[0][0]).toMatchObject({
      atMs: START + 4 * HOUR,
      title: 'Still working?',
    });

    // Nothing changed, and a minute later nothing changed either
    rerender({ sessions: working(), ready: true });
    act(() => vi.advanceTimersByTime(PLAN_INTERVAL_MS));
    await settle();
    expect(scheduled()).toHaveLength(6);
    expect(cancelled()).toEqual([]);

    // The goal's alarms are noted, so the app won't announce them again
    expect(goalAlarmAnnounced(50, START + 2.5 * HOUR)).toBe(true);
  });

  it('takes back what a pause makes moot, and moves the summary', async () => {
    const { rerender } = renderReminders();
    await settle();
    rerender({ sessions: working(true), ready: true });
    await settle();

    expect(cancelled()).toEqual([LONG_RUN_REMINDER_ID, ...GOAL_IDS]);
    expect(scheduled().slice(6)).toEqual([DAILY_SUMMARY_ID]);
    expect(goalAlarmAnnounced(50, START + 2.5 * HOUR)).toBe(false);
  });

  it("reminds after the default hours when none are set (a phone's switch is the off)", async () => {
    writeLocal('inactivitySettings', { enabled: false, thresholdMinutes: 15, longRunHours: 0 }, {});
    renderReminders();
    await settle();
    expect(fakeBackend().platform.notifications.schedule.mock.calls[0][0]).toMatchObject({
      id: LONG_RUN_REMINDER_ID,
      atMs: START + 4 * HOUR,
    });
  });

  it('takes them all back with system notifications off', async () => {
    writeLocal(NOTIFICATION_PREFERENCES_KEY, { desktopEnabled: false }, {});
    renderReminders();
    await settle();
    expect(scheduled()).toEqual([]);
    expect(cancelled()).toEqual([LONG_RUN_REMINDER_ID, DAILY_SUMMARY_ID, ...GOAL_IDS]);
  });

  it("doesn't note a goal alarm the system didn't set", async () => {
    fakeBackend().platform.notifications.schedule.mockResolvedValue(false);
    renderReminders();
    await settle();
    expect(goalAlarmAnnounced(50, START + 2.5 * HOUR)).toBe(false);
  });

  it('logs an alarm that fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fakeBackend().platform.notifications.schedule.mockRejectedValue(new Error('denied'));
    fakeBackend().platform.notifications.cancel.mockRejectedValue(new Error('denied'));
    renderReminders({ sessions: [], ready: true });
    await settle();
    expect(warn).toHaveBeenCalledWith(`Failed to set reminder ${LONG_RUN_REMINDER_ID}:`, expect.any(Error));
    warn.mockRestore();
  });

  it('waits for the data, and does nothing where nothing can be set for later', async () => {
    const { rerender } = renderReminders({ sessions: working(), ready: false });
    await settle();
    expect(scheduled()).toEqual([]);

    installFakeBackendForTest({ without: ['laterNotifications'] });
    rerender({ sessions: working(), ready: true });
    await settle();
    expect(fakeBackend().platform.notifications.schedule).toBeUndefined();
  });
});
