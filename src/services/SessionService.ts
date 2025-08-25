/**
 * Session Service
 * 
 * Manages task sessions and timer instances with proper data validation,
 * error handling, and business logic enforcement.
 */

import { TaskSession, TimerInstance, SessionStats, TimeEntry, TimerRoundingOption, TimerState } from '../types/timer';
import { StorageService } from './StorageService';
import { formatDateString } from '../utils/dateHelpers';
import { measurePerformance } from '../utils/performance';
import { SESSION_CONSTANTS } from '../constants';
import { createTimerError, TimerErrorClass } from '../types/errors';
import { applyTimerRounding } from '../utils/formatters';
import { safeInvoke, isTauriEnvironment } from '../utils/tauri';
import { sessionStore } from '../store/sessionStore';

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

  // Timer control operations for instances
  startTimerInstance(instanceId: string): Promise<void>;
  stopTimerInstance(instanceId: string): Promise<void>;
  pauseTimerInstance(instanceId: string): Promise<void>;
  resumeTimerInstance(instanceId: string): Promise<void>;

  // Legacy time entry operations
  startTimer(taskName: string, taskId?: string, startTime?: Date): Promise<TimeEntry>;
  stopTimer(entryId: string, roundingOption?: TimerRoundingOption): Promise<TimeEntry>;
  updateActiveTimer(entry: TimeEntry): Promise<void>;
  getActiveTimer(): Promise<TimeEntry | null>;
  setActiveTimer(entry: TimeEntry | null): Promise<void>;
  updateSystemTray(activeEntry: TimeEntry | null, allEntries: TimeEntry[]): Promise<void>;
  saveTimeEntry(entry: TimeEntry): Promise<void>;
  updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(entryId: string): Promise<void>;
  getTimeEntries(): Promise<TimeEntry[]>;
  getTimeEntriesByDate(date: string): Promise<TimeEntry[]>;
  getDailyTotal(date?: string): Promise<{ totalDuration: number; taskCount: number }>;

  // Statistics and utilities
  getSessionStats(): Promise<SessionStats>;
  calculateSessionDuration(sessionId: string): Promise<number>;
  calculateTotalDuration(sessions: TaskSession[]): number;
}

export class SessionService implements ISessionService {
  private storageService: StorageService;
  private activeSessionId: string | null = null;
  private activeTimer: TimeEntry | null = null;

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
      sessionStore.setSessions(sessions);

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
      sessionStore.setSessions(sessions);

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
      sessionStore.setSessions(filteredSessions);

