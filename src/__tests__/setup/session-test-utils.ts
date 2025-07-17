/**
 * Test Utilities for Session-Based System
 *
 * Common test utilities, mocks, and helpers for testing the session-based
 * timer system components and functionality.
 */

import { vi } from 'vitest';
import { TaskSession, TimerInstance, InactivitySettings } from '../../types/timer';
import { Task } from '../../types/task';
import { TaskNote } from '../../types/notes';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

export const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: 'Test Task',
  description: 'A test task for development',
  createdAt: '2024-01-15T09:00:00Z',
  updatedAt: '2024-01-15T09:00:00Z',
  ...overrides,
});

export const createMockTimerInstance = (overrides: Partial<TimerInstance> = {}): TimerInstance => ({
  id: 'instance-1',
  sessionId: 'session-1',
  startTime: new Date('2024-01-15T10:00:00Z'),
  isRunning: false,
  isPaused: false,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

export const createMockTaskSession = (overrides: Partial<TaskSession> = {}): TaskSession => ({
  id: 'session-1',
  taskId: 'task-1',
  taskName: 'Test Task',
  timerInstances: [],
  totalDuration: 0,
  isActive: false,
  date: '2024-01-15',
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

export const createMockTaskNote = (overrides: Partial<TaskNote> = {}): TaskNote => ({
  id: 'note-1',
  taskId: 'task-1',
  templateId: 'template-1',
  templateName: 'Work Notes',
  fieldValues: { notes: 'Test note content' },
  noteLevel: 'task',
  isArchived: false,
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides,
});

export const createMockInactivitySettings = (overrides: Partial<InactivitySettings> = {}): InactivitySettings => ({
  enabled: true,
  thresholdMinutes: 15,
  showWarningBeforePause: true,
  warningDurationSeconds: 30,
  resumeOnActivity: false,
  ...overrides,
});

// ============================================================================
// MOCK SCENARIOS
// ============================================================================

export const createActiveSessionScenario = () => {
  const task = createMockTask();
  const runningInstance = createMockTimerInstance({
    isRunning: true,
    startTime: new Date(),
  });
  const completedInstance = createMockTimerInstance({
    id: 'instance-2',
    isRunning: false,
    endTime: new Date(Date.now() - 3600000), // 1 hour ago
    duration: 3600000, // 1 hour
  });
  
  const session = createMockTaskSession({
    isActive: true,
    timerInstances: [runningInstance, completedInstance],
    totalDuration: 3600000, // 1 hour from completed instance
  });

  return { task, session, runningInstance, completedInstance };
};

export const createMultipleSessionsScenario = () => {
  const tasks = [
    createMockTask({ id: 'task-1', name: 'Development' }),
    createMockTask({ id: 'task-2', name: 'Code Review' }),
    createMockTask({ id: 'task-3', name: 'Documentation' }),
  ];

  const sessions = [
    createMockTaskSession({
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Development',
      isActive: true,
      totalDuration: 7200000, // 2 hours
      timerInstances: [
        createMockTimerInstance({
          id: 'instance-1',
          sessionId: 'session-1',
          isRunning: true,
        }),
      ],
    }),
    createMockTaskSession({
      id: 'session-2',
      taskId: 'task-2',
      taskName: 'Code Review',
      isActive: false,
      totalDuration: 3600000, // 1 hour
      timerInstances: [
        createMockTimerInstance({
          id: 'instance-2',
          sessionId: 'session-2',
          duration: 3600000,
        }),
      ],
    }),
    createMockTaskSession({
      id: 'session-3',
      taskId: 'task-3',
      taskName: 'Documentation',
      isActive: false,
      totalDuration: 1800000, // 30 minutes
      timerInstances: [
        createMockTimerInstance({
          id: 'instance-3',
          sessionId: 'session-3',
          duration: 1800000,
        }),
      ],
    }),
  ];

  return { tasks, sessions };
};

export const createInactivityScenario = () => {
  const settings = createMockInactivitySettings({
    enabled: true,
    thresholdMinutes: 5,
    showWarningBeforePause: true,
    warningDurationSeconds: 10,
  });

  const { session, runningInstance } = createActiveSessionScenario();

  return { settings, session, runningInstance };
};

// ============================================================================
// MOCK FUNCTIONS
// ============================================================================

export const createMockTauriInvoke = () => {
  const mockInvoke = vi.fn();

  // Default implementations
  mockInvoke.mockImplementation((command: string, args?: any) => {
    switch (command) {
      case 'get_sessions':
        return Promise.resolve([]);
      case 'get_tasks':
        return Promise.resolve([createMockTask()]);
      case 'create_session':
        return Promise.resolve(createMockTaskSession({
          taskId: args?.taskId,
          taskName: args?.taskName,
        }));
      case 'create_session_with_timer':
        const session = createMockTaskSession({
          taskId: args?.taskId,
          taskName: args?.taskName,
          isActive: true,
        });
        const timerInstance = createMockTimerInstance({
          sessionId: session.id,
          isRunning: true,
        });
        return Promise.resolve([session, timerInstance]);
      case 'create_timer_instance':
        return Promise.resolve(createMockTimerInstance({
          sessionId: args?.sessionId,
        }));
      case 'start_timer_instance':
      case 'stop_timer_instance':
      case 'pause_timer_instance':
      case 'resume_timer_instance':
      case 'update_timer_instance':
      case 'update_session':
      case 'delete_session':
        return Promise.resolve();
      case 'get_enhanced_timer_state':
        return Promise.resolve({
          activeSession: null,
          activeInstance: null,
          isRunning: false,
          taskName: '',
          sessionId: null,
          instanceId: null,
          startTime: null,
          elapsedMs: 0,
          isPaused: false,
          pausedDueToInactivity: false,
        });
      case 'get_inactivity_settings':
        return Promise.resolve(createMockInactivitySettings());
      case 'update_inactivity_settings':
      case 'update_timer_activity_state':
        return Promise.resolve();
      case 'get_timer_activity_state':
        return Promise.resolve({
          lastActivityTime: new Date(),
          isUserActive: true,
          inactivityWarningShown: false,
          pausedDueToInactivity: false,
        });
      default:
        return Promise.resolve(null);
    }
  });

  return mockInvoke;
};

export const createMockNotificationContext = () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
});

export const createMockInactivityDetection = (overrides = {}) => ({
  isActive: true,
  settings: createMockInactivitySettings(),
  activityState: {
    lastActivityTime: new Date(),
    isUserActive: true,
    inactivityWarningShown: false,
    pausedDueToInactivity: false,
  },
  updateSettings: vi.fn(),
  resetActivity: vi.fn(),
  pauseDetection: vi.fn(),
  resumeDetection: vi.fn(),
  isWarningShown: false,
  warningTimeRemaining: 0,
  ...overrides,
});

// ============================================================================
// TEST HELPERS
// ============================================================================

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0));

