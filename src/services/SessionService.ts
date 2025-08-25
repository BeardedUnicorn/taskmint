/**
 * Session Service
 * 
 * Manages task sessions and timer instances with proper data validation,
 * error handling, and business logic enforcement.
 */

import { TaskSession, TimerInstance, SessionStats } from '../types/timer';
import { StorageService } from './StorageService';
import { formatDateString } from '../utils/dateHelpers';
import { measurePerformance } from '../utils/performance';
import { SESSION_CONSTANTS } from '../constants';

export interface ISessionService {
  // Session operations
  createSession(taskId: string, taskName: string): Promise<TaskSession>;
  updateSession(sessionId: string, updates: Partial<TaskSession>): Promise<TaskSession>;
  deleteSession(sessionId: string): Promise<void>;
  getSessionById(sessionId: string): Promise<TaskSession | null>;
  getAllSessions(): Promise<TaskSession[]>;
  getSessionsByTaskId(taskId: string): Promise<TaskSession[]>;
  getActiveSession(): Promise<TaskSession | null>;
  setActiveSession(session: TaskSession | null): Promise<void>;

  // Timer instance operations
  createTimerInstance(sessionId: string): Promise<TimerInstance>;
  updateTimerInstance(instanceId: string, updates: Partial<TimerInstance>): Promise<TimerInstance>;
  deleteTimerInstance(instanceId: string): Promise<void>;
  getTimerInstanceById(instanceId: string): Promise<TimerInstance | null>;
  getTimerInstancesBySessionId(sessionId: string): Promise<TimerInstance[]>;

  // Timer control operations
  startTimer(instanceId: string): Promise<void>;
  stopTimer(instanceId: string): Promise<void>;
  pauseTimer(instanceId: string): Promise<void>;
  resumeTimer(instanceId: string): Promise<void>;

  // Statistics and utilities
  getSessionStats(): Promise<SessionStats>;
  calculateSessionDuration(sessionId: string): Promise<number>;
  calculateTotalDuration(sessions: TaskSession[]): number;
}

export class SessionService implements ISessionService {
  private storageService: StorageService;
  private sessionCache = new Map<string, TaskSession>();
  private instanceCache = new Map<string, TimerInstance>();
  private activeSessionId: string | null = null;

  constructor() {
    this.storageService = StorageService.getInstance();
  }

