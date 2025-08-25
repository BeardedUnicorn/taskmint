/**
 * Tests for useSessionManagement hook
 * 
 * Comprehensive tests covering session creation, management, timer instances,
 * and integration with the backend.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSessionManagement } from '../useSessionManagement';
import { ActiveTimerProvider } from '../../contexts/ActiveTimerContext';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { listen } from '@tauri-apps/api/event';
const mockListen = vi.mocked(listen);

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

// Import the mocked invoke function
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

// Mock notification context
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}));

// Mock performance utilities
vi.mock('../../utils/performance', () => ({
  measurePerformance: vi.fn((name, fn) => fn()),
}));

describe('useSessionManagement', () => {
  const mockSession: TaskSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Test Task',
    timerInstances: [],
    totalDuration: 0,
    isActive: false,
    date: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockTimerInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date('2024-01-15T10:00:00Z'),
    state: TimerState.idle,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue([]);
    mockListen.mockResolvedValue(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should load sessions on mount', async () => {
      const sessions = [mockSession];
      mockInvoke.mockResolvedValueOnce(sessions);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(sessions);
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockInvoke).toHaveBeenCalledWith('get_sessions');
    });

    it('should identify active session on load', async () => {
      const activeSession = { ...mockSession, isActive: true };
      const sessions = [mockSession, activeSession];
      mockInvoke.mockResolvedValueOnce(sessions);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });
    });

    it('should handle loading errors', async () => {
      const error = new Error('Failed to load sessions');
      mockInvoke.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load sessions');
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockShowError).toHaveBeenCalledWith('Failed to load sessions');
    });
  });

  describe('session creation', () => {
    it('should create a new session', async () => {
      const newSession = { ...mockSession, id: 'new-session' };
      const newTimerInstance = { ...mockTimerInstance, sessionId: 'new-session' };
      mockInvoke
        .mockResolvedValueOnce([]) // Initial load
        .mockResolvedValueOnce(newSession) // Create session
        .mockResolvedValueOnce([newSession]); // Reload sessions

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        const created = await result.current.createSession('task-1', 'New Task');
        expect(created).toEqual(newSession);
      });

      expect(mockInvoke).toHaveBeenCalledWith('create_session', {
        taskId: 'task-1',
        taskName: 'New Task',
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('Session started for "New Task"');
    });

    it('should handle session creation errors', async () => {
      const error = new Error('Creation failed');
      mockInvoke
        .mockResolvedValueOnce([]) // Initial load
        .mockRejectedValueOnce(error); // Create session fails

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.createSession('task-1', 'New Task')
        ).rejects.toThrow('Creation failed');
      });

      expect(mockShowError).toHaveBeenCalledWith('Creation failed');
    });

    it('should trim task names when creating sessions', async () => {
      const newSession = { ...mockSession, taskName: 'Trimmed Task' };
      const newTimerInstance = { ...mockTimerInstance, sessionId: 'session-1' };
      mockInvoke
        .mockResolvedValueOnce([]) // Initial load
        .mockResolvedValueOnce(newSession) // Create session
        .mockResolvedValueOnce([newSession]); // Reload sessions

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.createSession('task-1', '  Trimmed Task  ');
      });

      expect(mockInvoke).toHaveBeenCalledWith('create_session', {
        taskId: 'task-1',
        taskName: 'Trimmed Task',
      });
    });
  });

  describe('session updates', () => {
    it('should update a session', async () => {
      const updatedSession = { ...mockSession, taskName: 'Updated Task' };
      mockInvoke
        .mockResolvedValueOnce([mockSession]) // Initial load
        .mockResolvedValueOnce(updatedSession); // Update session

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual([mockSession]);
      });

      await act(async () => {
        const updated = await result.current.updateSession('session-1', {
          taskName: 'Updated Task',
        });
        expect(updated).toEqual(updatedSession);
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_session', {
        sessionId: 'session-1',
        updates: { taskName: 'Updated Task' },
      });
      expect(result.current.sessions[0]).toEqual(updatedSession);
    });

    it('should update active session when it is modified', async () => {
      const activeSession = { ...mockSession, isActive: true };
      const updatedSession = { ...activeSession, taskName: 'Updated Active Task' };
      
      mockInvoke
        .mockResolvedValueOnce([activeSession]) // Initial load
        .mockResolvedValueOnce(updatedSession); // Update session

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      await act(async () => {
        await result.current.updateSession('session-1', {
          taskName: 'Updated Active Task',
        });
      });

      expect(result.current.activeSession).toEqual(updatedSession);
    });
  });

  describe('session deletion', () => {
    it('should delete a session', async () => {
      mockInvoke
        .mockResolvedValueOnce([mockSession]) // Initial load
        .mockResolvedValueOnce(undefined); // Delete session

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual([mockSession]);
      });

      await act(async () => {
        await result.current.deleteSession('session-1');
      });

      expect(mockInvoke).toHaveBeenCalledWith('delete_session', {
        sessionId: 'session-1',
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('Session deleted successfully');
      expect(result.current.sessions).toEqual([]);
    });

    it('should clear active session when deleted', async () => {
      const activeSession = { ...mockSession, isActive: true };
      mockInvoke
        .mockResolvedValueOnce([activeSession]) // Initial load
        .mockResolvedValueOnce(undefined); // Delete session

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      await act(async () => {
        await result.current.deleteSession('session-1');
      });

      expect(result.current.activeSession).toBeNull();
    });
  });

  describe('timer instance management', () => {
    it('should create a timer instance', async () => {
      mockInvoke
        .mockResolvedValueOnce([mockSession]) // Initial load
        .mockResolvedValueOnce(mockTimerInstance) // Create instance
        .mockResolvedValueOnce([mockSession]); // Reload sessions

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        const instance = await result.current.createTimerInstance('session-1');
        expect(instance).toEqual(mockTimerInstance);
      });

      expect(mockInvoke).toHaveBeenCalledWith('create_timer_instance', {
        sessionId: 'session-1',
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('New timer instance created');
    });

    it('should start a timer instance', async () => {
      const updatedSession = { ...mockSession, timerInstances: [{ ...mockTimerInstance, state: TimerState.running }] };
      mockInvoke
        .mockResolvedValueOnce([mockSession]) // Initial load
        .mockResolvedValueOnce(updatedSession); // Start timer

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-1');
      });

      expect(mockInvoke).toHaveBeenCalledWith('start_timer_instance', {
        instanceId: 'instance-1',
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer started');
    });

    it('should stop a timer instance', async () => {
      const updatedSession = { ...mockSession, timerInstances: [{ ...mockTimerInstance, state: TimerState.stopped }] };
      mockInvoke
        .mockResolvedValueOnce([mockSession]) // Initial load
        .mockResolvedValueOnce(updatedSession); // Stop timer

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.stopTimerInstance('instance-1');
      });

      expect(mockInvoke).toHaveBeenCalledWith('stop_timer_instance', {
        instanceId: 'instance-1',
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer stopped');
    });

    it('should append a new timer instance when restarting', async () => {
      const stoppedInstance = { ...mockTimerInstance, endTime: new Date(), duration: 1000, state: TimerState.stopped };
      const sessionWithStopped = { ...mockSession, timerInstances: [stoppedInstance] };
      const sessionAfterStart = {
        ...mockSession,
        timerInstances: [stoppedInstance, { ...mockTimerInstance, id: 'instance-2', state: TimerState.running }],
      };

      mockInvoke
        .mockResolvedValueOnce([sessionWithStopped]) // Initial load
        .mockResolvedValueOnce(sessionAfterStart); // start_timer_instance creates new instance internally

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-1');
      });

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'start_timer_instance', { instanceId: 'instance-1' });
      expect(result.current.sessions[0].timerInstances).toHaveLength(2);
      expect(result.current.sessions[0].timerInstances[1].state).toBe(TimerState.running);
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer started');
    });

    it('should stop an existing timer before starting another', async () => {
      const runningInstance = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const newInstance = { ...mockTimerInstance, id: 'instance-2', state: TimerState.idle };
      const initialSession = { ...mockSession, timerInstances: [runningInstance, newInstance] };
      const afterStop = { ...mockSession, timerInstances: [{ ...runningInstance, state: TimerState.stopped }, newInstance] };
      const afterStart = {
        ...mockSession,
        timerInstances: [{ ...runningInstance, state: TimerState.stopped }, { ...newInstance, state: TimerState.running }],
      };

      mockInvoke
        .mockResolvedValueOnce([initialSession]) // Initial load
        .mockRejectedValueOnce(new Error('Another timer instance is already running')) // First start attempt
        .mockResolvedValueOnce(afterStop) // Stop running timer
        .mockResolvedValueOnce(afterStart); // Retry start

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-2');
      });

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'start_timer_instance', { instanceId: 'instance-2' });
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'stop_timer_instance', { instanceId: 'instance-1' });
      expect(mockInvoke).toHaveBeenNthCalledWith(4, 'start_timer_instance', { instanceId: 'instance-2' });
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer started');
    });
  });

  describe('event listener management', () => {
    it('should have only one listener active after remounting', async () => {
      let activeListeners = 0;
      mockListen.mockImplementation(async () => {
        activeListeners++;
        return async () => {
          activeListeners--;
        };
      });

      const { unmount } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(activeListeners).toBe(1));

      unmount();
      await waitFor(() => expect(activeListeners).toBe(0));

      renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(activeListeners).toBe(1));
    });
  });

  describe('utility methods', () => {
    it('should get session by ID', async () => {
      mockInvoke.mockResolvedValueOnce([mockSession]);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual([mockSession]);
      });

      const found = result.current.getSessionById('session-1');
      expect(found).toEqual(mockSession);

      const notFound = result.current.getSessionById('nonexistent');
      expect(notFound).toBeUndefined();
    });

    it('should get sessions by task ID', async () => {
      const session2 = { ...mockSession, id: 'session-2', taskId: 'task-2' };
      const sessions = [mockSession, session2];
      mockInvoke.mockResolvedValueOnce(sessions);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(sessions);
      });

      const taskSessions = result.current.getSessionsByTaskId('task-1');
      expect(taskSessions).toEqual([mockSession]);
    });

    it('should get active session', async () => {
      const activeSession = { ...mockSession, isActive: true };
      mockInvoke.mockResolvedValueOnce([activeSession]);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      const active = result.current.getActiveSession();
      expect(active).toEqual(activeSession);
    });
  });

  describe('Pause/Resume Functionality', () => {
    describe('pauseTimerInstance', () => {
      it('should pause a timer instance successfully', async () => {
        const updatedSession = { ...mockSession, timerInstances: [{ ...mockTimerInstance, state: TimerState.paused }] };
        mockInvoke
          .mockResolvedValueOnce([mockSession]) // Initial load
          .mockResolvedValueOnce(updatedSession); // pause_timer_instance

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
          await result.current.pauseTimerInstance('instance-1');
        });

        expect(mockInvoke).toHaveBeenCalledWith('pause_timer_instance', {
          instanceId: 'instance-1',
        });
        expect(mockShowSuccess).toHaveBeenCalledWith('Timer paused');
      });

      it('should handle pause errors gracefully', async () => {
        const errorMessage = 'Cannot pause timer: timer is not running';
        mockInvoke
          .mockResolvedValueOnce([mockSession]) // Initial load
          .mockRejectedValueOnce(new Error(errorMessage)); // pause_timer_instance fails

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
          try {
            await result.current.pauseTimerInstance('instance-1');
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(errorMessage);
          }
        });

        expect(mockShowError).toHaveBeenCalledWith(errorMessage);
      });
    });

    describe('resumeTimerInstance', () => {
      it('should resume a timer instance successfully', async () => {
        const sessionWithRunningTimer = {
          ...mockSession,
          timerInstances: [{
            ...mockTimerInstance,
            state: TimerState.running,
          }],
        };

        mockInvoke
          .mockResolvedValueOnce([mockSession]) // Initial load
          .mockResolvedValueOnce(sessionWithRunningTimer); // resume_timer_instance

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
          await result.current.resumeTimerInstance('instance-1');
        });

        expect(mockInvoke).toHaveBeenCalledWith('resume_timer_instance', {
          instanceId: 'instance-1',
        });
        expect(mockShowSuccess).toHaveBeenCalledWith('Timer resumed');
      });

      it('should handle resume errors gracefully', async () => {
        const errorMessage = 'Cannot resume timer: timer is not paused';
        mockInvoke
          .mockResolvedValueOnce([mockSession]) // Initial load
          .mockRejectedValueOnce(new Error(errorMessage)); // resume_timer_instance fails

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
          try {
            await result.current.resumeTimerInstance('instance-1');
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(errorMessage);
          }
        });

        expect(mockShowError).toHaveBeenCalledWith(errorMessage);
      });
    });

    describe('Integration with existing timer operations', () => {
      it('should maintain consistency between start, pause, resume, and stop operations', async () => {
        const updatedSession = { ...mockSession, timerInstances: [mockTimerInstance] };
        mockInvoke
          .mockResolvedValueOnce([mockSession]) // Initial load
          .mockResolvedValue(updatedSession); // All timer operations return updated session

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        // Start timer
        await act(async () => {
          await result.current.startTimerInstance('instance-1');
        });

        // Pause timer
        await act(async () => {
          await result.current.pauseTimerInstance('instance-1');
        });

        // Resume timer
        await act(async () => {
          await result.current.resumeTimerInstance('instance-1');
        });

        // Stop timer
        await act(async () => {
          await result.current.stopTimerInstance('instance-1');
        });

        // Verify all operations were called
        expect(mockInvoke).toHaveBeenCalledWith('start_timer_instance', {
          instanceId: 'instance-1',
        });
        expect(mockInvoke).toHaveBeenCalledWith('pause_timer_instance', {
          instanceId: 'instance-1',
        });
        expect(mockInvoke).toHaveBeenCalledWith('resume_timer_instance', {
          instanceId: 'instance-1',
        });
        expect(mockInvoke).toHaveBeenCalledWith('stop_timer_instance', {
          instanceId: 'instance-1',
        });
      });
    });
  });
});