      // Clear active session if it was deleted
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
    });
  }

  async getSessionById(sessionId: string): Promise<TaskSession | null> {
    // Check store first
    const cached = sessionStore.getSession(sessionId);
    if (cached) {
      return cached;
    }

    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === sessionId) || null;
  }

  async getAllSessions(): Promise<TaskSession[]> {
    return measurePerformance('SessionService.getAllSessions', async () => {
      const cached = sessionStore.getSessions();
      if (cached.length > 0) {
        return cached;
      }

      const sessions = await this.storageService.getTaskSessions();
      sessionStore.setSessions(sessions);
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
    sessionStore.setSessions(updatedSessions);
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
        state: TimerState.idle,
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
    });
  }

  async getTimerInstanceById(instanceId: string): Promise<TimerInstance | null> {
    const sessions = sessionStore.getSessions();
    for (const session of sessions) {
      const instance = session.timerInstances.find(i => i.id === instanceId);
      if (instance) {
        return instance;
      }
    }

    const fresh = await this.getAllSessions();
    for (const session of fresh) {
      const instance = session.timerInstances.find(i => i.id === instanceId);
      if (instance) {
        return instance;
      }
    }

    return null;
  }

  async getTimerInstancesBySessionId(sessionId: string): Promise<TimerInstance[]> {
    const session = await this.getSessionById(sessionId);
    return session ? session.timerInstances : [];
  }

  async startTimerInstance(instanceId: string): Promise<void> {
    // Ensure only one timer instance is running at a time
    const sessions = await this.getAllSessions();

    // Find the parent session for this instance
    const parentSession = sessions.find(s =>
      s.timerInstances.some(i => i.id === instanceId)
    );

    if (!parentSession) {
      throw new Error(`Timer instance with ID ${instanceId} not found`);
    }

    // Validate that the session is active before starting its timer
    if (!parentSession.isActive) {
      throw new Error('Cannot start timer for inactive session');
    }

    const runningInstance = sessions
      .flatMap(s => s.timerInstances)
      .find(i => i.state === TimerState.running);

    let targetInstanceId = instanceId;
    let instance = parentSession.timerInstances.find(i => i.id === instanceId);

    if (!runningInstance) {
      if (!instance || instance.state !== TimerState.idle || instance.endTime || instance.duration) {
        const newInstance = await this.createTimerInstance(parentSession.id);
        targetInstanceId = newInstance.id;
        instance = newInstance;
      }
    } else if (runningInstance.id !== instanceId) {
      throw new Error('Another timer instance is already running');
    }

    if (!instance || instance.state !== TimerState.idle) {
      throw new Error('Timer instance is not idle');
    }

    const now = new Date();
    await this.updateTimerInstance(targetInstanceId, {
      state: TimerState.running,
      isRunning: true,
      isPaused: false,
      startTime: now,
      pausedDuration: 0,
    });
  }

  async stopTimerInstance(instanceId: string): Promise<void> {
    const instance = await this.getTimerInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Timer instance with ID ${instanceId} not found`);
    }

    if (instance.state !== TimerState.running && instance.state !== TimerState.paused) {
      throw new Error('Cannot stop timer that is not running or paused');
    }

    const now = new Date();
    const duration = now.getTime() - instance.startTime.getTime() - (instance.pausedDuration || 0);

    await this.updateTimerInstance(instanceId, {
      state: TimerState.stopped,
      isRunning: false,
      isPaused: false,
      pausedAt: undefined,
      endTime: now,
      duration: Math.max(0, duration),
    });
  }

  async pauseTimerInstance(instanceId: string): Promise<void> {
    const instance = await this.getTimerInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Timer instance with ID ${instanceId} not found`);
    }

    if (instance.state !== TimerState.running) {
      throw new Error('Only running timers can be paused');
    }

    const now = new Date();
    await this.updateTimerInstance(instanceId, {
      state: TimerState.paused,
      isRunning: false,
      isPaused: true,
      pausedAt: now,
    });
  }

  async resumeTimerInstance(instanceId: string): Promise<void> {
    const instance = await this.getTimerInstanceById(instanceId);
    if (!instance || !instance.pausedAt) {
      throw new Error(`Timer instance with ID ${instanceId} not found or not paused`);
    }

    if (instance.state !== TimerState.paused) {
      throw new Error('Only paused timers can be resumed');
    }

    const now = new Date();
    const additionalPausedTime = now.getTime() - instance.pausedAt.getTime();
    const totalPausedDuration = (instance.pausedDuration || 0) + additionalPausedTime;

    await this.updateTimerInstance(instanceId, {
      state: TimerState.running,
      isRunning: true,
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

  // ============================================================================
  // Legacy TimerService functionality
  // ============================================================================

  /**
   * Start a new legacy timer entry
   */
  async startTimer(
    taskName: string,
    taskId?: string,
    startTime?: Date
  ): Promise<TimeEntry> {
    return measurePerformance(
      'SessionService.startTimer',
      async () => {
        try {
          if (!taskName.trim()) {
            throw createTimerError(
              'TIMER_TASK_NOT_FOUND',
              'Task name cannot be empty',
              { taskName },
              'startTimer'
            );
          }

          if (this.activeTimer && this.activeTimer.isRunning) {
            throw createTimerError(
              'TIMER_ALREADY_RUNNING',
              'A timer is already running. Stop the current timer before starting a new one.',
              { activeTimer: this.activeTimer },
              'startTimer'
            );
          }

          const now = startTime || new Date();
          const newEntry: TimeEntry = {
            id: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            taskName: taskName.trim(),
            taskId,
            startTime: now,
            isRunning: true,
            date: formatDateString(now),
          };

          this.activeTimer = newEntry;
          await this.saveTimeEntry(newEntry);
          await this.updateTauriTimerState(newEntry);
          return newEntry;
        } catch (error) {
          if (error instanceof TimerErrorClass) {
            throw error;
          }
          console.error('Failed to start timer:', error);
          throw createTimerError(
            'TIMER_START_FAILED',
            'Failed to start timer',
            { originalError: error, taskName, taskId },
            'startTimer'
          );
        }
      },
      'timer',
      { taskName, taskId }
    );
  }

  /**
   * Stop an active legacy timer
   */
  async stopTimer(entryId: string, roundingOption: TimerRoundingOption = 'none'): Promise<TimeEntry> {
    try {
      const entries = await this.getTimeEntries();
      const entry = entries.find(e => e.id === entryId);

      if (!entry) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          `Timer entry with ID ${entryId} not found`,
          { entryId },
          'stopTimer'
        );
      }

      if (!entry.isRunning) {
        throw createTimerError(
          'TIMER_NOT_RUNNING',
          'Timer is not currently running',
          { entry },
          'stopTimer'
        );
      }

      const now = new Date();
      const rawDuration = now.getTime() - entry.startTime.getTime();
      const duration = applyTimerRounding(rawDuration, roundingOption);

      const updatedEntry: TimeEntry = {
        ...entry,
        endTime: now,
        duration,
        isRunning: false,
      };

      await this.updateTauriTimerState(null);
      this.activeTimer = null;

      await this.updateTimeEntry(entryId, {
        endTime: now,
        duration,
        isRunning: false,
      });

      return updatedEntry;
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }
      console.error('Failed to stop timer:', error);
      throw createTimerError(
        'TIMER_STOP_FAILED',
        'Failed to stop timer',
        { originalError: error, entryId },
        'stopTimer'
      );
    }
  }

  /**
   * Update active timer state
   */
  async updateActiveTimer(entry: TimeEntry): Promise<void> {
    try {
      this.activeTimer = entry;
      await this.updateTauriTimerState(entry);
      await this.updateTimeEntry(entry.id, entry);
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }
      console.error('Failed to update active timer:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to update active timer',
        { originalError: error, entry },
        'updateActiveTimer'
      );
    }
  }

  async getActiveTimer(): Promise<TimeEntry | null> {
    return this.activeTimer;
  }

  async setActiveTimer(entry: TimeEntry | null): Promise<void> {
    this.activeTimer = entry;
  }

  async updateSystemTray(activeEntry: TimeEntry | null, allEntries: TimeEntry[]): Promise<void> {
    return measurePerformance(
      'SessionService.updateSystemTray',
      async () => {
        if (!isTauriEnvironment()) {
          console.log('Skipping system tray update in web environment');
          return;
        }

        try {
          if (activeEntry && activeEntry.isRunning) {
            await safeInvoke('update_timer_state', {
              isRunning: true,
              taskName: activeEntry.taskName,
              startTime: activeEntry.startTime.toISOString(),
              elapsedMs: Date.now() - activeEntry.startTime.getTime(),
            });
          } else {
            await safeInvoke('update_timer_state', {
              isRunning: false,
              taskName: '',
              startTime: null,
              elapsedMs: 0,
            });
          }

          const timeEntriesData = allEntries.map(entry => ({
            date: entry.date,
            duration: entry.duration || 0,
            isRunning: entry.isRunning,
            taskName: entry.taskName,
          }));

          await safeInvoke('update_tray_menu_command', {
            timeEntries: timeEntriesData,
          });
        } catch (error) {
          console.error('Failed to update system tray:', error);
        }
      },
      'timer',
      { hasActiveEntry: !!activeEntry, entriesCount: allEntries.length }
    );
  }

  async saveTimeEntry(entry: TimeEntry): Promise<void> {
    try {
      const entries = await this.getTimeEntries();
      const existingIndex = entries.findIndex(e => e.id === entry.id);
      if (existingIndex >= 0) {
        entries[existingIndex] = entry;
      } else {
        entries.push(entry);
      }
      await this.storageService.setTimeEntries(entries);
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to save time entry',
        { originalError: error, entry },
        'saveTimeEntry'
      );
    }
  }

  async updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
    try {
      const entries = await this.getTimeEntries();
      const entryIndex = entries.findIndex(e => e.id === entryId);
      if (entryIndex === -1) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          `Time entry with ID ${entryId} not found`,
          { entryId },
          'updateTimeEntry'
        );
      }
      const updatedEntry = { ...entries[entryIndex], ...updates };
      entries[entryIndex] = updatedEntry;
      await this.storageService.setTimeEntries(entries);
      return updatedEntry;
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }
      console.error('Failed to update time entry:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to update time entry',
        { originalError: error, entryId, updates },
        'updateTimeEntry'
      );
    }
  }

  async deleteTimeEntry(entryId: string): Promise<void> {
    try {
      const entries = await this.getTimeEntries();
      const filteredEntries = entries.filter(e => e.id !== entryId);
      if (filteredEntries.length === entries.length) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          `Time entry with ID ${entryId} not found`,
          { entryId },
          'deleteTimeEntry'
        );
      }
      await this.storageService.setTimeEntries(filteredEntries);
    } catch (error) {
      console.error('Failed to delete time entry:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to delete time entry',
        { originalError: error, entryId },
        'deleteTimeEntry'
      );
    }
  }

  async getTimeEntries(): Promise<TimeEntry[]> {
    try {
      return await this.storageService.getTimeEntries();
    } catch (error) {
      console.error('Failed to get time entries:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to retrieve time entries',
        { originalError: error },
        'getTimeEntries'
      );
    }
  }

  async getTimeEntriesByDate(date: string): Promise<TimeEntry[]> {
    try {
      const entries = await this.getTimeEntries();
      return entries.filter(entry => entry.date === date);
    } catch (error) {
      console.error('Failed to get time entries by date:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to retrieve time entries for date',
        { originalError: error, date },
        'getTimeEntriesByDate'
      );
    }
  }

  async getDailyTotal(date?: string): Promise<{ totalDuration: number; taskCount: number }> {
    try {
      const targetDate = date || formatDateString(new Date());
      const entries = await this.getTimeEntriesByDate(targetDate);
      const totalDuration = entries.reduce((total, entry) => total + (entry.duration || 0), 0);
      return { totalDuration, taskCount: entries.length };
    } catch (error) {
      console.error('Failed to get daily total:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to calculate daily total',
        { originalError: error, date },
        'getDailyTotal'
      );
    }
  }

  private async updateTauriTimerState(entry: TimeEntry | null): Promise<void> {
    if (!isTauriEnvironment()) {
      console.log('Skipping Tauri timer state update in web environment');
      return;
    }
    try {
      if (entry && entry.isRunning) {
        await safeInvoke('update_timer_state', {
          isRunning: true,
          taskName: entry.taskName,
          startTime: entry.startTime.toISOString(),
          elapsedMs: Date.now() - entry.startTime.getTime(),
        });
      } else {
        await safeInvoke('update_timer_state', {
          isRunning: false,
          taskName: '',
          startTime: null,
          elapsedMs: 0,
        });
      }
    } catch (error) {
      console.error('Failed to update Tauri timer state:', error);
    }
  }
}