  async createSession(taskId: string, taskName: string): Promise<TaskSession> {
    return measurePerformance('SessionService.createSession', async () => {
      const now = new Date();
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newSession: TaskSession = {
        id: sessionId,
        taskId,
        taskName: taskName.trim(),
        timerInstances: [],
        totalDuration: 0,
        isActive: false,
        date: formatDateString(now),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      // Save to storage
      const sessions = await this.getAllSessions();
      sessions.push(newSession);
      await this.storageService.setTaskSessions(sessions);

      // Update cache
      this.sessionCache.set(sessionId, newSession);

      return newSession;
    });
  }

  async updateSession(sessionId: string, updates: Partial<TaskSession>): Promise<TaskSession> {
    return measurePerformance('SessionService.updateSession', async () => {
      const sessions = await this.getAllSessions();
      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      
      if (sessionIndex === -1) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      const updatedSession: TaskSession = {
        ...sessions[sessionIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Recalculate total duration if timer instances were updated
      if (updates.timerInstances) {
        updatedSession.totalDuration = this.calculateInstancesDuration(updates.timerInstances);
      }

      sessions[sessionIndex] = updatedSession;
      await this.storageService.setTaskSessions(sessions);

      // Update cache
      this.sessionCache.set(sessionId, updatedSession);

      return updatedSession;
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return measurePerformance('SessionService.deleteSession', async () => {
      const sessions = await this.getAllSessions();
      const filteredSessions = sessions.filter(s => s.id !== sessionId);
      
      if (filteredSessions.length === sessions.length) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      await this.storageService.setTaskSessions(filteredSessions);

      // Remove from cache
      this.sessionCache.delete(sessionId);

      // Clear active session if it was deleted
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
    });
  }

  async getSessionById(sessionId: string): Promise<TaskSession | null> {
    // Check cache first
    if (this.sessionCache.has(sessionId)) {
      return this.sessionCache.get(sessionId)!;
    }

    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId) || null;
    
    if (session) {
      this.sessionCache.set(sessionId, session);
    }
    
    return session;
  }

  async getAllSessions(): Promise<TaskSession[]> {
    return measurePerformance('SessionService.getAllSessions', async () => {
      const sessions = await this.storageService.getTaskSessions();
      
      // Update cache
      sessions.forEach(session => {
        this.sessionCache.set(session.id, session);
      });
      
      return sessions;
    });
  }

  async getSessionsByTaskId(taskId: string): Promise<TaskSession[]> {
    const sessions = await this.getAllSessions();
    return sessions.filter(s => s.taskId === taskId);
  }

  async getActiveSession(): Promise<TaskSession | null> {
    if (this.activeSessionId) {
      return await this.getSessionById(this.activeSessionId);
    }

    const sessions = await this.getAllSessions();
    const activeSession = sessions.find(s => s.isActive) || null;
    
    if (activeSession) {
      this.activeSessionId = activeSession.id;
    }
    
    return activeSession;
  }

  async setActiveSession(session: TaskSession | null): Promise<void> {
    // Deactivate all sessions first
    const sessions = await this.getAllSessions();
    const updatedSessions = sessions.map(s => ({ ...s, isActive: false }));
    
    if (session) {
      const sessionIndex = updatedSessions.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        updatedSessions[sessionIndex].isActive = true;
        this.activeSessionId = session.id;
      }
    } else {
      this.activeSessionId = null;
    }

    await this.storageService.setTaskSessions(updatedSessions);
    
    // Update cache
    updatedSessions.forEach(s => {
      this.sessionCache.set(s.id, s);
    });
  }

  async createTimerInstance(sessionId: string): Promise<TimerInstance> {
    return measurePerformance('SessionService.createTimerInstance', async () => {
      const session = await this.getSessionById(sessionId);
      if (!session) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      // Check instance limit
      if (session.timerInstances.length >= SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION) {
        throw new Error(`Maximum number of timer instances (${SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION}) reached for this session`);
      }

      const now = new Date();
      const instanceId = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newInstance: TimerInstance = {
        id: instanceId,
        sessionId,
        startTime: now,
        isRunning: false,
        isPaused: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      // Add to session
      const updatedSession = {
        ...session,
        timerInstances: [...session.timerInstances, newInstance],
        updatedAt: now.toISOString(),
      };

      await this.updateSession(sessionId, updatedSession);

      // Update cache
      this.instanceCache.set(instanceId, newInstance);

      return newInstance;
    });
  }

  // Helper method to calculate total duration from timer instances
  private calculateInstancesDuration(instances: TimerInstance[]): number {
    return instances.reduce((total, instance) => {
      if (instance.duration) {
        return total + instance.duration;
      }
      if (instance.endTime && instance.startTime) {
        const duration = instance.endTime.getTime() - instance.startTime.getTime();
        const pausedDuration = instance.pausedDuration || 0;
        return total + Math.max(0, duration - pausedDuration);
      }
      return total;
    }, 0);
  }

  async updateTimerInstance(instanceId: string, updates: Partial<TimerInstance>): Promise<TimerInstance> {
    return measurePerformance('SessionService.updateTimerInstance', async () => {
      const sessions = await this.getAllSessions();
      let targetSession: TaskSession | null = null;
      let instanceIndex = -1;

      // Find the session containing this instance
      for (const session of sessions) {
        instanceIndex = session.timerInstances.findIndex(i => i.id === instanceId);
        if (instanceIndex !== -1) {
          targetSession = session;
          break;
        }
      }

      if (!targetSession || instanceIndex === -1) {
        throw new Error(`Timer instance with ID ${instanceId} not found`);
      }

      const updatedInstance: TimerInstance = {
        ...targetSession.timerInstances[instanceIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Update the instance in the session
      const updatedInstances = [...targetSession.timerInstances];
      updatedInstances[instanceIndex] = updatedInstance;

      // Update the session with recalculated duration
      await this.updateSession(targetSession.id, {
        timerInstances: updatedInstances,
      });

      // Update cache
      this.instanceCache.set(instanceId, updatedInstance);

      return updatedInstance;
    });
  }

  async deleteTimerInstance(instanceId: string): Promise<void> {
    return measurePerformance('SessionService.deleteTimerInstance', async () => {
      const sessions = await this.getAllSessions();
      let targetSession: TaskSession | null = null;

      // Find the session containing this instance
      for (const session of sessions) {
        const instanceExists = session.timerInstances.some(i => i.id === instanceId);
        if (instanceExists) {
          targetSession = session;
          break;
        }
      }

      if (!targetSession) {
        throw new Error(`Timer instance with ID ${instanceId} not found`);
      }

      // Remove the instance from the session
      const updatedInstances = targetSession.timerInstances.filter(i => i.id !== instanceId);

      // Update the session
      await this.updateSession(targetSession.id, {
        timerInstances: updatedInstances,
      });

      // Remove from cache
      this.instanceCache.delete(instanceId);
    });
  }

  async getTimerInstanceById(instanceId: string): Promise<TimerInstance | null> {
    // Check cache first
    if (this.instanceCache.has(instanceId)) {
      return this.instanceCache.get(instanceId)!;
    }

    const sessions = await this.getAllSessions();
    for (const session of sessions) {
      const instance = session.timerInstances.find(i => i.id === instanceId);
      if (instance) {
        this.instanceCache.set(instanceId, instance);
        return instance;
      }
    }

    return null;
  }

  async getTimerInstancesBySessionId(sessionId: string): Promise<TimerInstance[]> {
    const session = await this.getSessionById(sessionId);
    return session ? session.timerInstances : [];
  }

  async startTimer(instanceId: string): Promise<void> {
    const now = new Date();
    await this.updateTimerInstance(instanceId, {
      isRunning: true,
      isPaused: false,
      startTime: now,
      endTime: undefined,
      duration: undefined,
      pausedDuration: 0,
    });
  }

  async stopTimer(instanceId: string): Promise<void> {
    const instance = await this.getTimerInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Timer instance with ID ${instanceId} not found`);
    }

    const now = new Date();
    const duration = now.getTime() - instance.startTime.getTime() - (instance.pausedDuration || 0);

    await this.updateTimerInstance(instanceId, {
      isRunning: false,
      isPaused: false,
      endTime: now,
      duration: Math.max(0, duration),
    });
  }

  async pauseTimer(instanceId: string): Promise<void> {
    const now = new Date();
    await this.updateTimerInstance(instanceId, {
      isPaused: true,
      pausedAt: now,
    });
  }

  async resumeTimer(instanceId: string): Promise<void> {
    const instance = await this.getTimerInstanceById(instanceId);
    if (!instance || !instance.pausedAt) {
      throw new Error(`Timer instance with ID ${instanceId} not found or not paused`);
    }

    const now = new Date();
    const additionalPausedTime = now.getTime() - instance.pausedAt.getTime();
    const totalPausedDuration = (instance.pausedDuration || 0) + additionalPausedTime;

    await this.updateTimerInstance(instanceId, {
      isPaused: false,
      pausedAt: undefined,
      pausedDuration: totalPausedDuration,
    });
  }

  async getSessionStats(): Promise<SessionStats> {
    const sessions = await this.getAllSessions();
    const activeSessions = sessions.filter(s => s.isActive);
    const totalTimerInstances = sessions.reduce((total, s) => total + s.timerInstances.length, 0);
    const totalDuration = this.calculateTotalDuration(sessions);
    const durations = sessions.map(s => s.totalDuration).filter(d => d > 0);

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalTimerInstances,
      totalDuration,
      averageSessionDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      longestSession: durations.length > 0 ? Math.max(...durations) : 0,
      shortestSession: durations.length > 0 ? Math.min(...durations) : 0,
    };
  }

  async calculateSessionDuration(sessionId: string): Promise<number> {
    const session = await this.getSessionById(sessionId);
    return session ? session.totalDuration : 0;
  }

  calculateTotalDuration(sessions: TaskSession[]): number {
    return sessions.reduce((total, session) => total + session.totalDuration, 0);
  }
}
