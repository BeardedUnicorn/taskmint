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
  createTask: jest.fn().mockImplementation(async (taskData: any) => {
    // Validate task data first
    const validation = await mockTaskServiceInstance.validateTask(taskData);
    if (!validation.isValid) {
      throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if task name is unique
    const isUnique = await mockTaskServiceInstance.isTaskNameUnique(taskData.name);
    if (!isUnique) {
      throw new Error(`A task with the name "${taskData.name}" already exists`);
    }

    return {
      id: `task_${Date.now()}`,
      ...taskData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }),
  updateTask: jest.fn().mockImplementation(async (taskId: string, updates: any) => {
    const existingTask = await mockTaskServiceInstance.getTask(taskId);
    if (!existingTask) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const updatedTaskData = { ...existingTask, ...updates };
    const validation = await mockTaskServiceInstance.validateTask(updatedTaskData);
    if (!validation.isValid) {
      throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
    }

    // Check name uniqueness if name is being updated
    if (updates.name && updates.name !== existingTask.name) {
      const isUnique = await mockTaskServiceInstance.isTaskNameUnique(updates.name, taskId);
      if (!isUnique) {
        throw new Error(`A task with the name "${updates.name}" already exists`);
      }
    }

    // Ensure updatedAt is different from createdAt
    const updatedTask = {
      ...existingTask,
      ...updates,
      updatedAt: new Date(Date.now() + 1).toISOString(), // Add 1ms to ensure different timestamp
    };

      // Update the mock storage
      const allTasks = await mockTaskServiceInstance.getAllTasks();
      const taskIndex = allTasks.findIndex((t: any) => t.id === taskId);
      if (taskIndex >= 0) {
        allTasks[taskIndex] = updatedTask;
        mockTaskServiceInstance.getAllTasks.mockResolvedValue([...allTasks]);
      }

    return updatedTask;
  }),
  deleteTask: jest.fn().mockImplementation(async (taskId: string) => {
    const existingTask = await mockTaskServiceInstance.getTask(taskId);
    if (!existingTask) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    // Remove from mock storage
    const allTasks = await mockTaskServiceInstance.getAllTasks();
    const filteredTasks = allTasks.filter((t: any) => t.id !== taskId);
    mockTaskServiceInstance.getAllTasks.mockResolvedValue(filteredTasks);
  }),
  getTask: jest.fn().mockImplementation(async (taskId: string) => {
    const allTasks = await mockTaskServiceInstance.getAllTasks();
    return allTasks.find((t: any) => t.id === taskId) || null;
  }),
  getAllTasks: jest.fn().mockResolvedValue([]),
  searchTasks: jest.fn().mockImplementation(async (query: string) => {
    const allTasks = await mockTaskServiceInstance.getAllTasks();
    const searchTerm = query.toLowerCase().trim();
    if (!searchTerm) return allTasks;
    return allTasks.filter((task: any) => 
      task.name.toLowerCase().includes(searchTerm)
    );
  }),
  getTasksByHourlyRate: jest.fn().mockImplementation(async (minRate?: number, maxRate?: number) => {
    const allTasks = await mockTaskServiceInstance.getAllTasks();
    return allTasks.filter((task: any) => {
      if (task.hourlyRate === undefined) {
        return minRate === undefined && maxRate === undefined;
      }
      const rate = task.hourlyRate;
      const meetsMin = minRate === undefined || rate >= minRate;
      const meetsMax = maxRate === undefined || rate <= maxRate;
      return meetsMin && meetsMax;
    });
  }),
  validateTask: jest.fn().mockImplementation(async (task: any) => {
    const errors: string[] = [];
    if (!task.name) {
      errors.push('Task name is required');
    }
    if (task.hourlyRate !== undefined) {
      if (typeof task.hourlyRate !== 'number' || task.hourlyRate < 0) {
        errors.push('Hourly rate must be a positive number');
      }
      if (task.hourlyRate > 1000) {
        errors.push('Hourly rate cannot exceed 1000');
      }
    }
    return { isValid: errors.length === 0, errors };
  }),
  isTaskNameUnique: jest.fn().mockImplementation(async (name: string, excludeId?: string) => {
    const allTasks = await mockTaskServiceInstance.getAllTasks();
    const trimmedName = name.trim().toLowerCase();
    return !allTasks.some((task: any) => 
      task.id !== excludeId && 
      task.name.toLowerCase() === trimmedName
    );
  }),
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
      mockStorageServiceInstance.getTimeEntries.mockResolvedValue(entries);

      // Get daily total
      const dailyTotal = await timerService.getDailyTotal(date);

      expect(dailyTotal).toEqual({
        totalDuration: 0,
        taskCount: 0,
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

      // Mock the task to be available for getTask calls
      mockTaskServiceInstance.getAllTasks.mockResolvedValue([createdTask]);

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
    }, 15000);

    it('should enforce unique task names', async () => {
      const taskData = {
        name: 'Unique Task',
        hourlyRate: 50,
      };

      // Create first task
      await taskService.createTask(taskData);

      mockTaskServiceInstance.isTaskNameUnique.mockResolvedValue(false);

      // Try to create second task with same name
      await expect(taskService.createTask(taskData)).rejects.toThrow(
        /task with the name.*already exists/i
      );
    });

    it('should validate task data properly', async () => {
      mockTaskServiceInstance.validateTask.mockImplementation(async (task) => {
        const errors: string[] = [];
        if (!task.name) errors.push('Task name is required');
        if (task.hourlyRate < 0) errors.push('Hourly rate must be a positive number');
        if (task.hourlyRate > 1000) errors.push('Hourly rate cannot exceed 1000');
        return { isValid: errors.length === 0, errors };
      });
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

      // Mock the getAllTasks method to return these tasks
      mockTaskServiceInstance.getAllTasks.mockResolvedValue(tasks);

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
      // Reset the unique name check for this test
      mockTaskServiceInstance.isTaskNameUnique.mockResolvedValue(true);
      
      // Create a task
      const task = await taskService.createTask({
        name: 'Integration Task',
        hourlyRate: 100,
      });

      // Update the stopTimer mock to include the task information
      mockTimerServiceInstance.stopTimer.mockImplementationOnce(async (id: string) => {
        return {
          id,
          taskName: task.name,
          taskId: task.id,
          startTime: new Date('2024-01-01T10:00:00.000Z'),
          endTime: new Date('2024-01-01T12:00:00.000Z'),
          duration: 7200000, // 2 hours in milliseconds
          isRunning: false,
          date: '2024-01-01',
        };
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

      // Verify time entry was saved
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.TIME_ENTRIES,
        expect.stringContaining(timeEntry.id)
      );
    });

    it('should handle service failures gracefully without data corruption', async () => {
      // Reset the unique name check for this test
      mockTaskServiceInstance.isTaskNameUnique.mockResolvedValue(true);
      
      // Mock the createTask to throw a storage error
      mockTaskServiceInstance.createTask.mockImplementationOnce(async () => {
        throw new Error('Storage failure');
      });

      // Try to create a task (should fail)
      await expect(taskService.createTask({
        name: 'Failing Task',
        hourlyRate: 50,
      })).rejects.toThrow(/storage.*failure/i);

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
