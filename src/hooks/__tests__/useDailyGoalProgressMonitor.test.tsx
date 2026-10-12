import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { useDailyGoalProgressMonitor } from '../useDailyGoalProgressMonitor';
import { useDailyGoals } from '../useDailyGoals';
import { DailyGoalProvider } from '../../contexts/DailyGoalContext';
import { STORAGE_KEYS } from '../../constants';
import { Task } from '../../types/task';
import { TaskSession, TimerState } from '../../types/timer';
import { formatDateString } from '../../utils/dateHelpers';

const HOUR = 3_600_000;
const tasks: Task[] = [
  { id: 'task-1', name: 'Annotation', hourlyRate: 60, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

/** A session whose timer has been running for `hours` at $60/hr. */
function runningFor(hours: number): TaskSession[] {
  const start = new Date(Date.now() - hours * HOUR);
  return [
    {
      id: 's-1',
      taskId: 'task-1',
      taskName: 'Annotation',
      hourlyRate: 60,
      timerInstances: [
        {
          id: 'i-1',
          sessionId: 's-1',
          startTime: start,
          pausedDuration: 0,
          state: TimerState.running,
          createdAt: start.toISOString(),
          updatedAt: start.toISOString(),
        },
      ],
      totalDuration: 0,
      isActive: true,
      date: formatDateString(start),
      createdAt: start.toISOString(),
      updatedAt: start.toISOString(),
    },
  ];
}

function storeGoal(targetAmount: number) {
  const now = new Date().toISOString();
  window.localStorage.setItem(
    STORAGE_KEYS.DAILY_GOAL,
    JSON.stringify({
      version: 1,
      data: {
        targetAmount,
        currency: 'USD',
        isEnabled: true,
        lastNotifiedPercent: 0,
        lastNotificationDate: formatDateString(new Date()),
        createdAt: now,
        updatedAt: now,
      },
    })
  );
}

const wrapper = ({ children }: { children: ReactNode }) => <DailyGoalProvider>{children}</DailyGoalProvider>;

describe('useDailyGoalProgressMonitor', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("counts the running timer in today's earnings", () => {
    storeGoal(100);
    const { result } = renderHook(() => useDailyGoalProgressMonitor({ sessions: runningFor(0.5), tasks }), { wrapper });

    expect(result.current.enabled).toBe(true);
    expect(result.current.target).toBe(100);
    expect(result.current.earned).toBeCloseTo(30, 1);
    expect(result.current.percent).toBeCloseTo(30, 0);
  });

  it('records a milestone while the timer is still running', async () => {
    storeGoal(100);
    const { result } = renderHook(
      () => ({
        progress: useDailyGoalProgressMonitor({ sessions: runningFor(1), tasks }),
        goals: useDailyGoals(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.goals.currentGoal?.lastNotifiedPercent).toBe(50));
  });

  it("saves today's target, and saves it again if it changes today", async () => {
    storeGoal(100);
    const today = formatDateString(new Date());
    const { result } = renderHook(
      () => ({
        progress: useDailyGoalProgressMonitor({ sessions: runningFor(0.25), tasks }),
        goals: useDailyGoals(),
      }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.goals.achievements.find(r => r.date === today)?.goalAmount).toBe(100)
    );
    await act(async () => {
      await result.current.goals.updateDailyGoal({ targetAmount: 120 });
    });
    await waitFor(() =>
      expect(result.current.goals.achievements.find(r => r.date === today)?.goalAmount).toBe(120)
    );
    expect(result.current.goals.achievements.filter(r => r.date === today)).toHaveLength(1);
  });

  it('keeps a target saved in Settings when the monitor then records a milestone', async () => {
    // 1.5h at $60 = $90: 45% of $200, no milestone yet
    storeGoal(200);
    const { result } = renderHook(
      () => ({
        progress: useDailyGoalProgressMonitor({ sessions: runningFor(1.5), tasks }),
        settings: useDailyGoals(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.progress.percent).toBeCloseTo(45, 0));
    expect(result.current.settings.currentGoal?.lastNotifiedPercent).toBe(0);

    // Settings lowers the target to $100: now 90%, so the monitor writes the
    // 75% milestone. With separate copies it wrote back its own goal and
    // reverted the target to $200.
    await act(async () => {
      await result.current.settings.updateDailyGoal({ targetAmount: 100 });
    });

    await waitFor(() => expect(result.current.settings.currentGoal?.lastNotifiedPercent).toBe(75));
    expect(result.current.settings.currentGoal?.targetAmount).toBe(100);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.DAILY_GOAL)!);
    expect(stored.data).toMatchObject({ targetAmount: 100, lastNotifiedPercent: 75 });
  });

  it('reports nothing when no goal is set', () => {
    const { result } = renderHook(() => useDailyGoalProgressMonitor({ sessions: runningFor(1), tasks }), { wrapper });
    expect(result.current.enabled).toBe(false);
    expect(result.current.percent).toBe(0);
  });
});

describe('useDailyGoals', () => {
  it('needs the provider', () => {
    expect(() => renderHook(() => useDailyGoals())).toThrow(/DailyGoalProvider/);
  });
});
