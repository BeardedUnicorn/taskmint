import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useDailySummary,
  buildDailySummary,
  isDailySummaryDue,
  DAILY_SUMMARY_LAST_SENT_KEY,
} from '../useDailySummary';
import { NOTIFICATION_PREFERENCES_KEY } from '../../notifications/preferences';
import { readLocal, writeLocal } from '../../utils/localStore';
import { DailyGoal } from '../../types/goal';
import { TaskSession, TimerState } from '../../types/timer';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
} from '../../__tests__/setup/session-test-utils';

const mockNotify = vi.hoisted(() => vi.fn(() => 'toast-1'));
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify }),
}));

let mockGoal: DailyGoal | null = null;
vi.mock('../useDailyGoals', () => ({
  useDailyGoals: () => ({ currentGoal: mockGoal }),
}));

const HOUR = 3_600_000;
// Local times on 14 Oct 2026
const at = (hours: number, minutes = 0) => new Date(2026, 9, 14, hours, minutes);

const tasks = [
  createMockTask({ id: 'task-1', name: 'Annotation', hourlyRate: 60 }),
  createMockTask({ id: 'task-2', name: 'Review', hourlyRate: 30 }),
];

/** A finished timer of `hours` that started at `start`. */
function finished(id: string, taskId: string, start: Date, hours: number): TaskSession {
  return createMockTaskSession({
    id,
    taskId,
    date: '2026-10-14',
    timerInstances: [
      createMockTimerInstance({
        id: `${id}-i`,
        sessionId: id,
        startTime: start.toISOString(),
        duration: hours * HOUR,
        state: TimerState.stopped,
      }),
    ],
  });
}

function goal(overrides: Partial<DailyGoal> = {}): DailyGoal {
  return {
    targetAmount: 200,
    currency: 'USD',
    isEnabled: true,
    lastNotifiedPercent: 0,
    lastNotificationDate: '2026-10-14',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('isDailySummaryDue', () => {
  it('waits for the set time', () => {
    expect(isDailySummaryDue(at(17, 59), '18:00', null)).toBe(false);
    expect(isDailySummaryDue(at(18, 0), '18:00', null)).toBe(true);
    expect(isDailySummaryDue(at(23, 30), '18:00', null)).toBe(true);
  });

  it('is sent once a day', () => {
    expect(isDailySummaryDue(at(19), '18:00', '2026-10-14')).toBe(false);
    expect(isDailySummaryDue(at(19), '18:00', '2026-10-13')).toBe(true);
  });

  it("doesn't catch up on a missed day the next morning", () => {
    expect(isDailySummaryDue(at(9), '18:00', '2026-10-12')).toBe(false);
  });
});

describe('buildDailySummary', () => {
  const nowMs = at(18, 30).getTime();

  it('says nothing on a day with nothing tracked', () => {
    const yesterday = finished('s-old', 'task-1', new Date(2026, 9, 13, 9), 3);
    expect(buildDailySummary({ sessions: [yesterday], tasks, goal: null, date: '2026-10-14', nowMs })).toBeNull();
  });

  it('says under a minute for a moment of tracking', () => {
    const blink = finished('s-1', 'task-1', at(9), 30 / 3600);
    expect(buildDailySummary({ sessions: [blink], tasks, goal: null, date: '2026-10-14', nowMs })?.title).toBe(
      'Today: under a minute tracked'
    );
  });

  it("totals today's time and earnings across tasks", () => {
    const sessions = [
      finished('s-1', 'task-1', at(9), 2),
      finished('s-2', 'task-2', at(13), 1.5),
      finished('s-old', 'task-1', new Date(2026, 9, 13, 9), 3),
    ];
    expect(buildDailySummary({ sessions, tasks, goal: null, date: '2026-10-14', nowMs })).toEqual({
      title: 'Today: 3h 30m tracked',
      message: '$165.00 earned across 2 tasks',
    });
  });

  it("adds the goal's progress in its currency, and a running timer", () => {
    const running = createMockTaskSession({
      id: 's-run',
      taskId: 'task-1',
      date: '2026-10-14',
      timerInstances: [
        createMockTimerInstance({
          id: 'run',
          sessionId: 's-run',
          startTime: at(18).toISOString(),
          pausedDuration: 0,
          state: TimerState.running,
        }),
      ],
    });
    const summary = buildDailySummary({
      sessions: [finished('s-1', 'task-1', at(9), 2), running],
      tasks,
      goal: goal({ currency: 'EUR' }),
      date: '2026-10-14',
      nowMs,
    });
    expect(summary).toEqual({
      title: 'Today: 2h 30m tracked',
      message: '€150.00 earned across 1 task · 75% of your €200.00 goal · a timer is still running',
    });
  });

  it('leaves out a disabled goal', () => {
    const summary = buildDailySummary({
      sessions: [finished('s-1', 'task-1', at(9), 0.75)],
      tasks,
      goal: goal({ isEnabled: false }),
      date: '2026-10-14',
      nowMs,
    });
    expect(summary).toEqual({ title: 'Today: 45m tracked', message: '$45.00 earned across 1 task' });
  });
});

describe('useDailySummary', () => {
  const today = [finished('s-1', 'task-1', at(9), 2)];

  beforeEach(() => {
    window.localStorage.clear();
    mockNotify.mockClear();
    mockGoal = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the summary once when the time comes', () => {
    vi.setSystemTime(at(17, 59));
    renderHook(() => useDailySummary({ sessions: today, tasks, ready: true }));
    expect(mockNotify).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({
      category: 'dailySummary',
      severity: 'info',
      title: 'Today: 2h 0m tracked',
      message: '$120.00 earned across 1 task',
      actions: [{ label: 'Open History', view: 'history' }],
    });
    expect(readLocal(DAILY_SUMMARY_LAST_SENT_KEY, null)).toBe('2026-10-14');

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('catches up when the app comes back after the set time', () => {
    vi.setSystemTime(at(19, 30));
    renderHook(() => useDailySummary({ sessions: today, tasks, ready: true }));
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('waits for the saved sessions before deciding', () => {
    vi.setSystemTime(at(19));
    const { rerender } = renderHook(props => useDailySummary(props), {
      initialProps: { sessions: [] as TaskSession[], tasks, ready: false },
    });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(readLocal(DAILY_SUMMARY_LAST_SENT_KEY, null)).toBeNull();

    rerender({ sessions: today, tasks, ready: true });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('skips a day with nothing tracked by the set time', () => {
    vi.setSystemTime(at(18));
    const { rerender } = renderHook(props => useDailySummary(props), {
      initialProps: { sessions: [] as TaskSession[], tasks, ready: true },
    });
    expect(readLocal(DAILY_SUMMARY_LAST_SENT_KEY, null)).toBe('2026-10-14');

    // Starting work later that evening doesn't bring it back
    rerender({ sessions: today, tasks, ready: true });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('sends nothing when the summary is turned off', () => {
    writeLocal(NOTIFICATION_PREFERENCES_KEY, { dailySummary: false }, {});
    vi.setSystemTime(at(20));
    renderHook(() => useDailySummary({ sessions: today, tasks, ready: true }));
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('follows the time set in Settings', () => {
    writeLocal(NOTIFICATION_PREFERENCES_KEY, { dailySummaryTime: '21:15' }, {});
    vi.setSystemTime(at(20));
    renderHook(() => useDailySummary({ sessions: today, tasks, ready: true }));
    expect(mockNotify).not.toHaveBeenCalled();

    vi.setSystemTime(at(21, 15));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});
