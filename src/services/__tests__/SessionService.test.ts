import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionService } from '../SessionService';
import { SESSION_CONSTANTS } from '../../constants';
import type { TaskSession } from '../../types/timer';
import { TimerState } from '../../types/timer';

// Mock StorageService
const mockStorageService = {
  getTaskSessions: vi.fn<[], Promise<TaskSession[]>>(),
  setTaskSessions: vi.fn<[TaskSession[]], Promise<void>>(),
  getTimeEntries: vi.fn<[], Promise<any[]>>(),
  setTimeEntries: vi.fn<[any[]], Promise<void>>(),
};

vi.mock('../StorageService', () => ({
  StorageService: {
    getInstance: () => mockStorageService,
  },
}));

describe('SessionService', () => {
  let sessionService: SessionService;
  let sessions: TaskSession[];
  let timeEntries: any[];

  beforeEach(() => {
    sessions = [];
    timeEntries = [];
    vi.clearAllMocks();
    mockStorageService.getTaskSessions.mockImplementation(() => Promise.resolve(sessions));
    mockStorageService.setTaskSessions.mockImplementation((newSessions: TaskSession[]) => {
      sessions = newSessions;
      return Promise.resolve();
    });
    mockStorageService.getTimeEntries.mockImplementation(() => Promise.resolve(timeEntries));
    mockStorageService.setTimeEntries.mockImplementation((newEntries: any[]) => {
      timeEntries = newEntries;
      return Promise.resolve();
    });
    sessionService = new SessionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('session creation and activation', () => {
    it('creates sessions and caches them', async () => {
      const session = await sessionService.createSession('task-1', 'Test Task');
      expect(session.taskId).toBe('task-1');
      expect(mockStorageService.setTaskSessions).toHaveBeenCalledWith([session]);

      mockStorageService.getTaskSessions.mockClear();
      const cached = await sessionService.getSessionById(session.id);
      expect(cached).toEqual(session);
      expect(mockStorageService.getTaskSessions).not.toHaveBeenCalled();
    });

    it('activates a session and retrieves it from cache', async () => {
      const session = await sessionService.createSession('task-1', 'Test Task');
      await sessionService.setActiveSession(session);

      mockStorageService.getTaskSessions.mockClear();
      const active = await sessionService.getActiveSession();
      expect(active?.id).toBe(session.id);
      expect(mockStorageService.getTaskSessions).not.toHaveBeenCalled();
    });
  });

  describe('timer instance management', () => {
    it('creates and caches timer instances', async () => {
      const session = await sessionService.createSession('task-1', 'Test Task');
      const instance = await sessionService.createTimerInstance(session.id);

      expect(instance.sessionId).toBe(session.id);
      expect(mockStorageService.setTaskSessions).toHaveBeenCalledTimes(2);

      mockStorageService.getTaskSessions.mockClear();
      const cached = await sessionService.getTimerInstanceById(instance.id);
      expect(cached?.id).toBe(instance.id);
      expect(mockStorageService.getTaskSessions).not.toHaveBeenCalled();

      await sessionService.deleteTimerInstance(instance.id);
      mockStorageService.getTaskSessions.mockClear();
      const afterDelete = await sessionService.getTimerInstanceById(instance.id);
      expect(afterDelete).toBeNull();
      expect(mockStorageService.getTaskSessions).toHaveBeenCalled();
    });

    it('enforces max timer instance limit', async () => {
      const originalLimit = SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION;
      (SESSION_CONSTANTS as any).MAX_TIMER_INSTANCES_PER_SESSION = 1;

      const session = await sessionService.createSession('task-1', 'Test Task');
      await sessionService.createTimerInstance(session.id);
      await expect(sessionService.createTimerInstance(session.id)).rejects.toThrow('Maximum number of timer instances');

      (SESSION_CONSTANTS as any).MAX_TIMER_INSTANCES_PER_SESSION = originalLimit;
    });

    it('creates a new timer instance on each restart', async () => {
      vi.useFakeTimers();
      const base = new Date('2023-01-01T00:00:00Z');
      vi.setSystemTime(base);

      const session = await sessionService.createSession('task-1', 'Test Task');
      await sessionService.setActiveSession(session);
      const instance = await sessionService.createTimerInstance(session.id);

      await sessionService.startTimerInstance(instance.id);

      vi.setSystemTime(new Date(base.getTime() + 1000));
      await sessionService.stopTimerInstance(instance.id);

      let updatedSession = await sessionService.getSessionById(session.id);
      expect(updatedSession?.timerInstances).toHaveLength(1);
      expect(updatedSession?.timerInstances[0].duration).toBe(1000);

      vi.setSystemTime(new Date(base.getTime() + 5000));
      await sessionService.startTimerInstance(instance.id);

      updatedSession = await sessionService.getSessionById(session.id);
      expect(updatedSession?.timerInstances).toHaveLength(2);
      const newInstance = updatedSession?.timerInstances[1];
      expect(newInstance?.state).toBe(TimerState.running);
      expect(newInstance?.id).not.toBe(instance.id);

      vi.setSystemTime(new Date(base.getTime() + 7000));
      if (newInstance) {
        await sessionService.stopTimerInstance(newInstance.id);
      }

      updatedSession = await sessionService.getSessionById(session.id);
      expect(updatedSession?.timerInstances[1].duration).toBe(2000);

      // Restart again to ensure a new instance is appended each time
      vi.setSystemTime(new Date(base.getTime() + 9000));
      if (newInstance) {
        await sessionService.startTimerInstance(newInstance.id);
      }

      updatedSession = await sessionService.getSessionById(session.id);
      expect(updatedSession?.timerInstances).toHaveLength(3);
      const thirdInstance = updatedSession?.timerInstances[2];
      expect(thirdInstance?.state).toBe(TimerState.running);
      expect(thirdInstance?.id).not.toBe(newInstance?.id);

      vi.setSystemTime(new Date(base.getTime() + 10000));
      if (thirdInstance) {
        await sessionService.stopTimerInstance(thirdInstance.id);
      }

      updatedSession = await sessionService.getSessionById(session.id);
      expect(updatedSession?.timerInstances[2].duration).toBe(1000);
    });

    it('prevents starting multiple timers simultaneously', async () => {
      const session1 = await sessionService.createSession('task-1', 'Task 1');
      const session2 = await sessionService.createSession('task-2', 'Task 2');
      const instance1 = await sessionService.createTimerInstance(session1.id);
      const instance2 = await sessionService.createTimerInstance(session2.id);

      await sessionService.setActiveSession(session1);
      await sessionService.startTimerInstance(instance1.id);

      await sessionService.setActiveSession(session2);
      await expect(sessionService.startTimerInstance(instance2.id)).rejects.toThrow('Another timer instance is already running');

      const runningInstance = await sessionService.getTimerInstanceById(instance1.id);
      expect(runningInstance?.state).toBe(TimerState.running);
    });

    it('prevents starting timer when session is inactive', async () => {
      const session = await sessionService.createSession('task-1', 'Test Task');
      const instance = await sessionService.createTimerInstance(session.id);

      await expect(sessionService.startTimerInstance(instance.id)).rejects.toThrow('Cannot start timer for inactive session');

      await sessionService.setActiveSession(session);
      await expect(sessionService.startTimerInstance(instance.id)).resolves.toBeUndefined();

      const updated = await sessionService.getTimerInstanceById(instance.id);
      expect(updated?.state).toBe(TimerState.running);
    });

    it('handles valid state transitions', async () => {
      const session = await sessionService.createSession('task-1', 'Task');
      await sessionService.setActiveSession(session);
      const instance = await sessionService.createTimerInstance(session.id);

      await sessionService.startTimerInstance(instance.id);
      let updated = await sessionService.getTimerInstanceById(instance.id);
      expect(updated?.state).toBe(TimerState.running);

      await sessionService.pauseTimerInstance(instance.id);
      updated = await sessionService.getTimerInstanceById(instance.id);
      expect(updated?.state).toBe(TimerState.paused);

      await sessionService.resumeTimerInstance(instance.id);
      updated = await sessionService.getTimerInstanceById(instance.id);
      expect(updated?.state).toBe(TimerState.running);

      await sessionService.stopTimerInstance(instance.id);
      updated = await sessionService.getTimerInstanceById(instance.id);
      expect(updated?.state).toBe(TimerState.stopped);
    });

    it('blocks invalid state transitions', async () => {
      const session = await sessionService.createSession('task-1', 'Task');
      const instance = await sessionService.createTimerInstance(session.id);

      await expect(sessionService.pauseTimerInstance(instance.id)).rejects.toThrow();
      await expect(sessionService.resumeTimerInstance(instance.id)).rejects.toThrow();
      await expect(sessionService.stopTimerInstance(instance.id)).rejects.toThrow();
    });
  });

  describe('error paths', () => {
    it('throws when creating instance for missing session', async () => {
      await expect(sessionService.createTimerInstance('missing')).rejects.toThrow('Session with ID missing not found');
    });

    it('throws when starting timer for missing instance', async () => {
      await expect(sessionService.startTimerInstance('bad-instance')).rejects.toThrow('Timer instance with ID bad-instance not found');
    });
  });

  describe('legacy time entry operations', () => {
    it('starts and stops a legacy timer entry', async () => {
      const entry = await sessionService.startTimer('Legacy Task');
      expect(entry.isRunning).toBe(true);
      expect(timeEntries).toHaveLength(1);

      const stopped = await sessionService.stopTimer(entry.id);
      expect(stopped.isRunning).toBe(false);
      expect(timeEntries[0].isRunning).toBe(false);
    });
  });
});
