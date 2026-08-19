/**
 * Tests for useSessionManagement hook
 *
 * Comprehensive tests covering session creation, management, timer instances,
 * and integration with the backend.
 *
 * Invoke mocking is keyed by command name (not positional), because the hook
 * issues auxiliary invokes on mount (get_sessions, get_session_load_warning)
 * whose ordering is an implementation detail.
 */

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

// Command-keyed invoke queues: prime per-command results; unprimed commands
// fall back to sensible defaults.
let commandQueues: Record<string, unknown[]>;

function primeCommand(command: string, ...results: unknown[]) {
  commandQueues[command] = [...(commandQueues[command] ?? []), ...results];
}

function installInvokeMock() {
  mockInvoke.mockImplementation(async (command: string) => {
    const queue = commandQueues[command];
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    }
    if (command === 'get_sessions') return [];
    if (command === 'get_session_load_warning') return null;
    return undefined;
  });
}

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
    commandQueues = {};
    installInvokeMock();
    mockListen.mockResolvedValue(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should load sessions on mount', async () => {
      const sessions = [mockSession];
      primeCommand('get_sessions', sessions);

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
      primeCommand('get_sessions', sessions);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });
    });

    it('should handle loading errors', async () => {
      primeCommand('get_sessions', new Error('Failed to load sessions'));

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load sessions');
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockShowError).toHaveBeenCalledWith('Failed to load sessions');
    });

    it('should surface a session load warning recorded by the backend', async () => {
      primeCommand('get_session_load_warning', '2 saved session record(s) could not be read and were skipped.');

      renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith(
          '2 saved session record(s) could not be read and were skipped.'
        );
      });
    });
  });

  describe('normalization', () => {
    it('should derive idle state for a fresh instance and stopped for a completed one', async () => {
      const freshFromBackend = {
        ...mockTimerInstance,
        id: 'fresh',
        state: undefined,
        isRunning: false,
        isPaused: false,
      } as unknown as TimerInstance;
      const completedFromBackend = {
        ...mockTimerInstance,
        id: 'completed',
        state: undefined,
        isRunning: false,
        isPaused: false,
        duration: 60_000,
        endTime: new Date('2024-01-15T11:00:00Z'),
      } as unknown as TimerInstance;
      const session = { ...mockSession, timerInstances: [freshFromBackend, completedFromBackend] };
      primeCommand('get_sessions', [session]);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1);
      });

      const [fresh, completed] = result.current.sessions[0].timerInstances;
      expect(fresh.state).toBe(TimerState.idle);
      expect(completed.state).toBe(TimerState.stopped);
    });
  });

  describe('session creation', () => {
    it('should create a new session', async () => {
      const newSession = { ...mockSession, id: 'new-session' };
      primeCommand('get_sessions', [], [newSession]); // initial load, reload after create
      primeCommand('create_session', newSession);

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
      primeCommand('create_session', new Error('Creation failed'));

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
      primeCommand('create_session', newSession);

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
      primeCommand('get_sessions', [mockSession]);
      primeCommand('update_session', updatedSession);

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

      primeCommand('get_sessions', [activeSession]);
      primeCommand('update_session', updatedSession);

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

  describe('timer instance updates', () => {
    it('should update a timer instance and reload sessions', async () => {
      const sessionWithInstance = {
        ...mockSession,
        timerInstances: [mockTimerInstance],
      };
      primeCommand('get_sessions', [sessionWithInstance], [sessionWithInstance]);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1);
      });
      const getSessionsCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'get_sessions').length;

      // The edit-save payload every page sends: net duration + derived
      // endTime, and the stop flags cleared.
      const updates = {
        duration: 90_000,
        endTime: '2024-01-15T10:01:30.000Z',
        isRunning: false,
        isPaused: false,
      };
      await act(async () => {
        await result.current.updateTimerInstance('instance-1', updates);
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_timer_instance', {
        instanceId: 'instance-1',
        updates,
      });
      // The command emits no event, so the hook must reload sessions itself.
      expect(
        mockInvoke.mock.calls.filter(([cmd]) => cmd === 'get_sessions').length
      ).toBeGreaterThan(getSessionsCalls);
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer updated');
    });

    it('should surface backend errors without throwing', async () => {
      primeCommand('get_sessions', [mockSession]);
      primeCommand('update_timer_instance', new Error('Timer instance with ID missing not found'));

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual([mockSession]);
      });

      await act(async () => {
        await result.current.updateTimerInstance('missing', { duration: 1_000 });
      });

      expect(mockShowError).toHaveBeenCalledWith('Timer instance with ID missing not found');
      expect(result.current.error).toBe('Timer instance with ID missing not found');
    });
  });

  describe('session deletion', () => {
    it('should delete a session', async () => {
      primeCommand('get_sessions', [mockSession]);

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
      primeCommand('get_sessions', [activeSession]);

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
      primeCommand('get_sessions', [mockSession], [mockSession]);
      primeCommand('create_timer_instance', mockTimerInstance);

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
      primeCommand('get_sessions', [mockSession]);
      primeCommand('start_timer_instance', updatedSession);

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
      primeCommand('get_sessions', [mockSession]);
      primeCommand('stop_timer_instance', updatedSession);

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

    it('should surface an error when starting a completed timer', async () => {
      // A stopped timer is final: the backend refuses to restart it and the
      // hook must not attempt any automatic recovery for this error.
      const stoppedInstance = { ...mockTimerInstance, endTime: new Date(), duration: 1000, state: TimerState.stopped };
      const sessionWithStopped = { ...mockSession, timerInstances: [stoppedInstance] };
      const errorMessage = 'Timer instance has already completed; create a new timer instead';

      primeCommand('get_sessions', [sessionWithStopped]);
      primeCommand('start_timer_instance', new Error(errorMessage));

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-1');
      });

      expect(mockShowError).toHaveBeenCalledWith(errorMessage);
      const startCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'start_timer_instance');
      expect(startCalls).toHaveLength(1);
    });

    it('should activate an inactive session and retry the start', async () => {
      const idleInstance = { ...mockTimerInstance, state: TimerState.idle };
      const inactiveSession = { ...mockSession, timerInstances: [idleInstance] };
      const activatedSession = { ...inactiveSession, isActive: true };
      const startedSession = {
        ...activatedSession,
        timerInstances: [{ ...idleInstance, state: TimerState.running }],
      };

      primeCommand('get_sessions', [inactiveSession]);
      primeCommand('start_timer_instance', new Error('Cannot start timer for inactive session'), startedSession);
      primeCommand('set_active_session', [activatedSession]);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-1');
      });

      expect(mockInvoke).toHaveBeenCalledWith('set_active_session', { sessionId: 'session-1' });
      const startCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'start_timer_instance');
      expect(startCalls).toHaveLength(2);
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer started');
    });

    it('should stop an existing timer before starting another', async () => {
      const runningInstance = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const newInstance = { ...mockTimerInstance, id: 'instance-2', state: TimerState.idle };
      const initialSession = { ...mockSession, isActive: true, timerInstances: [runningInstance, newInstance] };
      const afterStop = { ...initialSession, timerInstances: [{ ...runningInstance, state: TimerState.stopped }, newInstance] };
      const afterStart = {
        ...initialSession,
        timerInstances: [{ ...runningInstance, state: TimerState.stopped }, { ...newInstance, state: TimerState.running }],
      };

      primeCommand('get_sessions', [initialSession]);
      primeCommand('start_timer_instance', new Error('Another timer instance is already running'), afterStart);
      primeCommand('stop_timer_instance', afterStop);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-2');
      });

      expect(mockInvoke).toHaveBeenCalledWith('stop_timer_instance', { instanceId: 'instance-1' });
      const startCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'start_timer_instance');
      expect(startCalls).toHaveLength(2);
      expect(mockShowSuccess).toHaveBeenCalledWith('Timer started');
    });
  });

  describe('event listener management', () => {
    it('registers the backend timer-instance listeners once and cleans them up', async () => {
      let activeListeners = 0;
      mockListen.mockImplementation(async () => {
        activeListeners++;
        return async () => {
          activeListeners--;
        };
      });

      const expectedListenerCount = 5; // timer-instance started/stopped/paused/resumed/deleted

      const { unmount } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(activeListeners).toBe(expectedListenerCount));

      unmount();
      await waitFor(() => expect(activeListeners).toBe(0));

      renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(activeListeners).toBe(expectedListenerCount));
    });

    it('pauses running timers of the active session on the window inactivity event', async () => {
      const runningInstance = { ...mockTimerInstance, state: TimerState.running };
      const activeSession = { ...mockSession, isActive: true, timerInstances: [runningInstance] };
      const pausedSession = {
        ...activeSession,
        timerInstances: [{ ...runningInstance, state: TimerState.paused }],
      };

      primeCommand('get_sessions', [activeSession], [pausedSession]);
      primeCommand('pause_timer_instance', pausedSession);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      await act(async () => {
        window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
          detail: { reason: 'inactivity', timestamp: new Date() },
        }));
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('pause_timer_instance', {
          instanceId: 'instance-1',
        });
      });
    });

    it('resumes timers paused by inactivity when activity returns', async () => {
      const runningInstance = { ...mockTimerInstance, state: TimerState.running };
      const activeSession = { ...mockSession, isActive: true, timerInstances: [runningInstance] };
      const pausedSession = {
        ...activeSession,
        timerInstances: [{ ...runningInstance, state: TimerState.paused }],
      };

      primeCommand('get_sessions', [activeSession], [pausedSession]);
      primeCommand('pause_timer_instance', pausedSession);
      primeCommand('resume_timer_instance', activeSession);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      await act(async () => {
        window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
          detail: { reason: 'inactivity', timestamp: new Date() },
        }));
      });

      await waitFor(() => {
        expect(result.current.activeSession?.timerInstances[0].state).toBe(TimerState.paused);
      });

      await act(async () => {
        window.dispatchEvent(new CustomEvent('timer-resume-activity', {
          detail: { reason: 'activity-detected', timestamp: new Date() },
        }));
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('resume_timer_instance', {
          instanceId: 'instance-1',
        });
      });
    });

    it('does not auto-resume a timer the user paused from the warning dialog', async () => {
      const runningInstance = { ...mockTimerInstance, state: TimerState.running };
      const activeSession = { ...mockSession, isActive: true, timerInstances: [runningInstance] };
      const pausedSession = {
        ...activeSession,
        timerInstances: [{ ...runningInstance, state: TimerState.paused }],
      };

      primeCommand('get_sessions', [activeSession], [pausedSession]);
      primeCommand('pause_timer_instance', pausedSession);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      // The user explicitly chose to pause via the warning dialog
      await act(async () => {
        window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
          detail: { reason: 'user-action', timestamp: new Date() },
        }));
      });

      await waitFor(() => {
        expect(result.current.activeSession?.timerInstances[0].state).toBe(TimerState.paused);
      });

      await act(async () => {
        window.dispatchEvent(new CustomEvent('timer-resume-activity', {
          detail: { reason: 'activity-detected', timestamp: new Date() },
        }));
      });

      const resumeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'resume_timer_instance');
      expect(resumeCalls).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should get session by ID', async () => {
      primeCommand('get_sessions', [mockSession]);

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
      primeCommand('get_sessions', sessions);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.sessions).toEqual(sessions);
      });

      const taskSessions = result.current.getSessionsByTaskId('task-1');
      expect(taskSessions).toEqual([mockSession]);
    });

    it('should get active session', async () => {
      const activeSession = { ...mockSession, isActive: true };
      primeCommand('get_sessions', [activeSession]);

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
        primeCommand('get_sessions', [mockSession]);
        primeCommand('pause_timer_instance', updatedSession);

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
        primeCommand('get_sessions', [mockSession]);
        primeCommand('pause_timer_instance', new Error(errorMessage));

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
          await result.current.pauseTimerInstance('instance-1');
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

        primeCommand('get_sessions', [mockSession]);
        primeCommand('resume_timer_instance', sessionWithRunningTimer);

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
        primeCommand('get_sessions', [mockSession]);
        primeCommand('resume_timer_instance', new Error(errorMessage));

        const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
          await result.current.resumeTimerInstance('instance-1');
        });

        expect(mockShowError).toHaveBeenCalledWith(errorMessage);
      });
    });

    describe('Integration with existing timer operations', () => {
      it('should maintain consistency between start, pause, resume, and stop operations', async () => {
        const updatedSession = { ...mockSession, timerInstances: [mockTimerInstance] };
        primeCommand('get_sessions', [mockSession]);
        primeCommand('start_timer_instance', updatedSession);
        primeCommand('pause_timer_instance', updatedSession);
        primeCommand('resume_timer_instance', updatedSession);
        primeCommand('stop_timer_instance', updatedSession);

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
