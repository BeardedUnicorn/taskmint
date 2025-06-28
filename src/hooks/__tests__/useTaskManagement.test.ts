/**
 * Tests for useTaskManagement hook
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTaskManagement } from '../useTaskManagement';
import { Task, TaskHierarchy } from '../../types';

// Mock ServiceFactory
const mockTaskService = {
  getAllTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  getTaskByName: vi.fn(),
  getTaskHierarchy: vi.fn(),
  getChildTasks: vi.fn(),
  getParentTask: vi.fn(),
  getTaskPath: vi.fn(),
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
      color: '#FF5722',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Design',
      hourlyRate: 75,
      color: '#2196F3',
      isActive: true,
      parentId: 'task-1',
      childOrder: 1,
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
    {
      id: 'task-3',
      name: 'Testing',
      hourlyRate: 60,
      color: '#4CAF50',
      isActive: false,
      parentId: 'task-1',
      childOrder: 2,
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    },
  ];

  const sampleHierarchy: TaskHierarchy[] = [
    {
      task: sampleTasks[0],
      children: [
        {
          task: sampleTasks[1],
          children: [],
          depth: 1,
          path: ['Development'],
        },
        {
          task: sampleTasks[2],
          children: [],
          depth: 1,
          path: ['Development'],
        },
      ],
      depth: 0,
      path: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskService.getAllTasks.mockResolvedValue(sampleTasks);
    mockTaskService.getTaskHierarchy.mockResolvedValue(sampleHierarchy);
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
    it('should initialize with empty tasks and loading state', () => {
      const { result } = renderHook(() => useTaskManagement());

      expect(result.current.tasks).toEqual([]);
      expect(result.current.isLoading).toBe(true);
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

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockShowError).toHaveBeenCalledWith('Failed to load tasks. Please refresh the page and try again.');
    });
  });

  describe('addTask', () => {
    it('should add a new task successfully', async () => {
      const newTaskData = {
        name: 'New Task',
        hourlyRate: 80,
        color: '#9C27B0',
        isActive: true,
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
        result.current.addTask({ name: 'Test Task', hourlyRate: 50, color: '#000000', isActive: true })
      ).rejects.toThrow('Failed to create task');

      expect(mockShowError).toHaveBeenCalledWith('Failed to create task. Please try again.');
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

      expect(mockShowError).toHaveBeenCalledWith('Failed to update task. Please try again.');
    });
  });

  describe('deleteTask', () => {
    it('should delete task with default strategy', async () => {
      mockTaskService.getAllTasks.mockResolvedValueOnce(sampleTasks);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockTaskService.deleteTask.mockResolvedValue(undefined);
      mockTaskService.getAllTasks.mockResolvedValue(sampleTasks.slice(1));

      await act(async () => {
        await result.current.deleteTask('task-1');
      });

      expect(mockTaskService.deleteTask).toHaveBeenCalledWith('task-1', 'prevent');
      expect(mockShowSuccess).toHaveBeenCalledWith('Task "Development" deleted successfully!');
    });

    it('should delete task with cascade strategy', async () => {
      mockTaskService.getAllTasks.mockResolvedValueOnce(sampleTasks);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockTaskService.deleteTask.mockResolvedValue(undefined);
      mockTaskService.getAllTasks.mockResolvedValue([]);

      await act(async () => {
        await result.current.deleteTask('task-1', 'cascade');
      });

      expect(mockTaskService.deleteTask).toHaveBeenCalledWith('task-1', 'cascade');
    });

    it('should delete task with orphan strategy', async () => {
      mockTaskService.getAllTasks.mockResolvedValueOnce(sampleTasks);
      const orphanedTasks = sampleTasks.slice(1).map(task => ({ ...task, parentId: undefined }));

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockTaskService.deleteTask.mockResolvedValue(undefined);
      mockTaskService.getAllTasks.mockResolvedValue(orphanedTasks);

      await act(async () => {
        await result.current.deleteTask('task-1', 'orphan');
      });

      expect(mockTaskService.deleteTask).toHaveBeenCalledWith('task-1', 'orphan');
    });

    it('should handle delete task error', async () => {
      const error = new Error('Failed to delete task');
      mockTaskService.deleteTask.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(result.current.deleteTask('task-1')).rejects.toThrow('Failed to delete task');
    });
  });

  describe('task lookup methods', () => {
    it('should get task by id', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const task = result.current.getTaskById('task-1');
      expect(task).toEqual(sampleTasks[0]);
    });

    it('should return undefined for non-existent task id', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const task = result.current.getTaskById('non-existent');
      expect(task).toBeUndefined();
    });

    it('should get task by name', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const task = result.current.getTaskByName('Development');
      expect(task).toEqual(sampleTasks[0]);
    });

    it('should return undefined for non-existent task name', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const task = result.current.getTaskByName('Non-existent');
      expect(task).toBeUndefined();
    });

    it('should get all task names', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const names = result.current.getTaskNames();
      expect(names).toEqual(['Design', 'Development', 'Testing']);
    });
  });

  describe('earnings calculation', () => {
    it('should calculate earnings with provided hourly rate', () => {
      const { result } = renderHook(() => useTaskManagement());

      const earnings = result.current.calculateEarnings(3600000, 50); // 1 hour at $50/hour
      expect(earnings).toBe(50);
    });

    it('should calculate earnings for partial hours', () => {
      const { result } = renderHook(() => useTaskManagement());

      const earnings = result.current.calculateEarnings(1800000, 60); // 30 minutes at $60/hour
      expect(earnings).toBe(30);
    });

    it('should return undefined for invalid inputs', () => {
      const { result } = renderHook(() => useTaskManagement());

      expect(result.current.calculateEarnings(-1000, 50)).toBeUndefined();
      expect(result.current.calculateEarnings(3600000, -50)).toBeUndefined();
    });
  });

  describe('hierarchical methods', () => {
    it('should get task hierarchy', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let hierarchy: TaskHierarchy[] = [];
      await act(async () => {
        hierarchy = await result.current.getTaskHierarchy();
      });

      expect(mockTaskService.getTaskHierarchy).toHaveBeenCalled();
      expect(hierarchy).toEqual(sampleHierarchy);
    });

    it('should get child tasks', async () => {
      const childTasks = [sampleTasks[1], sampleTasks[2]];
      mockTaskService.getChildTasks.mockResolvedValue(childTasks);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let children: Task[] = [];
      await act(async () => {
        children = await result.current.getChildTasks('task-1');
      });

      expect(mockTaskService.getChildTasks).toHaveBeenCalledWith('task-1');
      expect(children).toEqual(childTasks);
    });

    it('should get parent task', async () => {
      mockTaskService.getParentTask.mockResolvedValue(sampleTasks[0]);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let parent: Task | undefined;
      await act(async () => {
        parent = await result.current.getParentTask('task-2');
      });

      expect(mockTaskService.getParentTask).toHaveBeenCalledWith('task-2');
      expect(parent).toEqual(sampleTasks[0]);
    });

    it('should get task path', async () => {
      const taskPath = [sampleTasks[0], sampleTasks[1]];
      mockTaskService.getTaskPath.mockResolvedValue(taskPath);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let path: Task[] = [];
      await act(async () => {
        path = await result.current.getTaskPath('task-2');
      });

      expect(mockTaskService.getTaskPath).toHaveBeenCalledWith('task-2');
      expect(path).toEqual(taskPath);
    });

    it('should handle hierarchical method errors', async () => {
      const error = new Error('Hierarchy error');
      mockTaskService.getTaskHierarchy.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(result.current.getTaskHierarchy()).rejects.toThrow('Hierarchy error');

      expect(mockShowError).toHaveBeenCalledWith('Failed to load task hierarchy. Please try again.');
    });
  });

  describe('return values', () => {
    it('should return all expected properties and methods', async () => {
      const { result } = renderHook(() => useTaskManagement());
      await waitFor(() => expect(result.current).not.toBeNull());

      // State properties
      expect(result.current).toHaveProperty('tasks');
      expect(result.current).toHaveProperty('isLoading');

      // CRUD methods
      expect(result.current).toHaveProperty('addTask');
      expect(result.current).toHaveProperty('updateTask');
      expect(result.current).toHaveProperty('deleteTask');

      // Lookup methods
      expect(result.current).toHaveProperty('getTaskById');
      expect(result.current).toHaveProperty('getTaskByName');
      expect(result.current).toHaveProperty('getTaskNames');

      // Utility methods
      expect(result.current).toHaveProperty('calculateEarnings');

      // Hierarchical methods
      expect(result.current).toHaveProperty('getTaskHierarchy');
      expect(result.current).toHaveProperty('getChildTasks');
      expect(result.current).toHaveProperty('getParentTask');
      expect(result.current).toHaveProperty('getTaskPath');

      // Verify all methods are functions
      expect(typeof result.current.addTask).toBe('function');
      expect(typeof result.current.updateTask).toBe('function');
      expect(typeof result.current.deleteTask).toBe('function');
      expect(typeof result.current.getTaskById).toBe('function');
      expect(typeof result.current.getTaskByName).toBe('function');
      expect(typeof result.current.getTaskNames).toBe('function');
      expect(typeof result.current.calculateEarnings).toBe('function');
      expect(typeof result.current.getTaskHierarchy).toBe('function');
      expect(typeof result.current.getChildTasks).toBe('function');
      expect(typeof result.current.getParentTask).toBe('function');
      expect(typeof result.current.getTaskPath).toBe('function');
    });
  });
});
