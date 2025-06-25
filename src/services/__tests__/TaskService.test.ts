/**
 * Tests for TaskService
 */

import { TaskService } from '../TaskService';
import { IStorageService } from '../StorageService';
import { Task, TaskHierarchy } from '../../types';
import { TimeEntry } from '../../types';
import { TaskErrorClass } from '../../types/errors';
import { validateTaskName } from '../../utils/validation';
import {
  buildTaskHierarchy,
  getChildTasks,
  getParentTask,
  getTaskPath,
  canDeleteTask,
  prepareTaskDeletion,
  validateTaskHierarchy,
  getNextChildOrder
} from '../../utils/taskHierarchy';

// Mock dependencies
jest.mock('../../utils/validation');
jest.mock('../../utils/taskHierarchy');
jest.mock('@tauri-apps/api/core');

describe('TaskService', () => {
  let taskService: TaskService;
  let mockStorageService: jest.Mocked<IStorageService>;
  let mockValidateTaskName: jest.MockedFunction<typeof validateTaskName>;
  let mockBuildTaskHierarchy: jest.MockedFunction<typeof buildTaskHierarchy>;
  let mockGetChildTasks: jest.MockedFunction<typeof getChildTasks>;
  let mockGetParentTask: jest.MockedFunction<typeof getParentTask>;
  let mockGetTaskPath: jest.MockedFunction<typeof getTaskPath>;
  let mockCanDeleteTask: jest.MockedFunction<typeof canDeleteTask>;
  let mockPrepareTaskDeletion: jest.MockedFunction<typeof prepareTaskDeletion>;
  let mockValidateTaskHierarchy: jest.MockedFunction<typeof validateTaskHierarchy>;
  let mockGetNextChildOrder: jest.MockedFunction<typeof getNextChildOrder>;

  const mockTask: Task = {
    id: 'task_1',
    name: 'Test Task',
    description: 'A test task',
    hourlyRate: 50,
    parentId: null,
    childOrder: undefined,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockChildTask: Task = {
    id: 'task_2',
    name: 'Child Task',
    description: 'A child task',
    hourlyRate: 30,
    parentId: 'task_1',
    childOrder: 0,
    createdAt: '2024-01-01T01:00:00.000Z',
    updatedAt: '2024-01-01T01:00:00.000Z',
  };

  const mockTimeEntry: TimeEntry = {
    id: 'entry_1',
    taskId: 'task_1',
    taskName: 'Test Task',
    startTime: new Date('2024-01-01T10:00:00.000Z'),
    endTime: new Date('2024-01-01T11:00:00.000Z'),
    duration: 3600000,
  };

  beforeEach(() => {
    // Setup storage service mock
    mockStorageService = {
      getTasks: jest.fn(),
      setTasks: jest.fn(),
      getTimeEntries: jest.fn(),
      setTimeEntries: jest.fn(),
    } as any;

    taskService = new TaskService(mockStorageService);

    // Setup utility function mocks
    mockValidateTaskName = validateTaskName as jest.MockedFunction<typeof validateTaskName>;
    mockBuildTaskHierarchy = buildTaskHierarchy as jest.MockedFunction<typeof buildTaskHierarchy>;
    mockGetChildTasks = getChildTasks as jest.MockedFunction<typeof getChildTasks>;
    mockGetParentTask = getParentTask as jest.MockedFunction<typeof getParentTask>;
    mockGetTaskPath = getTaskPath as jest.MockedFunction<typeof getTaskPath>;
    mockCanDeleteTask = canDeleteTask as jest.MockedFunction<typeof canDeleteTask>;
    mockPrepareTaskDeletion = prepareTaskDeletion as jest.MockedFunction<typeof prepareTaskDeletion>;
    mockValidateTaskHierarchy = validateTaskHierarchy as jest.MockedFunction<typeof validateTaskHierarchy>;
    mockGetNextChildOrder = getNextChildOrder as jest.MockedFunction<typeof getNextChildOrder>;

    // Setup default mock implementations
    mockValidateTaskName.mockReturnValue({ success: true });
    mockStorageService.getTasks.mockResolvedValue([]);
    mockStorageService.setTasks.mockResolvedValue();
    mockStorageService.getTimeEntries.mockResolvedValue([]);
    mockStorageService.setTimeEntries.mockResolvedValue();

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    const taskData = {
      name: 'New Task',
      description: 'A new task',
      hourlyRate: 75,
      parentId: null,
    };

    it('should create a new task successfully', async () => {
      mockStorageService.getTasks.mockResolvedValue([]);

      const result = await taskService.createTask(taskData);

      expect(result).toMatchObject({
        name: taskData.name,
        description: taskData.description,
        hourlyRate: taskData.hourlyRate,
        parentId: taskData.parentId,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      expect(mockValidateTaskName).toHaveBeenCalledWith(taskData.name);
      expect(mockStorageService.setTasks).toHaveBeenCalled();
    });

    it('should throw error for invalid task data', async () => {
      mockValidateTaskName.mockReturnValue({
        success: false,
        error: 'Task name is too short'
      });

      await expect(taskService.createTask(taskData)).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_CREATE_FAILED' })
      );
    });

    it('should throw error for duplicate task name', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      const duplicateTaskData = { ...taskData, name: 'Test Task' };

      await expect(taskService.createTask(duplicateTaskData)).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_DUPLICATE_NAME' })
      );
    });

    it('should set child order for child tasks', async () => {
      const childTaskData = { ...taskData, parentId: 'parent_1' };
      mockGetNextChildOrder.mockReturnValue(2);
      mockStorageService.getTasks.mockResolvedValue([]);

      const result = await taskService.createTask(childTaskData);

      expect(result.childOrder).toBe(2);
      expect(mockGetNextChildOrder).toHaveBeenCalledWith([], 'parent_1');
    });

    it('should handle storage errors', async () => {
      mockStorageService.setTasks.mockRejectedValue(new Error('Storage error'));

      await expect(taskService.createTask(taskData)).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_CREATE_FAILED' })
      );
    });
  });

  describe('updateTask', () => {
    const updates = {
      name: 'Updated Task',
      hourlyRate: 100,
    };

    it('should update task successfully', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      const result = await taskService.updateTask('task_1', updates);

      expect(result).toMatchObject({
        ...mockTask,
        ...updates,
        id: 'task_1', // ID should not change
      })
      expect(result.updatedAt).not.toBe(mockTask.updatedAt);

      expect(mockStorageService.setTasks).toHaveBeenCalled();
    });

    it('should throw error if task not found', async () => {
      mockStorageService.getTasks.mockResolvedValue([]);

      await expect(taskService.updateTask('nonexistent', updates)).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
      );
    });

    it('should validate updated task data', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);
      mockValidateTaskName.mockReturnValue({
        success: false,
        error: 'Invalid task name'
      });

      await expect(taskService.updateTask('task_1', { name: 'Invalid' })).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_UPDATE_FAILED' })
      );
    });

    it('should check name uniqueness when name is updated', async () => {
      const existingTask = { ...mockTask, name: 'Existing Task' };
      mockStorageService.getTasks.mockResolvedValue([mockTask, existingTask]);

      await expect(taskService.updateTask('task_1', { name: 'Existing Task' })).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_DUPLICATE_NAME' })
      );
    });

    it('should allow same name for same task', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      const result = await taskService.updateTask('task_1', { name: 'Test Task' });

      // It should not throw and should return the updated task
      expect(result).toBeDefined();
      expect(result.name).toEqual('Test Task');
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);
      mockStorageService.setTasks.mockRejectedValue(new Error('Storage error'));

      await expect(taskService.updateTask('task_1', updates)).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_UPDATE_FAILED' })
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete task with prevent strategy (default)', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry]);
      mockCanDeleteTask.mockReturnValue({ canDelete: true });
      mockPrepareTaskDeletion.mockReturnValue({
        tasksToDelete: ['task_1'],
        tasksToUpdate: [],
      });

      await taskService.deleteTask('task_1');

      expect(mockCanDeleteTask).toHaveBeenCalledWith([mockTask], 'task_1', 'prevent');
      expect(mockPrepareTaskDeletion).toHaveBeenCalledWith([mockTask], 'task_1', 'prevent');
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([]);
      expect(mockStorageService.setTimeEntries).toHaveBeenCalledWith([]);
    });

    it('should delete task with cascade strategy', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask, mockChildTask]);
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry]);
      mockCanDeleteTask.mockReturnValue({ canDelete: true });
      mockPrepareTaskDeletion.mockReturnValue({
        tasksToDelete: ['task_1', 'task_2'],
        tasksToUpdate: [],
      });

      await taskService.deleteTask('task_1', 'cascade');

      expect(mockCanDeleteTask).toHaveBeenCalledWith([mockTask, mockChildTask], 'task_1', 'cascade');
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([]);
    });

    it('should delete task with orphan strategy', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask, mockChildTask]);
      mockCanDeleteTask.mockReturnValue({ canDelete: true });
      mockPrepareTaskDeletion.mockReturnValue({
        tasksToDelete: ['task_1'],
        tasksToUpdate: [{ id: 'task_2', updates: { parentId: null } }],
      });

      await taskService.deleteTask('task_1', 'orphan');

      expect(mockCanDeleteTask).toHaveBeenCalledWith([mockTask, mockChildTask], 'task_1', 'orphan');
      expect(mockPrepareTaskDeletion).toHaveBeenCalledWith([mockTask, mockChildTask], 'task_1', 'orphan');
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([{ ...mockChildTask, parentId: null, childOrder: undefined }]);
    });

    it('should throw error if task not found', async () => {
      mockStorageService.getTasks.mockResolvedValue([]);

      await expect(taskService.deleteTask('nonexistent'))
        .rejects.toThrow(TaskErrorClass);
    });

    it('should throw error if deletion is prevented', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask, mockChildTask]);
      mockCanDeleteTask.mockReturnValue({
        canDelete: false,
        reason: 'Task has children',
        affectedTasks: ['task_2'],
      });

      await expect(taskService.deleteTask('task_1')).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_DELETE_PREVENTED' })
      );
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);
      mockStorageService.setTasks.mockRejectedValue(new Error('Storage error'));
      mockCanDeleteTask.mockReturnValue({ canDelete: true });
      mockPrepareTaskDeletion.mockReturnValue({
        tasksToDelete: ['task_1'],
        tasksToUpdate: [],
      });

      await expect(taskService.deleteTask('task_1')).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_DELETE_FAILED' })
      );
    });
  });

  describe('getTask', () => {
    it('should return task from cache if available and valid', async () => {
      // First call to populate cache
      mockStorageService.getTasks.mockResolvedValue([mockTask]);
      await taskService.getAllTasks();

      // Clear mock calls
      mockStorageService.getTasks.mockClear();

      const result = await taskService.getTask('task_1');

      expect(result).toEqual(mockTask);
      expect(mockStorageService.getTasks).not.toHaveBeenCalled();
    });

    it('should load from storage if not in cache', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      const result = await taskService.getTask('task_1');

      expect(result).toEqual(mockTask);
      expect(mockStorageService.getTasks).toHaveBeenCalled();
    });

    it('should return null if task not found', async () => {
      mockStorageService.getTasks.mockResolvedValue([]);

      const result = await taskService.getTask('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

      await expect(taskService.getTask('task_1')).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
      );
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks from storage', async () => {
      const tasks = [mockTask, mockChildTask];
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.getAllTasks();

      expect(result).toEqual(tasks);
      expect(mockStorageService.getTasks).toHaveBeenCalled();
    });

    it('should update cache with all tasks', async () => {
      const tasks = [mockTask, mockChildTask];
      mockStorageService.getTasks.mockResolvedValue(tasks);

      await taskService.getAllTasks();

      // Verify cache is updated by checking subsequent getTask calls
      mockStorageService.getTasks.mockClear();
      const cachedTask = await taskService.getTask('task_1');
      expect(cachedTask).toEqual(mockTask);
      expect(mockStorageService.getTasks).not.toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

      await expect(taskService.getAllTasks()).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
      );
    });
  });

  describe('searchTasks', () => {
    it('should search tasks by name', async () => {
      const tasks = [mockTask, mockChildTask];
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.searchTasks('Test');

      expect(result).toEqual([mockTask]);
    });

    it('should search tasks by description', async () => {
      const tasks = [mockTask, mockChildTask];
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.searchTasks('child');

      expect(result).toEqual([mockChildTask]);
    });

    it('should return empty array for no matches', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      const result = await taskService.searchTasks('nonexistent');

      expect(result).toEqual([]);
    });

    it('should be case insensitive', async () => {
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      const result = await taskService.searchTasks('test task');

      expect(result).toEqual([mockTask]);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

      await expect(taskService.searchTasks('test')).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
      );
    });
  });

  describe('getTasksByHourlyRate', () => {
    it('should filter tasks by minimum hourly rate', async () => {
      const tasks = [mockTask, mockChildTask]; // 50 and 30
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.getTasksByHourlyRate(40);

      expect(result).toEqual([mockTask]);
    });

    it('should filter tasks by maximum hourly rate', async () => {
      const tasks = [mockTask, mockChildTask]; // 50 and 30
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.getTasksByHourlyRate(undefined, 40);

      expect(result).toEqual([mockChildTask]);
    });

    it('should filter tasks by rate range', async () => {
      const tasks = [mockTask, mockChildTask]; // 50 and 30
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.getTasksByHourlyRate(25, 35);

      expect(result).toEqual([mockChildTask]);
    });

    it('should return all tasks if no filters provided', async () => {
      const tasks = [mockTask, mockChildTask];
      mockStorageService.getTasks.mockResolvedValue(tasks);

      const result = await taskService.getTasksByHourlyRate();

      expect(result).toEqual(tasks);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

      await expect(taskService.getTasksByHourlyRate(50)).rejects.toThrow(
        expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
      );
    });
  });

  describe('hierarchical operations', () => {
    describe('getTaskHierarchy', () => {
      it('should return task hierarchy', async () => {
        const tasks = [mockTask, mockChildTask];
        const hierarchy: TaskHierarchy[] = [
          { task: mockTask, children: [{ task: mockChildTask, children: [] }] },
        ];

        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockBuildTaskHierarchy.mockReturnValue(hierarchy);

        const result = await taskService.getTaskHierarchy();

        expect(result).toEqual(hierarchy);
        expect(mockBuildTaskHierarchy).toHaveBeenCalledWith(tasks);
      });

      it('should handle storage errors', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        await expect(taskService.getTaskHierarchy()).rejects.toThrow(
          expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
        );
      });
    });

    describe('getChildTasks', () => {
      it('should return child tasks', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockGetChildTasks.mockReturnValue([mockChildTask]);

        const result = await taskService.getChildTasks('task_1');

        expect(result).toEqual([mockChildTask]);
        expect(mockGetChildTasks).toHaveBeenCalledWith(tasks, 'task_1');
      });

      it('should handle storage errors', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        await expect(taskService.getChildTasks('task_1')).rejects.toThrow(
          expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
        );
      });
    });

    describe('getParentTask', () => {
      it('should return parent task', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockGetParentTask.mockReturnValue(mockTask);

        const result = await taskService.getParentTask('task_2');

        expect(result).toEqual(mockTask);
        expect(mockGetParentTask).toHaveBeenCalledWith(tasks, 'task_2');
      });

      it('should return undefined for root tasks', async () => {
        const tasks = [mockTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockGetParentTask.mockReturnValue(undefined);

        const result = await taskService.getParentTask('task_1');

        expect(result).toBeUndefined();
      });

      it('should handle storage errors gracefully', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        const result = await taskService.getParentTask('task_2');

        expect(result).toBeUndefined();
      });
    });

    describe('getTaskPath', () => {
      it('should return task path from root', async () => {
        const tasks = [mockTask, mockChildTask];
        const path = [mockTask, mockChildTask];

        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockGetTaskPath.mockReturnValue(path);

        const result = await taskService.getTaskPath('task_2');

        expect(result).toEqual(path);
        expect(mockGetTaskPath).toHaveBeenCalledWith(tasks, 'task_2');
      });

      it('should handle storage errors', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        await expect(taskService.getTaskPath('task_2')).rejects.toThrow(
          expect.objectContaining({ name: 'TaskError', code: 'TASK_NOT_FOUND' })
        );
      });
    });

    describe('moveTask', () => {
      it('should move task to new parent', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockValidateTaskHierarchy.mockReturnValue(true);
        mockGetNextChildOrder.mockReturnValue(1);

        const result = await taskService.moveTask('task_2', 'new_parent');

        expect(mockValidateTaskHierarchy).toHaveBeenCalledWith(tasks, 'task_2', 'new_parent');
        expect(mockGetNextChildOrder).toHaveBeenCalledWith(tasks, 'new_parent');
        expect(result.parentId).toBe('new_parent');
        expect(result.childOrder).toBe(1);
      });

      it('should move task to root level', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockValidateTaskHierarchy.mockReturnValue(true);

        const result = await taskService.moveTask('task_2', null);

        expect(result.parentId).toBeNull();
        expect(result.childOrder).toBeUndefined();
      });

      it('should throw error for invalid hierarchy', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockValidateTaskHierarchy.mockReturnValue(false);

        await expect(taskService.moveTask('task_1', 'task_2')).rejects.toThrow(
          expect.objectContaining({ name: 'TaskError', code: 'TASK_VALIDATION_FAILED' })
        );
      });

      it('should handle storage errors', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        await expect(taskService.moveTask('task_2', 'new_parent')).rejects.toThrow(
          expect.objectContaining({ name: 'TaskError', code: 'TASK_UPDATE_FAILED' })
        );
      });
    });

    describe('validateTaskHierarchy', () => {
      it('should validate valid hierarchy', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockValidateTaskHierarchy.mockReturnValue(true);

        const result = await taskService.validateTaskHierarchy('task_2', 'task_1');

        expect(result).toBe(true);
        expect(mockValidateTaskHierarchy).toHaveBeenCalledWith(tasks, 'task_2', 'task_1');
      });

      it('should validate invalid hierarchy', async () => {
        const tasks = [mockTask, mockChildTask];
        mockStorageService.getTasks.mockResolvedValue(tasks);
        mockValidateTaskHierarchy.mockReturnValue(false);

        const result = await taskService.validateTaskHierarchy('task_1', 'task_2');

        expect(result).toBe(false);
      });

      it('should handle storage errors gracefully', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        const result = await taskService.validateTaskHierarchy('task_1', 'task_2');

        expect(result).toBe(false);
      });
    });
  });

  describe('validation', () => {
    describe('validateTask', () => {
      it('should validate valid task', async () => {
        const validTask = {
          name: 'Valid Task',
          hourlyRate: 50,
        };

        const result = await taskService.validateTask(validTask);

        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(mockValidateTaskName).toHaveBeenCalledWith('Valid Task');
      });

      it('should validate task with missing name', async () => {
        const invalidTask = {
          hourlyRate: 50,
        };

        const result = await taskService.validateTask(invalidTask);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Task name is required');
      });

      it('should validate task with invalid name', async () => {
        mockValidateTaskName.mockReturnValue({
          success: false,
          error: 'Task name is too short'
        });

        const invalidTask = {
          name: 'x',
          hourlyRate: 50,
        };

        const result = await taskService.validateTask(invalidTask);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Task name is too short');
      });

      it('should validate task with invalid hourly rate', async () => {
        const invalidTask = {
          name: 'Valid Task',
          hourlyRate: -10,
        };

        const result = await taskService.validateTask(invalidTask);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Hourly rate must be a positive number');
      });

      it('should validate task with excessive hourly rate', async () => {
        const invalidTask = {
          name: 'Valid Task',
          hourlyRate: 1500,
        };

        const result = await taskService.validateTask(invalidTask);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Hourly rate cannot exceed $1000');
      });
    });

    describe('isTaskNameUnique', () => {
      it('should return true for unique name', async () => {
        mockStorageService.getTasks.mockResolvedValue([mockTask]);

        const result = await taskService.isTaskNameUnique('Unique Task');

        expect(result).toBe(true);
      });

      it('should return false for duplicate name', async () => {
        mockStorageService.getTasks.mockResolvedValue([mockTask]);

        const result = await taskService.isTaskNameUnique('Test Task');

        expect(result).toBe(false);
      });

      it('should exclude specified task ID', async () => {
        mockStorageService.getTasks.mockResolvedValue([mockTask]);

        const result = await taskService.isTaskNameUnique('Test Task', 'task_1');

        expect(result).toBe(true);
      });

      it('should be case insensitive', async () => {
        mockStorageService.getTasks.mockResolvedValue([mockTask]);

        const result = await taskService.isTaskNameUnique('test task');

        expect(result).toBe(false);
      });

      it('should handle storage errors gracefully', async () => {
        mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));

        const result = await taskService.isTaskNameUnique('Test Task');

        expect(result).toBe(false);
      });
    });
  });

  describe('syncWithTauriBackend', () => {
    it('should sync tasks with Tauri backend', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      const tasks = [mockTask, mockChildTask];
      mockStorageService.getTasks.mockResolvedValue(tasks);

      await taskService.syncWithTauriBackend();

      expect(invoke).toHaveBeenCalledWith('update_tasks', { tasks });
    });

    it('should handle Tauri backend errors gracefully', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      invoke.mockRejectedValue(new Error('Tauri error'));
      mockStorageService.getTasks.mockResolvedValue([mockTask]);

      // Should not throw error
      await expect(taskService.syncWithTauriBackend()).resolves.toBeUndefined();
    });
  });
});
