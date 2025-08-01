import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionService } from '../SessionService';
import { SESSION_CONSTANTS } from '../../constants';
import type { TaskSession, TimerInstance } from '../../types/timer';

// Mock StorageService
const mockStorageService = {
  getTaskSessions: vi.fn<[], Promise<TaskSession[]>>(),
  setTaskSessions: vi.fn<[TaskSession[]], Promise<void>>(),
};

vi.mock('../StorageService', () => ({
  StorageService: {
    getInstance: () => mockStorageService,
  },
}));

describe('SessionService', () => {
  let sessionService: SessionService;
  let sessions: TaskSession[];

  beforeEach(() => {
    sessions = [];
    vi.clearAllMocks();
    mockStorageService.getTaskSessions.mockImplementation(() => Promise.resolve(sessions));
    mockStorageService.setTaskSessions.mockImplementation((newSessions: TaskSession[]) => {
      sessions = newSessions;
      return Promise.resolve();
    });
    sessionService = new SessionService();
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
  });

  describe('error paths', () => {
    it('throws when creating instance for missing session', async () => {
      await expect(sessionService.createTimerInstance('missing')).rejects.toThrow('Session with ID missing not found');
    });

    it('throws when starting timer for missing instance', async () => {
      await expect(sessionService.startTimer('bad-instance')).rejects.toThrow('Timer instance with ID bad-instance not found');
    });
  });
});
