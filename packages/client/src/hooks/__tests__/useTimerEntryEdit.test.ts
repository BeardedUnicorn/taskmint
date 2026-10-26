/**
 * useTimerEntryEdit: an Edit Time Entry save sends the duration, moves the
 * timer when another task was picked, and moves that timer's notes with it.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTimerEntryEdit } from '../useTimerEntryEdit';
import { TimerState } from '../../types/timer';
import {
  createMockTask,
  createMockTaskNote,
  createMockTaskSession,
} from '../../__tests__/setup/session-test-utils';

const editTimerEntry = vi.fn();
const updateNote = vi.fn();

const instance = {
  id: 'instance-1',
  sessionId: 'session-1',
  startTime: new Date('2026-10-01T10:00:00Z').toISOString(),
  endTime: new Date('2026-10-01T11:00:00Z').toISOString(),
  duration: 3_600_000,
  pausedDuration: 0,
  state: TimerState.stopped,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T11:00:00Z',
};
const session = createMockTaskSession({
  id: 'session-1',
  taskId: 'task-a',
  taskName: 'A',
  timerInstances: [instance],
});
const tasks = [createMockTask({ id: 'task-a', name: 'A' }), createMockTask({ id: 'task-b', name: 'B' })];
const notes = [
  createMockTaskNote({ id: 'timer-note', sessionId: 'session-1', timerInstanceId: 'instance-1' }),
  createMockTaskNote({ id: 'session-note', sessionId: 'session-1', timerInstanceId: null }),
];

vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: [session], editTimerEntry }),
}));
vi.mock('../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => ({ tasks }),
}));
vi.mock('../useTaskNotes', () => ({
  useTaskNotes: () => ({ notes, updateNote }),
}));

describe('useTimerEntryEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a duration edit without moving anything', async () => {
    editTimerEntry.mockResolvedValue('session-1');
    const { result } = renderHook(() => useTimerEntryEdit());

    let saved = false;
    await act(async () => {
      saved = await result.current({ id: 'instance-1', taskId: 'task-a', durationMs: 1_800_000 });
    });

    expect(saved).toBe(true);
    expect(editTimerEntry).toHaveBeenCalledWith('instance-1', {
      updates: expect.objectContaining({ duration: 1_800_000, isRunning: false, isPaused: false }),
      moveTo: undefined,
    });
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('moves the timer and its own notes to the picked task', async () => {
    editTimerEntry.mockResolvedValue('session-new');
    const { result } = renderHook(() => useTimerEntryEdit());

    await act(async () => {
      await result.current({ id: 'instance-1', taskId: 'task-b', durationMs: 3_600_000 });
    });

    expect(editTimerEntry).toHaveBeenCalledWith('instance-1', expect.objectContaining({
      moveTo: { taskId: 'task-b', taskName: 'B' },
    }));
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(updateNote).toHaveBeenCalledWith('timer-note', { sessionId: 'session-new', taskId: 'task-b' });
  });

  it('leaves notes alone when the save fails', async () => {
    editTimerEntry.mockResolvedValue(null);
    const { result } = renderHook(() => useTimerEntryEdit());

    let saved = true;
    await act(async () => {
      saved = await result.current({ id: 'instance-1', taskId: 'task-b', durationMs: 3_600_000 });
    });

    expect(saved).toBe(false);
    expect(updateNote).not.toHaveBeenCalled();
  });
});
