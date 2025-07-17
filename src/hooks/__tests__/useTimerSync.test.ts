/**
 * Unit Tests for useTimerSync Hook
 * 
 * Tests the timer synchronization hook that manages coordination between
 * global timer and session-based timer systems.
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useTimerSync } from '../useTimerSync';
import { TimeEntry } from '../../types/timeEntry';
import { TaskSession, TimerInstance } from '../../types/timer';

// Mock Tauri API
const mockListen = vi.fn();
const mockEmit = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({
  listen: mockListen,
  emit: mockEmit,
  invoke: vi.fn(),
}));
}));

// Mock notification context
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}));

describe('useTimerSync', () => {
  const mockTimeEntry: TimeEntry = {
    id: 'entry-1',
    taskName: 'Development Work',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: undefined,
    isRunning: true,
    date: '2024-01-15',
  };

  const mockTimerInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: undefined,
    duration: 0,
    isRunning: true,
    isPaused: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockActiveSession: TaskSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Development Work',
    timerInstances: [mockTimerInstance],
    totalDuration: 0,
    isActive: true,
    date: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockSetActiveEntry = vi.fn();
  const mockSetActiveSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock listen to return unsubscribe functions
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should set up event listeners on mount', async () => {
      renderHook(() =>
        useTimerSync({
          activeEntry: null,
          setActiveEntry: mockSetActiveEntry,
          activeSession: null,
          setActiveSession: mockSetActiveSession,
        })
      );

      expect(mockListen).toHaveBeenCalledWith('timer-instance-started', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('timer-instance-stopped', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('timer-instance-paused', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('timer-instance-resumed', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('global-timer-started', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('global-timer-stopped', expect.any(Function));
    });

    it('should clean up event listeners on unmount', () => {
      const mockUnsubscribe = vi.fn();
      mockListen.mockResolvedValue(mockUnsubscribe);

      const { unmount } = renderHook(() =>
        useTimerSync({
          activeEntry: null,
          setActiveEntry: mockSetActiveEntry,
          activeSession: null,
          setActiveSession: mockSetActiveSession,
        })
      );

      unmount();

      // Unsubscribe functions should be called
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('Session Timer to Global Timer Sync', () => {
    it('should create global timer entry when session timer starts', async () => {
      let timerStartedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-instance-started') {
          timerStartedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: null,
          setActiveEntry: mockSetActiveEntry,
          activeSession: mockActiveSession,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate timer instance started event
      await act(async () => {
        timerStartedHandler!({
          payload: {
            instance: mockTimerInstance,
            session: mockActiveSession,
          },
        });
      });

      expect(mockSetActiveEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          taskName: 'Development Work',
          isRunning: true,
        })
      );
    });

    it('should stop global timer when session timer stops', async () => {
      let timerStoppedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-instance-stopped') {
          timerStoppedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: mockTimeEntry,
          setActiveEntry: mockSetActiveEntry,
          activeSession: mockActiveSession,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate timer instance stopped event
      await act(async () => {
        timerStoppedHandler!({
          payload: {
            instance: { ...mockTimerInstance, isRunning: false },
            session: mockActiveSession,
          },
        });
      });

      expect(mockSetActiveEntry).toHaveBeenCalledWith(null);
    });

    it('should pause global timer when session timer pauses', async () => {
      let timerPausedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-instance-paused') {
          timerPausedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: mockTimeEntry,
          setActiveEntry: mockSetActiveEntry,
          activeSession: mockActiveSession,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate timer instance paused event
      await act(async () => {
        timerPausedHandler!({
          payload: {
            instance: { ...mockTimerInstance, isRunning: false, isPaused: true },
            session: mockActiveSession,
          },
        });
      });

      expect(mockSetActiveEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          isRunning: false,
        })
      );
    });

    it('should resume global timer when session timer resumes', async () => {
      let timerResumedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-instance-resumed') {
          timerResumedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      const pausedEntry = { ...mockTimeEntry, isRunning: false };

      renderHook(() =>
        useTimerSync({
          activeEntry: pausedEntry,
          setActiveEntry: mockSetActiveEntry,
          activeSession: mockActiveSession,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate timer instance resumed event
      await act(async () => {
        timerResumedHandler!({
          payload: {
            instance: { ...mockTimerInstance, isRunning: true, isPaused: false },
            session: mockActiveSession,
          },
        });
      });

      expect(mockSetActiveEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          isRunning: true,
        })
      );
    });
  });

  describe('Global Timer to Session Timer Sync', () => {
    it('should create session when global timer starts without active session', async () => {
      let globalTimerStartedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'global-timer-started') {
          globalTimerStartedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: null,
          setActiveEntry: mockSetActiveEntry,
          activeSession: null,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate global timer started event
      await act(async () => {
        globalTimerStartedHandler!({
          payload: {
            entry: mockTimeEntry,
          },
        });
      });

      expect(mockEmit).toHaveBeenCalledWith('create-session-from-global', {
        taskName: 'Development Work',
        entry: mockTimeEntry,
      });
    });

    it('should stop session timer when global timer stops', async () => {
      let globalTimerStoppedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'global-timer-stopped') {
          globalTimerStoppedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: mockTimeEntry,
          setActiveEntry: mockSetActiveEntry,
          activeSession: mockActiveSession,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate global timer stopped event
      await act(async () => {
        globalTimerStoppedHandler!({
          payload: {
            entry: { ...mockTimeEntry, isRunning: false },
          },
        });
      });

      expect(mockEmit).toHaveBeenCalledWith('stop-session-timer', {
        sessionId: 'session-1',
      });
    });
  });

  describe('Conflict Resolution', () => {
    it('should prioritize session timer when both are running', async () => {
      const { result } = renderHook(() =>
        useTimerSync({
          activeEntry: mockTimeEntry,
          setActiveEntry: mockSetActiveEntry,
          activeSession: mockActiveSession,
          setActiveSession: mockSetActiveSession,
        })
      );

      expect(result.current.syncState).toBe('session-priority');
    });

    it('should handle sync conflicts gracefully', async () => {
      let timerStartedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-instance-started') {
          timerStartedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: mockTimeEntry, // Already has active global timer
          setActiveEntry: mockSetActiveEntry,
          activeSession: null,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate session timer starting while global timer is active
      await act(async () => {
        timerStartedHandler!({
          payload: {
            instance: mockTimerInstance,
            session: mockActiveSession,
          },
        });
      });

      // Should show warning about conflict
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Timer conflict detected')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle event listener errors gracefully', async () => {
      mockListen.mockRejectedValue(new Error('Failed to set up listener'));

      renderHook(() =>
        useTimerSync({
          activeEntry: null,
          setActiveEntry: mockSetActiveEntry,
          activeSession: null,
          setActiveSession: mockSetActiveSession,
        })
      );

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize timer synchronization')
      );
    });

    it('should handle missing event payload gracefully', async () => {
      let timerStartedHandler: Function;
      mockListen.mockImplementation((event, handler) => {
        if (event === 'timer-instance-started') {
          timerStartedHandler = handler;
        }
        return Promise.resolve(() => {});
      });

      renderHook(() =>
        useTimerSync({
          activeEntry: null,
          setActiveEntry: mockSetActiveEntry,
          activeSession: null,
          setActiveSession: mockSetActiveSession,
        })
      );

      // Simulate event with missing payload
      await act(async () => {
        timerStartedHandler!({});
      });

      // Should not crash and should log error
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid timer event payload')
      );
    });
  });
});
