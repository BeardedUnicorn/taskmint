/**
 * Integration Test for Timer Synchronization
 *
 * Tests the synchronization between session timers and global timer state
 */

import '../../setupTests';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimerSync } from '../../hooks/useTimerSync';
import { TimerState } from '../../types/timer';
import { ActiveTimerProvider } from '../../contexts/ActiveTimerContext';

// Mock Tauri API
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

// Get the mocked function
import { listen } from '@tauri-apps/api/event';
const mockListen = vi.mocked(listen);

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock notification context
const mockShowWarning = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ showWarning: mockShowWarning }),
}));

describe('Timer Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock listen to return unsubscribe functions
    mockListen.mockResolvedValue(() => {});
  });

  it('should set up event listeners on mount', async () => {
    renderHook(() => useTimerSync({ activeSession: null, sessions: [] }), { wrapper: ActiveTimerProvider });

    // Verify that the hook sets up event listeners
    expect(mockListen).toHaveBeenCalledWith('session-timer-started', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('session-timer-stopped', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('session-timer-paused', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('global-timer-started', expect.any(Function));
  });

  it('should return isGlobalTimerActive state', () => {
    const { result } = renderHook(() => useTimerSync({ activeSession: null, sessions: [] }), { wrapper: ActiveTimerProvider });

    expect(result.current).toHaveProperty('isGlobalTimerActive');
    expect(typeof result.current.isGlobalTimerActive).toBe('boolean');
  });

  it('should activate global timer when session has running timer', () => {
    const activeSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Test Task',
      timerInstances: [
        {
          id: 'timer-1',
          sessionId: 'session-1',
          startTime: new Date(),
          state: TimerState.running,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
      ],
      totalDuration: 0,
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    const { result } = renderHook(() => useTimerSync({ activeSession, sessions: [activeSession] }), { wrapper: ActiveTimerProvider });

    expect(result.current.isGlobalTimerActive).toBe(true);
  });

  it('should deactivate global timer when no session timers are running', () => {
    const activeSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Test Task',
      timerInstances: [
        {
          id: 'timer-1',
          sessionId: 'session-1',
          startTime: new Date(),
          state: TimerState.stopped,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
      ],
      totalDuration: 0,
      isActive: true,
      date: '2024-01-15',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    const { result } = renderHook(() => useTimerSync({ activeSession, sessions: [activeSession] }), { wrapper: ActiveTimerProvider });

    expect(result.current.isGlobalTimerActive).toBe(false);
  });
});