export const advanceTimersByTime = (ms: number) => {
  vi.advanceTimersByTime(ms);
  return waitForNextTick();
};

export const mockDateNow = (timestamp: number) => {
  const originalDateNow = Date.now;
  Date.now = vi.fn(() => timestamp);
  return () => {
    Date.now = originalDateNow;
  };
};

export const createMockLocalStorage = () => {
  const storage: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key]);
    }),
    key: vi.fn((index: number) => Object.keys(storage)[index] || null),
    get length() {
      return Object.keys(storage).length;
    },
  };
};

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

export const expectSessionToBeActive = (session: TaskSession) => {
  expect(session.isActive).toBe(true);
  expect(session.timerInstances.some(i => i.isRunning)).toBe(true);
};

export const expectSessionToBeInactive = (session: TaskSession) => {
  expect(session.isActive).toBe(false);
  expect(session.timerInstances.every(i => !i.isRunning)).toBe(true);
};

export const expectTimerInstanceToBeRunning = (instance: TimerInstance) => {
  expect(instance.isRunning).toBe(true);
  expect(instance.isPaused).toBe(false);
  expect(instance.startTime).toBeInstanceOf(Date);
};

export const expectTimerInstanceToBeStopped = (instance: TimerInstance) => {
  expect(instance.isRunning).toBe(false);
  expect(instance.isPaused).toBe(false);
  expect(instance.endTime).toBeInstanceOf(Date);
  expect(instance.duration).toBeGreaterThan(0);
};

export const expectTimerInstanceToBePaused = (instance: TimerInstance) => {
  expect(instance.isRunning).toBe(false);
  expect(instance.isPaused).toBe(true);
  expect(instance.pausedAt).toBeInstanceOf(Date);
};

// ============================================================================
// PERFORMANCE HELPERS
// ============================================================================

export const measureRenderTime = async (renderFn: () => void) => {
  const start = performance.now();
  renderFn();
  await waitForNextTick();
  const end = performance.now();
  return end - start;
};

export const expectRenderTimeToBeReasonable = (renderTime: number, maxMs = 100) => {
  expect(renderTime).toBeLessThan(maxMs);
};

// Global test utilities
declare global {
  const vi: typeof import('vitest').vi;
}
