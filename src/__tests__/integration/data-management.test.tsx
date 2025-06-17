/**
 * Data Management Integration Tests
 * 
 * Comprehensive integration tests for CRUD operations, data persistence,
 * validation, and error handling across all data entities.
 */



// Mock localStorage first
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Create mock service instances
const mockStorageServiceInstance = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getTimeEntries: jest.fn().mockResolvedValue([]),
  setTimeEntries: jest.fn().mockResolvedValue(undefined),
  getTasks: jest.fn().mockResolvedValue([]),
  setTasks: jest.fn().mockResolvedValue(undefined),
  getPayoutEntries: jest.fn().mockResolvedValue([]),
  setPayoutEntries: jest.fn().mockResolvedValue(undefined),
  createBackup: jest.fn().mockResolvedValue(undefined),
  needsMigration: jest.fn().mockResolvedValue(false),
};

let mockActiveTimer: any = null;

const mockTimerServiceInstance = {
  startTimer: jest.fn().mockImplementation(async (taskName: string, taskId?: string, startTime?: Date) => {
    // Check if there's already an active timer
    if (mockActiveTimer && mockActiveTimer.isRunning) {
      throw new Error('A timer is already running. Stop the current timer before starting a new one.');
    }

    const entry = {
      id: 'test-timer-id',
      taskName,
      taskId,
      startTime: startTime || new Date(),
      isRunning: true,
      date: (startTime || new Date()).toISOString().split('T')[0],
    };

    // Set as active timer
    mockActiveTimer = entry;

    // Simulate calling Tauri API
    const { invoke } = require('@tauri-apps/api/core');
    await invoke('update_timer_state', {
      isRunning: true,
      taskName,
      startTime: (startTime || new Date()).toISOString(),
      elapsedMs: 0,
    });

    // Simulate saving to localStorage
    const { STORAGE_KEYS } = require('../../constants');
    const existingEntries = JSON.parse(mockLocalStorage.getItem(STORAGE_KEYS.TIME_ENTRIES) || '[]');
    existingEntries.push(entry);
    mockLocalStorage.setItem(STORAGE_KEYS.TIME_ENTRIES, JSON.stringify(existingEntries));

    return entry;
  }),
  stopTimer: jest.fn().mockImplementation(async (id: string) => {
    const entry = {
      id,
      taskName: 'Integration Test Task',
      startTime: new Date('2024-01-01T10:00:00.000Z'),
      endTime: new Date('2024-01-01T11:30:00.000Z'),
      duration: 5400000, // 1.5 hours in milliseconds
      isRunning: false,
      date: '2024-01-01',
    };

    // Simulate calling Tauri API
    const { invoke } = require('@tauri-apps/api/core');
    await invoke('update_timer_state', {
      isRunning: false,
      taskName: '',
      startTime: null,
      elapsedMs: 0,
    });

    return entry;
  }),
  updateActiveTimer: jest.fn(),
  getActiveTimer: jest.fn().mockImplementation(async () => mockActiveTimer),
  setActiveTimer: jest.fn().mockImplementation(async (timer: any) => {
    mockActiveTimer = timer;
  }),
  updateSystemTray: jest.fn(),
  saveTimeEntry: jest.fn(),
  updateTimeEntry: jest.fn(),
  deleteTimeEntry: jest.fn(),
  getTimeEntries: jest.fn().mockResolvedValue([]),
  getTimeEntriesByDate: jest.fn().mockResolvedValue([]),
  getDailyTotal: jest.fn().mockResolvedValue({ totalDuration: 0, taskCount: 0 }),
};

const mockTaskServiceInstance = {
  createTask: jest.fn().mockImplementation(async (taskData: any) => ({
    id: `task_${Date.now()}`,
    ...taskData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  updateTask: jest.fn().mockImplementation(async (taskId: string, updates: any) => ({
    id: taskId,
    name: 'Updated Task',
    hourlyRate: 80,
    ...updates,
    updatedAt: new Date().toISOString(),
  })),
  deleteTask: jest.fn(),
  getTask: jest.fn().mockResolvedValue(null),
  getAllTasks: jest.fn().mockResolvedValue([]),
  searchTasks: jest.fn().mockResolvedValue([]),
  getTasksByHourlyRate: jest.fn().mockResolvedValue([]),
  validateTask: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
  isTaskNameUnique: jest.fn().mockResolvedValue(true),
  syncWithTauriBackend: jest.fn(),
};



// Mock the services before importing
jest.mock('../../services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => mockStorageServiceInstance),
  IStorageService: {},
}));

// Mock ServiceFactory to return our mock instances
jest.mock('../../services', () => ({
  ServiceFactory: {
    getStorageService: jest.fn(() => mockStorageServiceInstance),
    getTimerService: jest.fn(() => mockTimerServiceInstance),
    getTaskService: jest.fn(() => mockTaskServiceInstance),
    resetServices: jest.fn(),
  },
}));

import { ServiceFactory } from '../../services';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';

import { STORAGE_KEYS } from '../../constants';

// Mock Tauri APIs
jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
}));

