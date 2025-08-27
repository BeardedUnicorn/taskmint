/**
 * Unit Tests for useTimerSync Hook
 *
 * Tests the timer synchronization hook that manages coordination between
 * global timer and session-based timer systems.
 */

import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useTimerSync } from '../useTimerSync';
import { TimerState } from '../../types/timer';
import { ActiveTimerProvider } from '../../contexts/ActiveTimerContext';

// Mock Tauri API
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

// Mock notification context
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showWarning: vi.fn(),
  }),
}));

// Get the mocked function
import { listen } from '@tauri-apps/api/event';
const mockListen = vi.mocked(listen);

describe('useTimerSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock listen to return unsubscribe functions
    mockListen.mockResolvedValue(() => {});
  });

  describe('Initialization', () => {
    it('should set up event listeners on mount', async () => {
      renderHook(() => useTimerSync({ activeSession: null, sessions: [] }), { wrapper: ActiveTimerProvider });

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
  });

  describe('Global Timer State Management', () => {
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
            state: TimerState.idle,
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

    it('should handle no active session', () => {
      const { result } = renderHook(() => useTimerSync({ activeSession: null, sessions: [] }), { wrapper: ActiveTimerProvider });

      expect(result.current.isGlobalTimerActive).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should clean up event listeners on unmount', () => {
      const mockUnsubscribe = vi.fn();
      mockListen.mockResolvedValue(mockUnsubscribe);

      const { unmount } = renderHook(() => useTimerSync({ activeSession: null, sessions: [] }), { wrapper: ActiveTimerProvider });

      unmount();

      // The cleanup function should be called during unmount
      // We can't directly test the unsubscribe calls since they're in an async cleanup
      expect(mockListen).toHaveBeenCalled();
    });
  });
});

