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
import { ActiveTimerProvider, useActiveTimer } from '../../contexts/ActiveTimerContext';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { fakeBackend } from '../../testing';
import { BACKEND_EVENTS } from '../../constants/events';

// The fake backend's command mock
const mockInvoke = fakeBackend().call;

// Mock notification context
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowInfo = vi.fn();
const mockShowWarning = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
    showWarning: mockShowWarning,
  }),
}));

// Command-keyed call queues: prime per-command results; unprimed commands
// fall back to sensible defaults.
let commandQueues: Record<string, unknown[]>;

function primeCommand(command: string, ...results: unknown[]) {
  commandQueues[command] = [...(commandQueues[command] ?? []), ...results];
}

/**
 * A reply as the backend sends it: timers carry isRunning/isPaused (and a
 * finished one its duration) rather than a `state`, so fixtures can say
 * `state` and still reach the hook in wire form.
 */
function toWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === 'object') {
    if ('timerInstances' in value) {
      return { ...value, timerInstances: (value as TaskSession).timerInstances.map(toWire) };
    }
    if ('state' in value) {
      const { state, ...instance } = value as TimerInstance;
      return {
        ...instance,
        isRunning: state === TimerState.running,
        isPaused: state === TimerState.paused,
        duration: instance.duration ?? (state === TimerState.stopped ? 0 : null),
      };
    }
  }
  return value;
}