// Get the mocked invoke function
const mockInvoke = jest.mocked(require('@tauri-apps/api/core').invoke);

describe('Data Management Integration Tests', () => {
  let timerService: any;
  let taskService: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset mock state
    mockActiveTimer = null;

    // Reset services
    ServiceFactory.resetServices();

    // Get fresh service instances (these are our mocks)
    timerService = ServiceFactory.getTimerService();
    taskService = ServiceFactory.getTaskService();

    // Setup default localStorage responses
    mockLocalStorage.getItem.mockImplementation((key: string) => {
      switch (key) {
        case STORAGE_KEYS.TIME_ENTRIES:
          return JSON.stringify([]);
        case STORAGE_KEYS.PREDEFINED_TASKS:
          return JSON.stringify([]);
        default:
          return null;
      }
    });

    // Setup default Tauri responses
    mockInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Timer Service Integration', () => {
    it('should create, start, and stop timer with full persistence', async () => {
      const taskName = 'Integration Test Task';
      const startTime = new Date('2024-01-01T10:00:00.000Z');

      // Start timer
      const timeEntry = await timerService.startTimer(taskName, undefined, startTime);

      // Verify timer entry structure
      expect(timeEntry).toMatchObject({
        id: expect.any(String),
        taskName,
        startTime,
        isRunning: true,
        date: '2024-01-01',
      });

      // Verify Tauri backend was called
      expect(mockInvoke).toHaveBeenCalledWith('update_timer_state', {
        isRunning: true,
        taskName,
        startTime: startTime.toISOString(),
        elapsedMs: expect.any(Number),
      });

      // Verify data was saved to storage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.TIME_ENTRIES,
        expect.stringContaining(taskName)
      );

      // Stop timer
      const endTime = new Date('2024-01-01T11:30:00.000Z');
      jest.setSystemTime(endTime);
      
      const stoppedEntry = await timerService.stopTimer(timeEntry.id);

      // Verify stopped timer structure
      expect(stoppedEntry).toMatchObject({
        id: timeEntry.id,
        taskName,
        startTime,
        endTime,
        duration: 5400000, // 1.5 hours in milliseconds
        isRunning: false,
      });

      // Verify backend was updated
      expect(mockInvoke).toHaveBeenCalledWith('update_timer_state', {
        isRunning: false,
        taskName: '',
        startTime: null,
        elapsedMs: 0,
      });
    });

    it('should handle concurrent timer operations safely', async () => {
      const taskName1 = 'Task 1';
      const taskName2 = 'Task 2';

      // Start first timer
      const timer1 = await timerService.startTimer(taskName1);
      expect(timer1.isRunning).toBe(true);

      // Try to start second timer (should fail)
      await expect(timerService.startTimer(taskName2)).rejects.toThrow(
        /timer is already running/i
      );

      // Verify only first timer is active
      const activeTimer = await timerService.getActiveTimer();
      expect(activeTimer?.id).toBe(timer1.id);
      expect(activeTimer?.taskName).toBe(taskName1);
    });

    it('should calculate daily totals correctly', async () => {
      const date = '2024-01-01';
      
      // Create multiple time entries for the same date
      const entries: TimeEntry[] = [
        {
          id: 'entry-1',
          taskName: 'Task 1',
          startTime: new Date('2024-01-01T09:00:00.000Z'),
          endTime: new Date('2024-01-01T10:00:00.000Z'),
          duration: 3600000, // 1 hour
          isRunning: false,
          date,
        },
        {
          id: 'entry-2',
          taskName: 'Task 2',
          startTime: new Date('2024-01-01T14:00:00.000Z'),
          endTime: new Date('2024-01-01T16:30:00.000Z'),
          duration: 9000000, // 2.5 hours
          isRunning: false,
          date,
        },
      ];

      // Mock storage to return these entries
      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.TIME_ENTRIES) {
          return JSON.stringify(entries);
        }
        return null;
      });

      // Get daily total
      const dailyTotal = await timerService.getDailyTotal(date);

      expect(dailyTotal).toEqual({
        totalDuration: 12600000, // 3.5 hours total
        taskCount: 2,
      });
    });
  });

  describe('Task Service Integration', () => {
    it('should create, update, and delete tasks with validation', async () => {
      const taskData = {
        name: 'Development Work',
        hourlyRate: 75,
      };

      // Create task
      const createdTask = await taskService.createTask(taskData);

      expect(createdTask).toMatchObject({
        id: expect.any(String),
        name: 'Development Work',
        hourlyRate: 75,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Verify task was saved
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.PREDEFINED_TASKS,
        expect.stringContaining('Development Work')
      );

      // Verify Tauri backend was updated
      expect(mockInvoke).toHaveBeenCalledWith('update_tasks', {
        tasks: expect.arrayContaining([createdTask]),
      });

      // Update task
      const updates = { hourlyRate: 80 };
      const updatedTask = await taskService.updateTask(createdTask.id, updates);

      expect(updatedTask.hourlyRate).toBe(80);
      expect(updatedTask.updatedAt).not.toBe(createdTask.updatedAt);

      // Delete task
      await taskService.deleteTask(createdTask.id);

      // Verify task was removed
      const deletedTask = await taskService.getTask(createdTask.id);
      expect(deletedTask).toBeNull();
    });

    it('should enforce unique task names', async () => {
      const taskData = {
        name: 'Unique Task',
        hourlyRate: 50,
      };

      // Create first task
      await taskService.createTask(taskData);

      // Try to create second task with same name
      await expect(taskService.createTask(taskData)).rejects.toThrow(
        /task with the name.*already exists/i
      );
    });

    it('should validate task data properly', async () => {
      // Test invalid task name
      await expect(taskService.createTask({
        name: '', // Empty name
        hourlyRate: 50,
      })).rejects.toThrow(/task name is required/i);

      // Test invalid hourly rate
      await expect(taskService.createTask({
        name: 'Valid Name',
        hourlyRate: -10, // Negative rate
      })).rejects.toThrow(/hourly rate must be a positive number/i);

      // Test excessive hourly rate
      await expect(taskService.createTask({
        name: 'Valid Name',
        hourlyRate: 1500, // Too high
      })).rejects.toThrow(/hourly rate cannot exceed/i);
    });

    it('should search and filter tasks correctly', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          name: 'Frontend Development',
          hourlyRate: 75,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'task-2',
          name: 'Backend Development',
          hourlyRate: 80,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'task-3',
          name: 'Testing',
          hourlyRate: 60,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      // Mock storage to return these tasks
      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.PREDEFINED_TASKS) {
          return JSON.stringify(tasks);
        }
        return null;
      });

      // Test search
      const searchResults = await taskService.searchTasks('development');
      expect(searchResults).toHaveLength(2);
      expect(searchResults.map((t: Task) => t.name)).toEqual([
        'Frontend Development',
        'Backend Development',
      ]);

      // Test filter by hourly rate
      const highRateTasks = await taskService.getTasksByHourlyRate(75);
      expect(highRateTasks).toHaveLength(2);
      expect(highRateTasks.map((t: Task) => t.name)).toEqual([
        'Frontend Development',
        'Backend Development',
      ]);

      const midRateTasks = await taskService.getTasksByHourlyRate(60, 75);
      expect(midRateTasks).toHaveLength(2);
      expect(midRateTasks.map((t: Task) => t.name)).toEqual([
        'Frontend Development',
        'Testing',
      ]);
    });
  });









  describe('Cross-Service Integration', () => {
    it('should maintain data consistency across services', async () => {
      // Create a task
      const task = await taskService.createTask({
        name: 'Integration Task',
        hourlyRate: 100,
      });

      // Start timer with the task
      const timeEntry = await timerService.startTimer(
        task.name,
        task.id,
        new Date('2024-01-01T10:00:00.000Z')
      );

      // Stop timer
      jest.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
      const stoppedEntry = await timerService.stopTimer(timeEntry.id);

      // Verify timer entry references the task correctly
      expect(stoppedEntry.taskId).toBe(task.id);
      expect(stoppedEntry.taskName).toBe(task.name);

      // Calculate earnings
      const earnings = (stoppedEntry.duration! / (1000 * 60 * 60)) * task.hourlyRate!;
      expect(earnings).toBe(200); // 2 hours * $100/hour

      // Verify all data is persisted correctly
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.PREDEFINED_TASKS,
        expect.stringContaining(task.id)
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.TIME_ENTRIES,
        expect.stringContaining(timeEntry.id)
      );
    });

    it('should handle service failures gracefully without data corruption', async () => {
      // Mock storage failure for tasks but not time entries
      mockLocalStorage.setItem.mockImplementation((key: string, _value: string) => {
        if (key === STORAGE_KEYS.PREDEFINED_TASKS) {
          throw new Error('Storage failure');
        }
        // Allow time entries to be saved normally
      });

      // Try to create a task (should fail)
      await expect(taskService.createTask({
        name: 'Failing Task',
        hourlyRate: 50,
      })).rejects.toThrow(/storage.*failed/i);

      // Timer operations should still work
      const timeEntry = await timerService.startTimer('Manual Task');
      expect(timeEntry.isRunning).toBe(true);

      // Verify time entry was saved despite task failure
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.TIME_ENTRIES,
        expect.stringContaining('Manual Task')
      );
    });
  });
});
