/**
 * Tests for useTaskManagement hook
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTaskManagement } from '../useTaskManagement';
import { Task } from '../../types/task';

// Mock ServiceFactory
const mockTaskService = {
  getAllTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
  getTask: vi.fn(),
  getTaskByName: vi.fn(),
};

vi.mock('../../services', () => ({
  ServiceFactory: {
    getTaskService: () => mockTaskService,
  },
}));

// Mock useAsyncError
const mockExecuteAsync = vi.fn();
vi.mock('../useAsyncError', () => ({
  useAsyncError: () => ({
    executeAsync: mockExecuteAsync,
  }),
}));

// Mock useNotification
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  }),
}));

describe('useTaskManagement', () => {
  const sampleTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Development',
      hourlyRate: 50,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Design',
      hourlyRate: 75,
      parentId: 'task-1',
      childOrder: 1,
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
    {
      id: 'task-3',
      name: 'Testing',
      hourlyRate: 60,
      parentId: 'task-1',
      childOrder: 2,
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskService.getAllTasks.mockResolvedValue(sampleTasks);
    mockExecuteAsync.mockImplementation(async (fn, options) => {
      try {
        return await fn();
      } catch (error) {
        if (options?.errorHandler) {
          options.errorHandler(error);
        }
        throw error;
      }
    });
  });

  describe('initialization', () => {
    it('should initialize with empty tasks and loading state', async () => {
      const { result } = renderHook(() => useTaskManagement());

      expect(result.current.tasks).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      
      // Wait for the hook to finish loading
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('should load tasks on mount', async () => {
      const { result } = renderHook(() => useTaskManagement());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockTaskService.getAllTasks).toHaveBeenCalled();
      expect(result.current.tasks).toEqual(sampleTasks);
    });

    it('should handle loading error', async () => {
      const error = new Error('Failed to load tasks');
      mockTaskService.getAllTasks.mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockShowError).toHaveBeenCalledWith('Failed to load tasks. Please refresh the page and try again.');
      
      consoleSpy.mockRestore();
    });
  });

  describe('addTask', () => {
    it('should add a new task successfully', async () => {
      const newTaskData = {
        name: 'New Task',
        hourlyRate: 80,
      };

      const createdTask = {
        ...newTaskData,
        id: 'task-4',
        createdAt: '2024-01-04T00:00:00.000Z',
        updatedAt: '2024-01-04T00:00:00.000Z',
      };

      mockTaskService.createTask.mockResolvedValue(createdTask);
      mockTaskService.getAllTasks.mockResolvedValue([...sampleTasks, createdTask]);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnedTask: Task | null = null;
      await act(async () => {
        returnedTask = await result.current.addTask(newTaskData)
      });

      expect(mockTaskService.createTask).toHaveBeenCalledWith(newTaskData);
      expect(returnedTask).toEqual(createdTask);
      expect(result.current.tasks).toContain(createdTask);
      expect(mockShowSuccess).toHaveBeenCalledWith('Task "New Task" created successfully!');
    });

    it('should handle add task error', async () => {
      const error = new Error('Failed to create task');
      mockTaskService.createTask.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(
        result.current.addTask({ name: 'Test Task', hourlyRate: 50 })
      ).rejects.toThrow('Failed to create task');

      expect(mockShowError).toHaveBeenCalledWith('Failed to create task');
    });

    it('shows why a create failed (e.g. a duplicate name)', async () => {
      mockTaskService.createTask.mockRejectedValue(
        new Error('A task with the name "Development" already exists')
      );

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(result.current.addTask({ name: 'Development', hourlyRate: 50 })).rejects.toThrow();
      expect(mockShowError).toHaveBeenCalledWith('A task with the name "Development" already exists');
    });
  });

  describe('updateTask', () => {
    it('should update task successfully', async () => {
      const updates = { name: 'Updated Task', hourlyRate: 90 };
      const updatedTask = { ...sampleTasks[0], ...updates, updatedAt: '2024-01-04T00:00:00.000Z' };

      mockTaskService.updateTask.mockResolvedValue(updatedTask);
      mockTaskService.getAllTasks.mockResolvedValue([updatedTask, ...sampleTasks.slice(1)]);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnedTask: Task | null = null;
      await act(async () => {
        returnedTask = await result.current.updateTask('task-1', updates);
      });

      expect(mockTaskService.updateTask).toHaveBeenCalledWith('task-1', updates);
      expect(returnedTask).toEqual(updatedTask);
      expect(mockShowSuccess).toHaveBeenCalledWith('Task "Updated Task" updated successfully!');
    });

    it('should handle update task error', async () => {
      const error = new Error('Failed to update task');
      mockTaskService.updateTask.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(result.current.updateTask('task-1', { name: 'Updated' })).rejects.toThrow('Failed to update task');

      expect(mockShowError).toHaveBeenCalledWith('Failed to update task');
    });
  });

  describe('toggleFavorite', () => {
    it('stars the task without a toast and updates the list', async () => {
      const starred = { ...sampleTasks[0], isFavorite: true };
      mockTaskService.getAllTasks.mockResolvedValue(sampleTasks);
      mockTaskService.updateTask.mockResolvedValue(starred);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.toggleFavorite('task-1');
      });

      expect(mockTaskService.updateTask).toHaveBeenCalledWith('task-1', { isFavorite: true });
      expect(result.current.tasks.find(t => t.id === 'task-1')?.isFavorite).toBe(true);
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });

    it('unstars a starred task', async () => {
      const starred = { ...sampleTasks[0], isFavorite: true };
      mockTaskService.getAllTasks.mockResolvedValue([starred, ...sampleTasks.slice(1)]);
      mockTaskService.updateTask.mockResolvedValue({ ...starred, isFavorite: false });

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.toggleFavorite('task-1');
      });

      expect(mockTaskService.updateTask).toHaveBeenCalledWith('task-1', { isFavorite: false });
    });
  });

  describe('archiving', () => {
    it('should partition tasks into activeTasks and archivedTasks', async () => {
      const archivedTask = {
        ...sampleTasks[2],
        isArchived: true,
        archivedAt: '2024-02-01T00:00:00.000Z',
      };
      mockTaskService.getAllTasks.mockResolvedValue([...sampleTasks.slice(0, 2), archivedTask]);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.tasks).toHaveLength(3);
      expect(result.current.activeTasks.map(t => t.id)).toEqual(['task-1', 'task-2']);
      expect(result.current.archivedTasks.map(t => t.id)).toEqual(['task-3']);
    });

    it('should archive a task in place and show a success toast', async () => {
      const archivedTask = {
        ...sampleTasks[0],
        isArchived: true,
        archivedAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-01T00:00:00.000Z',
      };
      mockTaskService.archiveTask.mockResolvedValue(archivedTask);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.archiveTask('task-1');
      });

      expect(mockTaskService.archiveTask).toHaveBeenCalledWith('task-1');
      // In-place update: no reload from the service beyond the mount load
      expect(mockTaskService.getAllTasks).toHaveBeenCalledTimes(1);
      expect(result.current.tasks.find(t => t.id === 'task-1')?.isArchived).toBe(true);
      expect(result.current.activeTasks.map(t => t.id)).toEqual(['task-2', 'task-3']);
      expect(result.current.archivedTasks.map(t => t.id)).toEqual(['task-1']);
      expect(mockShowSuccess).toHaveBeenCalledWith('Task "Development" archived successfully!');
    });

    it('should unarchive a task, restoring activeTasks membership', async () => {
      const archived = {
        ...sampleTasks[0],
        isArchived: true,
        archivedAt: '2024-02-01T00:00:00.000Z',
      };
      mockTaskService.getAllTasks.mockResolvedValue([archived, ...sampleTasks.slice(1)]);
      const unarchivedTask = {
        ...sampleTasks[0],
        isArchived: false,
        archivedAt: null,
        updatedAt: '2024-03-01T00:00:00.000Z',
      };
      mockTaskService.unarchiveTask.mockResolvedValue(unarchivedTask);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.archivedTasks.map(t => t.id)).toEqual(['task-1']);

      await act(async () => {
        await result.current.unarchiveTask('task-1');
      });

      expect(mockTaskService.unarchiveTask).toHaveBeenCalledWith('task-1');
      expect(result.current.activeTasks.map(t => t.id)).toEqual(['task-1', 'task-2', 'task-3']);
      expect(result.current.archivedTasks).toHaveLength(0);
      expect(mockShowSuccess).toHaveBeenCalledWith('Task "Development" unarchived successfully!');
    });

    it('should handle archive task error', async () => {
      const error = new Error('Failed to archive task');
      mockTaskService.archiveTask.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(result.current.archiveTask('task-1')).rejects.toThrow('Failed to archive task');
      expect(mockShowError).toHaveBeenCalledWith('Failed to archive task');
    });
  });

  describe('deleteTask', () => {
    it('should delete a task', async () => {
      mockTaskService.getAllTasks.mockResolvedValueOnce(sampleTasks);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockTaskService.deleteTask.mockResolvedValue(undefined);
      mockTaskService.getAllTasks.mockResolvedValue(sampleTasks.slice(1));

      await act(async () => {
        await result.current.deleteTask('task-1');
      });

      expect(mockTaskService.deleteTask).toHaveBeenCalledWith('task-1');
      expect(result.current.tasks).toEqual(sampleTasks.slice(1));
      expect(mockShowSuccess).toHaveBeenCalledWith('Task "Development" deleted successfully!');
    });

    it('should handle delete task error', async () => {
      const error = new Error('Failed to delete task');
      mockTaskService.deleteTask.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(result.current.deleteTask('task-1')).rejects.toThrow('Failed to delete task');
    });
  });

  describe('return values', () => {
    it('should return all expected properties and methods', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current).not.toBeNull());

      // State properties
      expect(result.current).toHaveProperty('tasks');
      expect(result.current).toHaveProperty('activeTasks');
      expect(result.current).toHaveProperty('archivedTasks');
      expect(result.current).toHaveProperty('isLoading');

      // CRUD methods
      expect(result.current).toHaveProperty('addTask');
      expect(result.current).toHaveProperty('updateTask');
      expect(result.current).toHaveProperty('deleteTask');
      expect(result.current).toHaveProperty('archiveTask');
      expect(result.current).toHaveProperty('unarchiveTask');
      expect(typeof result.current.archiveTask).toBe('function');
      expect(typeof result.current.unarchiveTask).toBe('function');


      // Verify all methods are functions
      expect(typeof result.current.addTask).toBe('function');
      expect(typeof result.current.updateTask).toBe('function');
      expect(typeof result.current.deleteTask).toBe('function');
    });

    it('keeps its actions stable across task edits', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const before = result.current;

      mockTaskService.updateTask.mockResolvedValue({ ...sampleTasks[0], name: 'Renamed' });
      mockTaskService.getAllTasks.mockResolvedValue([{ ...sampleTasks[0], name: 'Renamed' }, ...sampleTasks.slice(1)]);
      await act(async () => {
        await result.current.updateTask('task-1', { name: 'Renamed' });
      });

      expect(result.current.tasks).not.toBe(before.tasks);
      expect(result.current.deleteTask).toBe(before.deleteTask);
      expect(result.current.toggleFavorite).toBe(before.toggleFavorite);
    });
  });
});