function installInvokeMock() {
  mockInvoke.mockImplementation(async (command: string) => {
    const queue = commandQueues[command];
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return toWire(next);
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
    startTime: '2024-01-15T10:00:00Z',
    state: TimerState.idle,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    commandQueues = {};
    installInvokeMock();
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
        expect(result.current.isLoading).toBe(false);
      });

      // A failed load stays up until dismissed
      expect(mockShowError).toHaveBeenCalledWith(
        'Failed to load sessions',
        expect.objectContaining({ duration: null })
      );
    });

    it('should surface a session load warning recorded by the backend', async () => {
      primeCommand('get_session_load_warning', '2 saved session record(s) could not be read and were skipped.');

      renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(mockShowWarning).toHaveBeenCalledWith(
          '2 saved session record(s) could not be read and were skipped.',
          expect.objectContaining({ duration: null })
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

  describe('starting work', () => {
    async function renderReady() {
      const hook = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => {
        expect(hook.result.current.isLoading).toBe(false);
      });
      return hook;
    }

    it('starts the task through start_task, reloads, and announces it', async () => {
      const started = { ...mockSession, id: 'new-session' };
      primeCommand('get_sessions', [], [started]); // initial load, reload after start
      primeCommand('start_task', { outcome: 'started', instanceId: 'i-1', stoppedTaskName: null });
      const { result } = await renderReady();

      await act(async () => {
        const outcome = await result.current.startTask('task-1', 'Annotation');
        expect(outcome?.outcome).toBe('started');
      });

      expect(mockInvoke).toHaveBeenCalledWith('start_task', { taskId: 'task-1', taskName: 'Annotation' });
      expect(result.current.sessions).toEqual([started]);
      // The running timer shows on screen: no toast
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockShowInfo).not.toHaveBeenCalled();
    });

    it('announces the hand-off when another task was running', async () => {
      primeCommand('start_task', { outcome: 'started', instanceId: 'i-1', stoppedTaskName: 'Review' });
      const { result } = await renderReady();

      await act(async () => {
        await result.current.startTask('task-1', 'Annotation');
      });

      expect(mockShowInfo).toHaveBeenCalledWith(
        'Started "Annotation" — stopped the running timer for "Review"',
        expect.anything()
      );
    });

    it('says when it resumed the task instead', async () => {
      primeCommand('start_task', { outcome: 'resumed', instanceId: 'i-1', stoppedTaskName: null });
      const { result } = await renderReady();

      await act(async () => {
        await result.current.startTask('task-1', 'Annotation');
      });

      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockShowInfo).not.toHaveBeenCalled();
    });

    it('says when the task is already running', async () => {
      primeCommand('start_task', { outcome: 'alreadyRunning', instanceId: null, stoppedTaskName: null });
      const { result } = await renderReady();

      await act(async () => {
        await result.current.startTask('task-1', 'Annotation');
      });

      expect(mockShowInfo).toHaveBeenCalledWith('"Annotation" is already running', expect.anything());
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });

    it('surfaces a backend error and returns null', async () => {
      primeCommand('start_task', new Error('Choose a task to start'));
      const { result } = await renderReady();

      let outcome: unknown = 'unset';
      await act(async () => {
        outcome = await result.current.startTask('task-1', 'Annotation');
      });

      expect(outcome).toBeNull();
      expect(mockShowError).toHaveBeenCalledWith('Choose a task to start', expect.anything());
    });
  });

  describe('adding time after the fact', () => {
    it('sends the entry to add_manual_time and announces it', async () => {
      const manual = { ...mockSession, id: 'manual-1', source: 'manual', isActive: false };
      primeCommand('get_sessions', [], [manual]);
      primeCommand('add_manual_time', manual);
      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const startTime = new Date(2026, 9, 10, 9, 0, 0);
      await act(async () => {
        await result.current.addManualTime({
          taskId: 'task-1',
          taskName: 'Annotation',
          startTime,
          durationMs: 90 * 60_000,
        });
      });

      expect(mockInvoke).toHaveBeenCalledWith('add_manual_time', {
        taskId: 'task-1',
        taskName: 'Annotation',
        startTime: startTime.toISOString(),
        durationMs: 90 * 60_000,
      });
      expect(result.current.sessions).toEqual([manual]);
      expect(mockShowSuccess).toHaveBeenCalledWith('Added 1h 30m to "Annotation" on Oct 10');
    });

    it('rejects with the backend reason so the dialog can show it', async () => {
      primeCommand('add_manual_time', new Error('This overlaps time already tracked for "Review"'));
      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await expect(
          result.current.addManualTime({
            taskId: 'task-1',
            taskName: 'Annotation',
            startTime: new Date(2026, 9, 10, 9, 0, 0),
            durationMs: 60_000,
          })
        ).rejects.toThrow('This overlaps time already tracked for "Review"');
      });
      expect(mockShowError).not.toHaveBeenCalled();
    });
  });

  describe('editing a finished timer', () => {
    const finished = {
      ...mockTimerInstance,
      state: TimerState.stopped,
      duration: 60_000,
      endTime: new Date('2024-01-15T10:01:00Z'),
    };
    const withTimer = { ...mockSession, timerInstances: [finished] };
    const updates = { duration: 90_000, isRunning: false, isPaused: false };

    it('saves a duration edit and reports its session', async () => {
      primeCommand('get_sessions', [withTimer], [withTimer]);
      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.editTimerEntry('instance-1', { updates });
      });

      expect(mockInvoke).toHaveBeenCalledWith('update_timer_instance', { instanceId: 'instance-1', updates });
      expect(mockInvoke).not.toHaveBeenCalledWith('move_timer_instance', expect.anything());
      expect(sessionId).toBe('session-1');
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });

    it('moves the timer to another task after saving its duration', async () => {
      primeCommand('get_sessions', [withTimer], [withTimer]);
      primeCommand('move_timer_instance', 'session-new');
      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.editTimerEntry('instance-1', {
          updates,
          moveTo: { taskId: 'task-2', taskName: 'Other' },
        });
      });

      const commands = mockInvoke.mock.calls.map(([cmd]) => cmd);
      expect(commands.indexOf('update_timer_instance')).toBeLessThan(commands.indexOf('move_timer_instance'));
      expect(mockInvoke).toHaveBeenCalledWith('move_timer_instance', {
        instanceId: 'instance-1',
        taskId: 'task-2',
        taskName: 'Other',
      });
      expect(sessionId).toBe('session-new');
      expect(mockShowSuccess).toHaveBeenCalledWith('Moved to "Other"', expect.anything());
    });

    it('shows the error and resolves to null when the move is refused', async () => {
      primeCommand('get_sessions', [withTimer], [withTimer]);
      primeCommand('move_timer_instance', new Error('Imported time changes only through a work-log import'));
      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      let sessionId: string | null = 'unset';
      await act(async () => {
        sessionId = await result.current.editTimerEntry('instance-1', {
          moveTo: { taskId: 'task-2', taskName: 'Other' },
        });
      });

      expect(sessionId).toBeNull();
      expect(mockShowError).toHaveBeenCalledWith(
        'Imported time changes only through a work-log import',
        expect.anything()
      );
    });
  });

  describe('session deletion', () => {
    const finished: TimerInstance = {
      id: 'done-1',
      sessionId: 'session-1',
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:05:00Z',
      duration: 65 * 60_000,
      isRunning: false,
      isPaused: false,
      state: TimerState.stopped,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:05:00Z',
    };
    const withTime: TaskSession = { ...mockSession, timerInstances: [finished], totalDuration: 65 * 60_000 };

    it('deletes a session and offers Undo, which restores the snapshot', async () => {
      primeCommand('get_sessions', [withTime]);
      primeCommand('delete_session', withTime);
      primeCommand('restore_session', withTime);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteSession('session-1');
      });

      expect(deleted).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('delete_session', { sessionId: 'session-1' });
      expect(result.current.sessions).toEqual([]);
      expect(mockShowInfo).toHaveBeenCalledWith('Deleted the "Test Task" session (1 timer, 1h 5m)', {
        category: 'session',
        actions: [expect.objectContaining({ label: 'Undo' })],
      });

      const [, { actions }] = mockShowInfo.mock.calls.at(-1)!;
      await act(async () => {
        actions[0].onClick();
      });
      await waitFor(() => expect(result.current.sessions.map(s => s.id)).toEqual(['session-1']));
      // What delete_session sent back
      expect(mockInvoke).toHaveBeenCalledWith('restore_session', { session: toWire(withTime) });
    });

    it('reports a failed delete without an Undo', async () => {
      primeCommand('get_sessions', [mockSession]);
      primeCommand('delete_session', new Error('Imported time changes only through a work-log import'));

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      let deleted = true;
      await act(async () => {
        deleted = await result.current.deleteSession('session-1');
      });

      expect(deleted).toBe(false);
      expect(result.current.sessions).toHaveLength(1);
      expect(mockShowError).toHaveBeenCalledWith(
        'Imported time changes only through a work-log import',
        expect.anything()
      );
      expect(mockShowInfo).not.toHaveBeenCalled();
    });

    it('should clear active session when deleted', async () => {
      const activeSession = { ...mockSession, isActive: true };
      primeCommand('get_sessions', [activeSession]);
      primeCommand('delete_session', { ...activeSession, isActive: false });

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });

      await waitFor(() => {
        expect(result.current.activeSession).toEqual(activeSession);
      });

      await act(async () => {
        await result.current.deleteSession('session-1');
      });

      expect(result.current.activeSession).toBeNull();
    });

    it('puts a deleted timer back in its place with Undo', async () => {
      const other = { ...finished, id: 'done-2', duration: 60_000 };
      const session = { ...withTime, timerInstances: [finished, other] };
      primeCommand('get_sessions', [session]);
      primeCommand('delete_timer_instance', { ...session, timerInstances: [other] });
      primeCommand('restore_timer_instance', session);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      await act(async () => {
        await result.current.deleteTimerInstance('done-1');
      });
      expect(result.current.sessions[0].timerInstances.map(i => i.id)).toEqual(['done-2']);
      expect(mockShowInfo).toHaveBeenCalledWith('Deleted 1h 5m from "Test Task"', {
        category: 'timer',
        actions: [expect.objectContaining({ label: 'Undo' })],
      });

      const [, { actions }] = mockShowInfo.mock.calls.at(-1)!;
      await act(async () => {
        actions[0].onClick();
      });
      await waitFor(() =>
        expect(result.current.sessions[0].timerInstances.map(i => i.id)).toEqual(['done-1', 'done-2'])
      );
      expect(mockInvoke).toHaveBeenCalledWith('restore_timer_instance', {
        sessionId: 'session-1',
        instance: expect.objectContaining({ id: 'done-1', duration: 65 * 60_000 }),
        index: 0,
      });
    });

    it("doesn't offer Undo for a timer that never ran", async () => {
      const session = { ...mockSession, timerInstances: [mockTimerInstance] };
      primeCommand('get_sessions', [session]);
      primeCommand('delete_timer_instance', { ...session, timerInstances: [] });

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteTimerInstance('instance-1');
      });

      expect(deleted).toBe(true);
      expect(mockShowInfo).not.toHaveBeenCalled();
      expect(mockShowSuccess).not.toHaveBeenCalled();
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
        expect(instance).toMatchObject(mockTimerInstance);
      });

      expect(mockInvoke).toHaveBeenCalledWith('create_timer_instance', {
        sessionId: 'session-1',
      });
      expect(mockShowSuccess).not.toHaveBeenCalled();
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
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });

    it('keeps its actions stable when the running timer changes', async () => {
      const running = {
        ...mockSession,
        isActive: true,
        timerInstances: [{ ...mockTimerInstance, state: TimerState.running }],
      };
      primeCommand('get_sessions', [{ ...mockSession, isActive: true, timerInstances: [mockTimerInstance] }]);
      primeCommand('start_timer_instance', running);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const before = result.current;

      await act(async () => {
        await result.current.startTimerInstance('instance-1');
      });

      expect(result.current.sessions).not.toBe(before.sessions);
      expect(result.current.deleteSession).toBe(before.deleteSession);
      expect(result.current.stopTimerInstance).toBe(before.stopTimerInstance);
      expect(result.current.endActiveSession).toBe(before.endActiveSession);
      expect(result.current.startTask).toBe(before.startTask);
    });

    it('stays busy until every timer of an ending session has stopped', async () => {
      const active = {
        ...mockSession,
        isActive: true,
        timerInstances: [
          { ...mockTimerInstance, id: 'a', state: TimerState.running, isRunning: true },
          { ...mockTimerInstance, id: 'b', state: TimerState.paused, isPaused: true },
        ],
      };
      primeCommand('get_sessions', [active]);
      let releaseSecondStop!: () => void;
      primeCommand('stop_timer_instance', { ...active });
      primeCommand('set_active_session', [{ ...active, isActive: false }]);
      const loadingDuringEnd: boolean[] = [];

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.activeSession?.id).toBe('session-1'));

      mockInvoke.mockImplementationOnce(async () => ({ ...active }));
      mockInvoke.mockImplementationOnce(
        () => new Promise(resolve => (releaseSecondStop = () => resolve({ ...active })))
      );
      let ending!: Promise<void>;
      act(() => {
        ending = result.current.endActiveSession();
      });
      await waitFor(() => expect(releaseSecondStop).toBeDefined());
      loadingDuringEnd.push(result.current.isLoading);
      installInvokeMock();
      primeCommand('set_active_session', [{ ...active, isActive: false }]);
      await act(async () => {
        releaseSecondStop();
        await ending;
      });

      expect(loadingDuringEnd).toEqual([true]);
      expect(result.current.isLoading).toBe(false);
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
      expect(mockShowSuccess).not.toHaveBeenCalled();
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

      expect(mockShowError).toHaveBeenCalledWith(errorMessage, expect.anything());
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
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });

    it('should stop an existing timer before starting another', async () => {
      const runningInstance = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const newInstance = { ...mockTimerInstance, id: 'instance-2', state: TimerState.idle };
      const initialSession = { ...mockSession, isActive: true, timerInstances: [runningInstance, newInstance] };
      const afterStop = {
        ...initialSession,
        timerInstances: [{ ...runningInstance, state: TimerState.stopped }, newInstance],
      };
      const afterStart = {
        ...initialSession,
        timerInstances: [
          { ...runningInstance, state: TimerState.stopped },
          { ...newInstance, state: TimerState.running },
        ],
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
      // The hand-off is explicit: the toast names the timer that was stopped.
      expect(mockShowInfo).toHaveBeenCalledWith('Stopped the running timer for "Test Task"', expect.anything());
    });

    it('recovery targets the currently running timer, not a stale closure', async () => {
      // Two hand-offs driven through the SAME captured callback (as rapid
      // successive clicks would): the second recovery must stop instance-2
      // (running now), not instance-1 (running when the closure was created).
      const i1 = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const i2 = { ...mockTimerInstance, id: 'instance-2', state: TimerState.idle };
      const i3 = { ...mockTimerInstance, id: 'instance-3', state: TimerState.idle };
      const initialSession = { ...mockSession, isActive: true, timerInstances: [i1, i2, i3] };
      const afterStop1 = {
        ...initialSession,
        timerInstances: [{ ...i1, state: TimerState.stopped }, i2, i3],
      };
      const afterStart1 = {
        ...initialSession,
        timerInstances: [{ ...i1, state: TimerState.stopped }, { ...i2, state: TimerState.running }, i3],
      };
      const afterStop2 = {
        ...initialSession,
        timerInstances: [{ ...i1, state: TimerState.stopped }, { ...i2, state: TimerState.stopped }, i3],
      };
      const afterStart2 = {
        ...initialSession,
        timerInstances: [
          { ...i1, state: TimerState.stopped },
          { ...i2, state: TimerState.stopped },
          { ...i3, state: TimerState.running },
        ],
      };

      primeCommand(
        'start_timer_instance',
        new Error('Another timer instance is already running'),
        afterStart1,
        new Error('Another timer instance is already running'),
        afterStart2
      );
      primeCommand('stop_timer_instance', afterStop1, afterStop2);
      primeCommand('get_sessions', [initialSession]);

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1);
      });

      const start = result.current.startTimerInstance;

      await act(async () => {
        await start('instance-2');
      });
      await act(async () => {
        await start('instance-3');
      });

      const stopCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'stop_timer_instance');
      expect(stopCalls.map(([, args]) => args)).toEqual([{ instanceId: 'instance-1' }, { instanceId: 'instance-2' }]);
    });

    it('tolerates the other timer being already stopped during recovery', async () => {
      // A same-tick double start can race the recovery stop; the obstacle is
      // already gone, so the start must still succeed without an error toast.
      const runningInstance = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const newInstance = { ...mockTimerInstance, id: 'instance-2', state: TimerState.idle };
      const initialSession = { ...mockSession, isActive: true, timerInstances: [runningInstance, newInstance] };
      const afterStart = {
        ...initialSession,
        timerInstances: [
          { ...runningInstance, state: TimerState.stopped },
          { ...newInstance, state: TimerState.running },
        ],
      };

      primeCommand('get_sessions', [initialSession]);
      primeCommand('start_timer_instance', new Error('Another timer instance is already running'), afterStart);
      primeCommand('stop_timer_instance', new Error('Cannot stop timer: timer is not running'));

      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.startTimerInstance('instance-2');
      });

      expect(mockShowError).not.toHaveBeenCalled();
      expect(mockShowInfo).toHaveBeenCalledWith(
        expect.stringContaining('Stopped the running timer'),
        expect.anything()
      );
      const startCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'start_timer_instance');
      expect(startCalls).toHaveLength(2);
    });

    it('setActiveSession re-derives the shared active timer', async () => {
      const runningInstance = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const sessionA = { ...mockSession, id: 'session-1', isActive: true, timerInstances: [runningInstance] };
      const sessionB = { ...mockSession, id: 'session-2', taskName: 'Task B', isActive: false, timerInstances: [] };
      const afterSwitch = [
        { ...sessionA, isActive: false, timerInstances: [{ ...runningInstance, state: TimerState.stopped }] },
        { ...sessionB, isActive: true },
      ];

      primeCommand('get_sessions', [sessionA, sessionB]);
      primeCommand('set_active_session', afterSwitch);

      const { result } = renderHook(() => ({ mgmt: useSessionManagement(), timer: useActiveTimer() }), {
        wrapper: ActiveTimerProvider,
      });

      await waitFor(() => {
        expect(result.current.timer.activeTimer?.id).toBe('instance-1');
      });

      await act(async () => {
        await result.current.mgmt.setActiveSession(sessionB);
      });

      // The backend finalized session A's runner; the shared slot must not
      // keep pointing at it until the debounced reload.
      expect(result.current.timer.activeTimer).toBeNull();
      expect(mockShowInfo).toHaveBeenCalledWith('Stopped the running timer for "Test Task"', expect.anything());
    });

    it('deleteSession clears the shared active timer it contained', async () => {
      const runningInstance = { ...mockTimerInstance, id: 'instance-1', state: TimerState.running };
      const sessionA = { ...mockSession, isActive: true, timerInstances: [runningInstance] };

      primeCommand('get_sessions', [sessionA]);

      const { result } = renderHook(() => ({ mgmt: useSessionManagement(), timer: useActiveTimer() }), {
        wrapper: ActiveTimerProvider,
      });

      await waitFor(() => {
        expect(result.current.timer.activeTimer?.id).toBe('instance-1');
      });

      await act(async () => {
        await result.current.mgmt.deleteSession('session-1');
      });

      expect(result.current.timer.activeTimer).toBeNull();
    });
  });

  describe('event listener management', () => {
    it('registers the backend timer-instance listeners once and cleans them up', async () => {
      // timer-instance started/stopped/paused/resumed/deleted + work-logs-imported + sessions-changed
      const events = [
        BACKEND_EVENTS.TIMER_INSTANCE_STARTED,
        BACKEND_EVENTS.TIMER_INSTANCE_STOPPED,
        BACKEND_EVENTS.TIMER_INSTANCE_PAUSED,
        BACKEND_EVENTS.TIMER_INSTANCE_RESUMED,
        BACKEND_EVENTS.TIMER_INSTANCE_DELETED,
        BACKEND_EVENTS.WORK_LOGS_IMPORTED,
        BACKEND_EVENTS.SESSIONS_CHANGED,
        BACKEND_EVENTS.RESYNC,
      ];
      const listening = () => events.filter(event => fakeBackend().listenerCount(event) === 1).length;

      const { result, unmount, rerender } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      rerender();
      expect(listening()).toBe(8);
      expect(fakeBackend().subscribe).toHaveBeenCalledTimes(8);

      unmount();
      expect(listening()).toBe(0);

      const again = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      expect(listening()).toBe(8);
      await waitFor(() => expect(again.result.current.hasLoaded).toBe(true));
    });

    it('no longer pauses timers on in-window inactivity events (detection runs in the backend)', async () => {
      const running = {
        ...mockSession,
        isActive: true,
        timerInstances: [{ ...mockTimerInstance, state: TimerState.running, isRunning: true }],
      };
      primeCommand('get_sessions', [running]);
      const { result } = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(result.current.sessions).toHaveLength(1));

      await act(async () => {
        window.dispatchEvent(new CustomEvent('timer-pause-inactivity', { detail: { reason: 'inactivity' } }));
      });

      expect(mockInvoke).not.toHaveBeenCalledWith('pause_timer_instance', expect.anything());
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
        expect(mockShowSuccess).not.toHaveBeenCalled();
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

        expect(mockShowError).toHaveBeenCalledWith(errorMessage, expect.anything());
      });
    });

    describe('resumeTimerInstance', () => {
      it('should resume a timer instance successfully', async () => {
        const sessionWithRunningTimer = {
          ...mockSession,
          timerInstances: [
            {
              ...mockTimerInstance,
              state: TimerState.running,
            },
          ],
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
        expect(mockShowSuccess).not.toHaveBeenCalled();
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

        expect(mockShowError).toHaveBeenCalledWith(errorMessage, expect.anything());
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

  describe('the rest of what it does', () => {
    const running = (id: string, sessionId = 'session-1'): TimerInstance => ({
      ...mockTimerInstance,
      id,
      sessionId,
      state: TimerState.running,
    });
    const paused = (id: string, pausedAt: string | null): TimerInstance => ({
      ...mockTimerInstance,
      id,
      state: TimerState.paused,
      pausedAt,
    });
    const ready = async () => {
      const hook = renderHook(() => useSessionManagement(), { wrapper: ActiveTimerProvider });
      await waitFor(() => expect(hook.result.current.hasLoaded).toBe(true));
      return hook;
    };
    const calls = (command: string) => mockInvoke.mock.calls.filter(([cmd]) => cmd === command);

    describe('loading', () => {
      it('asks for the load warning once, even when mounted twice in StrictMode', async () => {
        primeCommand('get_session_load_warning', 'Skipped 2 unreadable sessions');
        const { result } = renderHook(() => useSessionManagement(), {
          wrapper: ActiveTimerProvider,
          reactStrictMode: true,
        });
        await waitFor(() => expect(result.current.hasLoaded).toBe(true));

        expect(calls('get_session_load_warning')).toHaveLength(1);
        await waitFor(() => expect(mockShowWarning).toHaveBeenCalledTimes(1));
      });

      it("shows nothing when the load warning can't be read", async () => {
        primeCommand('get_session_load_warning', new Error('unreachable'));
        await ready();

        expect(mockShowWarning).not.toHaveBeenCalled();
        expect(mockShowError).not.toHaveBeenCalled();
      });

      it('reloads quietly, once per burst of backend events', async () => {
        primeCommand('get_sessions', [mockSession]);
        const { result } = await ready();
        vi.useFakeTimers();
        try {
          primeCommand('get_sessions', [mockSession, { ...mockSession, id: 'session-2' }]);
          act(() => {
            fakeBackend().emit(BACKEND_EVENTS.TIMER_INSTANCE_STOPPED, {});
            fakeBackend().emit(BACKEND_EVENTS.TIMER_INSTANCE_STARTED, {});
          });
          expect(calls('get_sessions')).toHaveLength(1);

          await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
          });
          expect(calls('get_sessions')).toHaveLength(2);
          expect(result.current.sessions.map(s => s.id)).toEqual(['session-1', 'session-2']);
          expect(result.current.isLoading).toBe(false);
        } finally {
          vi.useRealTimers();
        }
      });

      it('keeps the list, and says nothing, when a quiet reload fails', async () => {
        primeCommand('get_sessions', [mockSession], new Error('unreachable'));
        const { result } = await ready();
        vi.useFakeTimers();
        try {
          act(() => fakeBackend().emit(BACKEND_EVENTS.SESSIONS_CHANGED, {}));
          await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
          });
        } finally {
          vi.useRealTimers();
        }

        expect(calls('get_sessions')).toHaveLength(2);
        expect(result.current.sessions).toHaveLength(1);
        expect(mockShowError).not.toHaveBeenCalled();
      });

      it('drops a pending reload when unmounted', async () => {
        const { unmount } = await ready();
        vi.useFakeTimers();
        try {
          act(() => fakeBackend().emit(BACKEND_EVENTS.RESYNC, {}));
          unmount();
          await vi.advanceTimersByTimeAsync(300);
        } finally {
          vi.useRealTimers();
        }

        expect(calls('get_sessions')).toHaveLength(1);
      });
    });

    describe('starting a timer', () => {
      it('updates only its own session', async () => {
        const other = { ...mockSession, id: 'session-2', taskName: 'Other' };
        const mine = { ...mockSession, isActive: true, timerInstances: [mockTimerInstance] };
        primeCommand('get_sessions', [mine, other]);
        primeCommand('start_timer_instance', { ...mine, timerInstances: [running('instance-1')] });
        const { result } = await ready();

        await act(async () => {
          await result.current.startTimerInstance('instance-1');
        });

        expect(result.current.sessions[0].timerInstances[0].state).toBe(TimerState.running);
        expect(result.current.sessions[1]).toEqual(other);
      });

      it('announces the timer it stopped by activating the session', async () => {
        const elsewhere = {
          ...mockSession,
          id: 'session-2',
          taskName: 'Review',
          isActive: true,
          timerInstances: [running('other', 'session-2')],
        };
        const mine = { ...mockSession, timerInstances: [mockTimerInstance] };
        primeCommand('get_sessions', [elsewhere, mine]);
        primeCommand('start_timer_instance', new Error('Cannot start timer for inactive session'), {
          ...mine,
          isActive: true,
          timerInstances: [running('instance-1')],
        });
        primeCommand('set_active_session', [
          { ...elsewhere, isActive: false, timerInstances: [] },
          { ...mine, isActive: true },
        ]);
        const { result } = await ready();

        await act(async () => {
          await result.current.startTimerInstance('instance-1');
        });

        expect(mockShowInfo).toHaveBeenCalledWith('Stopped the running timer for "Review"', { category: 'timer' });
        expect(result.current.activeSession?.id).toBe('session-1');
      });

      it('activates without a hand-off when the running timer is in the same session', async () => {
        const mine = { ...mockSession, timerInstances: [running('other'), mockTimerInstance] };
        primeCommand('get_sessions', [mine]);
        primeCommand('start_timer_instance', new Error('Cannot start timer for inactive session'), {
          ...mine,
          isActive: true,
        });
        primeCommand('set_active_session', [{ ...mine, isActive: true }]);
        const { result } = await ready();

        await act(async () => {
          await result.current.startTimerInstance('instance-1');
        });

        expect(calls('set_active_session')).toHaveLength(1);
        expect(mockShowInfo).not.toHaveBeenCalled();
      });

      it.each([
        ['an inactive session it never listed', 'Cannot start timer for inactive session'],
        ['another timer it never saw running', 'Another timer instance is already running'],
      ])('gives up on %s', async (_, reason) => {
        primeCommand('start_timer_instance', new Error(reason));
        const { result } = await ready();

        await act(async () => {
          await result.current.startTimerInstance('unknown');
        });

        expect(calls('start_timer_instance')).toHaveLength(1);
        expect(mockShowError).toHaveBeenCalledWith(reason, { category: 'timer' });
      });

      it("gives up when the other timer can't be stopped", async () => {
        const mine = { ...mockSession, isActive: true, timerInstances: [running('other'), mockTimerInstance] };
        primeCommand('get_sessions', [mine]);
        primeCommand('start_timer_instance', new Error('Another timer instance is already running'));
        primeCommand('stop_timer_instance', new Error('disk full'));
        const { result } = await ready();

        await act(async () => {
          await result.current.startTimerInstance('instance-1');
        });

        expect(calls('start_timer_instance')).toHaveLength(1);
        expect(mockShowError).toHaveBeenCalledWith('disk full', { category: 'timer' });
        expect(mockShowInfo).not.toHaveBeenCalled();
      });
    });

    describe('starting a task', () => {
      it('says it resumed the task, and whose timer it stopped', async () => {
        primeCommand('start_task', { outcome: 'resumed', instanceId: 'i-1', stoppedTaskName: 'Review' });
        const { result } = await ready();

        await act(async () => {
          await result.current.startTask('task-1', 'Annotation');
        });

        expect(mockShowInfo).toHaveBeenCalledWith('Resumed "Annotation" — stopped the running timer for "Review"', {
          category: 'timer',
        });
      });
    });

    describe('a session on several tasks', () => {
      const review = { taskId: 'task-2', taskName: 'Review', hourlyRate: 30 };

      it('creates a timer for the task it was given', async () => {
        const created = { ...mockTimerInstance, id: 'new', task: review };
        primeCommand('create_timer_instance', created);
        const { result } = await ready();

        let timer: TimerInstance | null = null;
        await act(async () => {
          timer = await result.current.createTimerInstance('session-1', { taskId: 'task-2', taskName: 'Review' });
        });

        expect(calls('create_timer_instance')[0][1]).toEqual({
          sessionId: 'session-1',
          task: { taskId: 'task-2', taskName: 'Review' },
        });
        expect(timer).toMatchObject({ id: 'new', task: review });
      });

      it('resuming a timer stops the one running, and names its task', async () => {
        const live = { ...running('live'), task: review };
        const waiting = paused('waiting', '2024-01-15T10:30:00Z');
        const active = { ...mockSession, isActive: true, timerInstances: [waiting, live] };
        const stopped = {
          ...active,
          timerInstances: [waiting, { ...live, state: TimerState.stopped, duration: 60_000 }],
        };
        const resumed = {
          ...active,
          timerInstances: [{ ...waiting, state: TimerState.running }, stopped.timerInstances[1]],
        };
        primeCommand('get_sessions', [active]);
        primeCommand('resume_timer_instance', new Error('Another timer instance is already running'), resumed);
        primeCommand('stop_timer_instance', stopped);
        const { result } = await ready();

        let session: TaskSession | null = null;
        await act(async () => {
          session = await result.current.resumeTimerInstance('waiting');
        });

        expect(calls('stop_timer_instance')[0][1]).toEqual({ instanceId: 'live' });
        expect(session!.timerInstances[0].state).toBe(TimerState.running);
        expect(mockShowInfo).toHaveBeenCalledWith('Stopped the running timer for "Review"', { category: 'timer' });
      });

      it('a failed resume resolves to no session', async () => {
        primeCommand('resume_timer_instance', new Error('disk full'));
        const { result } = await ready();

        let session: TaskSession | null = { ...mockSession };
        await act(async () => {
          session = await result.current.resumeTimerInstance('waiting');
        });

        expect(session).toBeNull();
        expect(mockShowInfo).not.toHaveBeenCalled();
      });

      it("names a deleted timer's own task", async () => {
        const stopped = { ...mockTimerInstance, state: TimerState.stopped, duration: 60_000, task: review };
        primeCommand('get_sessions', [{ ...mockSession, timerInstances: [stopped] }]);
        primeCommand('delete_timer_instance', mockSession);
        const { result } = await ready();

        await act(async () => {
          await result.current.deleteTimerInstance('instance-1');
        });

        expect(mockShowInfo).toHaveBeenCalledWith('Deleted 1m from "Review"', expect.anything());
      });

      it('puts a deleted timer back with its own task', async () => {
        const stopped = { ...mockTimerInstance, state: TimerState.stopped, duration: 60_000, task: review };
        primeCommand('get_sessions', [{ ...mockSession, timerInstances: [stopped] }]);
        primeCommand('delete_timer_instance', mockSession);
        primeCommand('restore_timer_instance', mockSession);
        const { result } = await ready();

        await act(async () => {
          await result.current.deleteTimerInstance('instance-1');
        });
        const [, { actions }] = mockShowInfo.mock.calls[0];
        await act(async () => {
          await actions[0].onClick();
        });

        expect(calls('restore_timer_instance')[0][1]).toMatchObject({ instance: { task: review } });
      });

      it('names every task of a deleted session', async () => {
        const own = { ...mockTimerInstance, id: 'own', state: TimerState.stopped, duration: 60_000 };
        const other = { ...own, id: 'other', task: review };
        const mixed = { ...mockSession, timerInstances: [own, other], totalDuration: 120_000 };
        primeCommand('get_sessions', [mixed]);
        primeCommand('delete_session', mixed);
        const { result } = await ready();

        await act(async () => {
          await result.current.deleteSession('session-1');
        });

        expect(mockShowInfo).toHaveBeenCalledWith(
          'Deleted the "Test Task, Review" session (2 timers, 2m)',
          expect.anything()
        );
      });

      it("names the running timer's own task when activating another session stops it", async () => {
        const live = { ...running('live', 'session-2'), task: review };
        const elsewhere = { ...mockSession, id: 'session-2', isActive: true, timerInstances: [live] };
        primeCommand('get_sessions', [mockSession, elsewhere]);
        primeCommand('set_active_session', [
          { ...mockSession, isActive: true },
          { ...elsewhere, isActive: false },
        ]);
        const { result } = await ready();

        await act(async () => {
          await result.current.setActiveSession(mockSession);
        });

        expect(mockShowInfo).toHaveBeenCalledWith('Stopped the running timer for "Review"', { category: 'session' });
      });

      it("names the running timer's own task when starting in an inactive session stops it", async () => {
        const live = { ...running('live', 'session-2'), task: review };
        const elsewhere = { ...mockSession, id: 'session-2', isActive: true, timerInstances: [live] };
        const idle = { ...mockTimerInstance, id: 'idle' };
        const target = { ...mockSession, timerInstances: [idle] };
        primeCommand('get_sessions', [target, elsewhere]);
        primeCommand('start_timer_instance', new Error('Cannot start timer for inactive session'), {
          ...target,
          isActive: true,
          timerInstances: [{ ...idle, state: TimerState.running }],
        });
        primeCommand('set_active_session', [
          { ...target, isActive: true },
          { ...elsewhere, isActive: false },
        ]);
        const { result } = await ready();

        await act(async () => {
          await result.current.startTimerInstance('idle');
        });

        expect(mockShowInfo).toHaveBeenCalledWith('Stopped the running timer for "Review"', { category: 'timer' });
      });
    });

    describe('deleting a timer', () => {
      it('reports a failed delete without an Undo', async () => {
        const stopped = { ...mockTimerInstance, state: TimerState.stopped, duration: 60_000 };
        primeCommand('get_sessions', [{ ...mockSession, timerInstances: [stopped] }]);
        primeCommand('delete_timer_instance', new Error('disk full'));
        const { result } = await ready();

        let deleted = true;
        await act(async () => {
          deleted = await result.current.deleteTimerInstance('instance-1');
        });

        expect(deleted).toBe(false);
        expect(mockShowError).toHaveBeenCalledWith('disk full', { category: 'timer' });
        expect(mockShowInfo).not.toHaveBeenCalled();
      });

      it('offers no Undo for a timer it never listed', async () => {
        primeCommand('delete_timer_instance', mockSession);
        const { result } = await ready();

        await act(async () => {
          await expect(result.current.deleteTimerInstance('unknown')).resolves.toBe(true);
        });
        expect(mockShowInfo).not.toHaveBeenCalled();
      });

      it('counts a finished timer without a duration as no time', async () => {
        const ended = { ...mockTimerInstance, endTime: '2024-01-15T11:00:00Z' };
        primeCommand('get_sessions', [{ ...mockSession, timerInstances: [ended] }]);
        primeCommand('delete_timer_instance', mockSession);
        const { result } = await ready();

        await act(async () => {
          await result.current.deleteTimerInstance('instance-1');
        });
        expect(mockShowInfo).toHaveBeenCalledWith('Deleted 0m from "Test Task"', expect.anything());
      });
    });

    describe('editing a timer', () => {
      it('reports no session for a timer it never listed', async () => {
        const { result } = await ready();

        let sessionId: string | null = 'x';
        await act(async () => {
          sessionId = await result.current.editTimerEntry('unknown', { updates: { duration: 60_000 } });
        });
        expect(sessionId).toBeNull();
      });
    });

    describe('deleting a session', () => {
      it("counts the timers, and doesn't restore a session that came back", async () => {
        const stopped = { ...mockTimerInstance, state: TimerState.stopped, duration: 60_000 };
        const withTwo = {
          ...mockSession,
          timerInstances: [stopped, { ...stopped, id: 'instance-2' }],
          totalDuration: 120_000,
        };
        primeCommand('get_sessions', [withTwo], [withTwo]);
        primeCommand('delete_session', withTwo);
        primeCommand('restore_session', withTwo);
        const { result } = await ready();

        await act(async () => {
          await result.current.deleteSession('session-1');
        });
        expect(mockShowInfo).toHaveBeenCalledWith('Deleted the "Test Task" session (2 timers, 2m)', expect.anything());

        // Back already (another device restored it, and a reload brought it
        // in): Undo adds no second copy
        act(() => fakeBackend().emit(BACKEND_EVENTS.SESSIONS_CHANGED, {}));
        await waitFor(() => expect(result.current.sessions).toHaveLength(1));
        const [, { actions }] = mockShowInfo.mock.calls[0];
        await act(async () => {
          await actions[0].onClick();
        });
        expect(calls('restore_session')).toHaveLength(1);
        expect(result.current.sessions).toHaveLength(1);
      });

      it('names no timers for a session without any', async () => {
        primeCommand('get_sessions', [mockSession]);
        primeCommand('delete_session', mockSession);
        const { result } = await ready();

        await act(async () => {
          await result.current.deleteSession('session-1');
        });
        expect(mockShowInfo).toHaveBeenCalledWith('Deleted the "Test Task" session', expect.anything());
      });
    });

    describe('activating a session', () => {
      it('announces no hand-off when nothing was running elsewhere', async () => {
        primeCommand('get_sessions', [mockSession]);
        primeCommand('set_active_session', [{ ...mockSession, isActive: true }]);
        const { result } = await ready();

        await act(async () => {
          await expect(result.current.setActiveSession(mockSession)).resolves.toBe(true);
        });
        expect(result.current.activeSession?.id).toBe('session-1');
        expect(mockShowInfo).not.toHaveBeenCalled();
      });

      it('reports a failed change', async () => {
        primeCommand('set_active_session', new Error('disk full'));
        const { result } = await ready();

        await act(async () => {
          await expect(result.current.setActiveSession(mockSession)).resolves.toBe(false);
        });
        expect(mockShowError).toHaveBeenCalledWith('disk full', { category: 'timer' });
      });
    });

    describe('ending the active session', () => {
      it('does nothing without one', async () => {
        const { result } = await ready();
        await act(async () => {
          await result.current.endActiveSession();
        });
        expect(calls('set_active_session')).toHaveLength(0);
      });

      it('stops only its live timers, then deactivates it', async () => {
        const stopped = { ...mockTimerInstance, id: 'done', state: TimerState.stopped, duration: 60_000 };
        const active = { ...mockSession, isActive: true, timerInstances: [stopped, running('live')] };
        primeCommand('get_sessions', [active]);
        primeCommand('stop_timer_instance', { ...active, timerInstances: [stopped, { ...stopped, id: 'live' }] });
        primeCommand('set_active_session', [{ ...active, isActive: false }]);
        const { result } = await ready();

        await act(async () => {
          await result.current.endActiveSession();
        });

        expect(calls('stop_timer_instance').map(([, args]) => args)).toEqual([{ instanceId: 'live' }]);
        expect(result.current.activeSession).toBeNull();
      });

      it("stays active when a timer can't be stopped", async () => {
        const active = { ...mockSession, isActive: true, timerInstances: [running('live')] };
        primeCommand('get_sessions', [active]);
        primeCommand('stop_timer_instance', new Error('disk full'));
        const { result } = await ready();

        await act(async () => {
          await result.current.endActiveSession();
        });

        expect(mockShowError).toHaveBeenCalledWith('Session not ended: a timer could not be stopped.', {
          category: 'session',
        });
        expect(calls('set_active_session')).toHaveLength(0);
        expect(result.current.activeSession?.id).toBe('session-1');
        expect(result.current.isLoading).toBe(false);
      });
    });

    describe('pausing and resuming the active session', () => {
      it('does nothing without an active session', async () => {
        primeCommand('get_sessions', [{ ...mockSession, timerInstances: [running('a'), paused('b', null)] }]);
        const { result } = await ready();

        await act(async () => {
          await result.current.pauseAllTimersInActiveSession();
          await result.current.resumeAllTimersInActiveSession();
        });
        expect(calls('pause_timer_instance')).toHaveLength(0);
        expect(calls('resume_timer_instance')).toHaveLength(0);
      });

      it('pauses each running timer', async () => {
        const active = { ...mockSession, isActive: true, timerInstances: [running('a'), mockTimerInstance] };
        primeCommand('get_sessions', [active]);
        primeCommand('pause_timer_instance', { ...active, timerInstances: [paused('a', null), mockTimerInstance] });
        const { result } = await ready();

        await act(async () => {
          await result.current.pauseAllTimersInActiveSession();
        });

        expect(calls('pause_timer_instance').map(([, args]) => args)).toEqual([{ instanceId: 'a' }]);
        expect(result.current.isLoading).toBe(false);
      });

      it('resumes the timer paused last', async () => {
        const active = {
          ...mockSession,
          isActive: true,
          timerInstances: [
            paused('never-said', null),
            paused('latest', '2024-01-15T12:00:00Z'),
            paused('earlier', '2024-01-15T11:00:00Z'),
            paused('also-unsaid', null),
          ],
        };
        primeCommand('get_sessions', [active]);
        primeCommand('resume_timer_instance', active);
        const { result } = await ready();

        await act(async () => {
          await result.current.resumeAllTimersInActiveSession();
        });

        expect(calls('resume_timer_instance').map(([, args]) => args)).toEqual([{ instanceId: 'latest' }]);
      });

      it('resumes nothing when none is paused', async () => {
        primeCommand('get_sessions', [{ ...mockSession, isActive: true, timerInstances: [running('a')] }]);
        const { result } = await ready();

        await act(async () => {
          await result.current.resumeAllTimersInActiveSession();
        });
        expect(calls('resume_timer_instance')).toHaveLength(0);
      });
    });
  });
});
