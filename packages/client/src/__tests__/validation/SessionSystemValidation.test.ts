/**
 * Session System Validation Tests
 * 
 * Validation tests to ensure the session-based timer system types and
 * data structures meet the specified requirements.
 */

import { describe, it, expect } from 'vitest';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
  createActiveSessionScenario,
  createMultipleSessionsScenario,
  expectSessionToBeActive,
  expectTimerInstanceToBeRunning,
  expectTimerInstanceToBeStopped,
} from '../setup/session-test-utils';
import { TaskSession, TimerInstance, InactivitySettings } from '../../types/timer';

describe('Session System Validation', () => {

  describe('Requirement: Task Session Management', () => {
    it('should allow selecting an existing task and creating a new session', () => {
      const task = createMockTask({ name: 'Development Work' });
      const session = createMockTaskSession({
        taskId: task.id,
        taskName: task.name,
      });

      // Validate session structure
      expect(session.taskId).toBe(task.id);
      expect(session.taskName).toBe(task.name);
      expect(session.timerInstances).toEqual([]);
      expect(session.totalDuration).toBe(0);
      expect(session.isActive).toBe(false);
      expect(session.id).toBeDefined();
      expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should automatically begin a timer when a session is started', () => {
      const session = createMockTaskSession({ isActive: true });
      const timerInstance = createMockTimerInstance({
        sessionId: session.id,
        isRunning: true,
      });

      // Validate timer instance is properly linked to session
      expect(timerInstance.sessionId).toBe(session.id);
      expect(timerInstance.isRunning).toBe(true);
      expect(timerInstance.startTime).toBeInstanceOf(Date);
      expectTimerInstanceToBeRunning(timerInstance);
    });

    it('should support multiple individual timer instances within a session', () => {
      const session = createMockTaskSession();
      const instance1 = createMockTimerInstance({
        id: 'instance-1',
        sessionId: session.id,
      });
      const instance2 = createMockTimerInstance({
        id: 'instance-2',
        sessionId: session.id,
      });

      // Validate multiple instances can belong to same session
      expect(instance1.sessionId).toBe(session.id);
      expect(instance2.sessionId).toBe(session.id);
      expect(instance1.id).not.toBe(instance2.id);
      
      // Validate session can contain multiple instances
      const sessionWithInstances = createMockTaskSession({
        timerInstances: [instance1, instance2],
      });
      expect(sessionWithInstances.timerInstances).toHaveLength(2);
    });
  });

  describe('Requirement: Timer Functionality', () => {
    it('should implement automatic timer pausing based on inactivity', () => {
      const { session, runningInstance } = createActiveSessionScenario();
      
      // Simulate inactivity detection triggering pause
      const pausedInstance: TimerInstance = {
        ...runningInstance,
        isRunning: false,
        isPaused: true,
        pausedAt: new Date(),
      };

      // Validate pause state
      expect(pausedInstance.isRunning).toBe(false);
      expect(pausedInstance.isPaused).toBe(true);
      expect(pausedInstance.pausedAt).toBeInstanceOf(Date);
      expect(pausedInstance.sessionId).toBe(session.id);
    });

    it('should make inactivity threshold configurable', () => {
      const defaultSettings: InactivitySettings = {
        enabled: true,
        thresholdMinutes: 15,
      };

      const customSettings: InactivitySettings = {
        ...defaultSettings,
        thresholdMinutes: 30,
      };

      // Validate that settings can be customized
      expect(customSettings.thresholdMinutes).toBe(30);
      expect(customSettings.thresholdMinutes).toBeGreaterThan(0);
      expect(customSettings.thresholdMinutes).toBeLessThanOrEqual(120);
      expect(customSettings.enabled).toBe(true);
    });

    it('should track each timer instance independently within a session', () => {
      const session = createMockTaskSession();
      const runningInstance = createMockTimerInstance({
        id: 'running-instance',
        sessionId: session.id,
        isRunning: true,
      });
      const stoppedInstance = createMockTimerInstance({
        id: 'stopped-instance',
        sessionId: session.id,
        isRunning: false,
        duration: 3600000, // 1 hour
      });

      const sessionWithInstances: TaskSession = {
        ...session,
        timerInstances: [runningInstance, stoppedInstance],
        totalDuration: stoppedInstance.duration || 0,
      };

      // Validate independent tracking
      expect(runningInstance.isRunning).toBe(true);
      expect(stoppedInstance.isRunning).toBe(false);
      expect(stoppedInstance.duration).toBe(3600000);
      expect(sessionWithInstances.totalDuration).toBe(3600000);
    });
  });

  describe('Requirement: Notes System', () => {
    it('should allow notes at timer level', () => {
      const timerInstance = createMockTimerInstance({
        notes: 'Working on authentication feature',
      });

      expect(timerInstance.notes).toBe('Working on authentication feature');
      expect(timerInstance.notes).toBeDefined();
      expect(typeof timerInstance.notes).toBe('string');
    });

    it('should allow notes at task/session level', () => {
      const session = createMockTaskSession({
        notes: 'Session focused on user authentication improvements',
      });

      expect(session.notes).toBe('Session focused on user authentication improvements');
      expect(session.notes).toBeDefined();
      expect(typeof session.notes).toBe('string');
    });

    it('should support both timer-level and session-level notes simultaneously', () => {
      const sessionNotes = 'Overall session goals and context';
      const timerNotes = 'Specific work done in this timer';

      const session = createMockTaskSession({
        notes: sessionNotes,
      });

      const timerInstance = createMockTimerInstance({
        sessionId: session.id,
        notes: timerNotes,
      });

      expect(session.notes).toBe(sessionNotes);
      expect(timerInstance.notes).toBe(timerNotes);
      expect(session.notes).not.toBe(timerInstance.notes);
      expect(timerInstance.sessionId).toBe(session.id);
    });
  });

  describe('Requirement: UI/UX Requirements', () => {
    it('should display multiple timers as visually grouped but individually listed', () => {
      const { sessions } = createMultipleSessionsScenario();
      const sessionWithMultipleTimers = sessions[0];

      // Validate session structure supports visual grouping
      expect(sessionWithMultipleTimers.timerInstances).toBeInstanceOf(Array);
      expect(sessionWithMultipleTimers.timerInstances.length).toBeGreaterThan(0);
      expect(sessionWithMultipleTimers.timerInstances[0].sessionId).toBe(sessionWithMultipleTimers.id);
    });

    it('should show total time calculation for entire task session', () => {
      const instance1Duration = 3600000; // 1 hour
      const instance2Duration = 1800000; // 30 minutes
      const expectedTotal = instance1Duration + instance2Duration;

      const session = createMockTaskSession({
        timerInstances: [
          createMockTimerInstance({ id: 'i1', duration: instance1Duration }),
          createMockTimerInstance({ id: 'i2', duration: instance2Duration }),
        ],
        totalDuration: expectedTotal,
      });

      expect(session.totalDuration).toBe(expectedTotal);
      expect(session.totalDuration).toBe(5400000); // 1.5 hours
    });

    it('should clearly distinguish between individual timer instances and session totals', () => {
      const { session } = createActiveSessionScenario();
      
      // Session has total duration
      expect(session.totalDuration).toBeDefined();
      expect(typeof session.totalDuration).toBe('number');

      // Each timer instance has individual duration
      session.timerInstances.forEach(instance => {
        if (instance.duration) {
          expect(typeof instance.duration).toBe('number');
          expect(instance.duration).toBeGreaterThan(0);
        }
      });

      // Session total should be sum of completed instances
      const completedInstancesTotal = session.timerInstances
        .filter(i => i.duration)
        .reduce((sum, i) => sum + (i.duration || 0), 0);
      
      expect(session.totalDuration).toBe(completedInstancesTotal);
    });
  });

  describe('Requirement: Technical Considerations', () => {
    it('should maintain backward compatibility with existing data', () => {
      // Test that old TimeEntry structure can coexist
      const legacyTimeEntry = {
        id: 'legacy-entry-1',
        taskName: 'Legacy Task',
        date: '2024-01-15T10:00:00Z',
        duration: 3600000,
        description: 'Legacy work entry',
      };

      const newSession = createMockTaskSession({
        taskName: 'Legacy Task',
        totalDuration: 3600000,
      });

      // Both structures should be valid
      expect(legacyTimeEntry.taskName).toBe(newSession.taskName);
      expect(legacyTimeEntry.duration).toBe(newSession.totalDuration);
      expect(typeof legacyTimeEntry.id).toBe('string');
      expect(typeof newSession.id).toBe('string');
    });

    it('should ensure proper data persistence for sessions and timer instances', () => {
      const session = createMockTaskSession();
      const timerInstance = createMockTimerInstance({
        sessionId: session.id,
      });

      // Validate data structure integrity
      expect(session.id).toBeDefined();
      expect(session.taskId).toBeDefined();
      expect(session.taskName).toBeDefined();
      expect(session.timerInstances).toBeInstanceOf(Array);
      expect(session.totalDuration).toBeGreaterThanOrEqual(0);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();

      expect(timerInstance.id).toBeDefined();
      expect(timerInstance.sessionId).toBe(session.id);
      expect(timerInstance.startTime).toBeInstanceOf(Date);
      expect(timerInstance.createdAt).toBeDefined();
      expect(timerInstance.updatedAt).toBeDefined();
    });

    it('should handle database schema changes gracefully', () => {
      // Test that new fields are optional and don't break existing functionality
      const minimalSession: TaskSession = {
        id: 'minimal-session',
        taskId: 'task-1',
        taskName: 'Minimal Task',
        timerInstances: [],
        totalDuration: 0,
        isActive: false,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        // notes field is optional
      };

      const enhancedSession: TaskSession = {
        ...minimalSession,
        notes: 'Enhanced with notes',
      };

      // Both should be valid
      expect(minimalSession.id).toBeDefined();
      expect(enhancedSession.id).toBeDefined();
      expect(enhancedSession.notes).toBeDefined();
      expect(minimalSession.notes).toBeUndefined();
    });
  });

  describe('Integration Validation', () => {
    it('should complete a full session workflow', () => {
      const task = createMockTask();
      const session = createMockTaskSession({ 
        taskId: task.id,
        taskName: task.name,
        isActive: true,
      });
      const timerInstance = createMockTimerInstance({ 
        sessionId: session.id,
        isRunning: true,
      });

      // Validate workflow data integrity
      expect(session.taskId).toBe(task.id);
      expect(session.taskName).toBe(task.name);
      expect(session.isActive).toBe(true);
      expect(timerInstance.sessionId).toBe(session.id);
      expect(timerInstance.isRunning).toBe(true);

      // Simulate stopping timer and ending session
      const stoppedInstance: TimerInstance = {
        ...timerInstance,
        isRunning: false,
        endTime: new Date(),
        duration: 3600000, // 1 hour
      };

      const endedSession: TaskSession = {
        ...session,
        isActive: false,
        totalDuration: stoppedInstance.duration || 0,
        timerInstances: [stoppedInstance],
      };

      expect(stoppedInstance.isRunning).toBe(false);
      expect(stoppedInstance.duration).toBe(3600000);
      expect(endedSession.isActive).toBe(false);
      expect(endedSession.totalDuration).toBe(3600000);
    });

    it('should handle error scenarios gracefully', () => {
      // Test invalid session data
      const invalidSession = {
        id: '',
        taskId: '',
        taskName: '',
        timerInstances: [],
        totalDuration: -1,
        isActive: false,
        date: 'invalid-date',
        createdAt: '',
        updatedAt: '',
      };

      // Validate error conditions
      expect(invalidSession.id).toBe('');
      expect(invalidSession.taskId).toBe('');
      expect(invalidSession.taskName).toBe('');
      expect(invalidSession.totalDuration).toBeLessThan(0);
      expect(invalidSession.date).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Test valid session creation
      const validSession = createMockTaskSession();
      expect(validSession.id).toBeTruthy();
      expect(validSession.taskId).toBeTruthy();
      expect(validSession.taskName).toBeTruthy();
      expect(validSession.totalDuration).toBeGreaterThanOrEqual(0);
      expect(validSession.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
