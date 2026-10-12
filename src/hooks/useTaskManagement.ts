import { useCallback, useMemo, useState, useEffect } from 'react';
import { Task, UseTaskManagementReturn, TaskDeletionStrategy, TaskHierarchy } from '../types/task';
import { ServiceFactory } from '../services';
import { useAsyncError } from './useAsyncError';
import { useNotification } from '../contexts/NotificationContext';

export function useTaskManagement(): UseTaskManagementReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const taskService = ServiceFactory.getTaskService();
  const { executeAsync } = useAsyncError();
  const { showError, showSuccess } = useNotification();

  // Load tasks on mount
  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const loadedTasks = await taskService.getAllTasks();
        setTasks(loadedTasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
        showError('Failed to load tasks. Please refresh the page and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [taskService, showError]);

  const addTask = useCallback(async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    return executeAsync(
      async () => {
        const newTask = await taskService.createTask(taskData);
        setTasks(prev => [...prev, newTask]);
        showSuccess(`Task "${newTask.name}" created successfully!`);
        return newTask;
      },
      {
        operation: 'addTask',
        errorHandler: () => showError('Failed to create task. Please try again.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

  // Memoized task lookup maps for performance (must be defined before functions that use them)
  const taskByIdMap = useMemo(() => {
    return tasks.reduce((map, task) => {
      map.set(task.id, task);
      return map;
    }, new Map<string, Task>());
  }, [tasks]);

  const taskByNameMap = useMemo(() => {
    return tasks.reduce((map, task) => {
      map.set(task.name, task);
      return map;
    }, new Map<string, Task>());
  }, [tasks]);

  // Memoized task names for performance
  const taskNames = useMemo((): string[] => {
    return tasks.map(task => task.name).sort();
  }, [tasks]);

  // Archived tasks stay in `tasks` (history/rate lookups need them);
  // start-new-work surfaces consume `activeTasks` instead
  const activeTasks = useMemo(() => tasks.filter(task => !task.isArchived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter(task => task.isArchived === true), [tasks]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    return executeAsync(
      async () => {
        const updatedTask = await taskService.updateTask(taskId, updates);
        setTasks(prev => prev.map(task =>
          task.id === taskId ? updatedTask : task
        ));
        showSuccess(`Task "${updatedTask.name}" updated successfully!`);
        return updatedTask;
      },
      {
        operation: 'updateTask',
        errorHandler: () => showError('Failed to update task. Please try again.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

  const archiveTask = useCallback(async (taskId: string) => {
    return executeAsync(
      async () => {
        const archivedTask = await taskService.archiveTask(taskId);
        setTasks(prev => prev.map(task =>
          task.id === taskId ? archivedTask : task
        ));
        showSuccess(`Task "${archivedTask.name}" archived successfully!`);
        return archivedTask;
      },
      {
        operation: 'archiveTask',
        errorHandler: () => showError('Failed to archive task. Please try again.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

  const unarchiveTask = useCallback(async (taskId: string) => {
    return executeAsync(
      async () => {
        const unarchivedTask = await taskService.unarchiveTask(taskId);
        setTasks(prev => prev.map(task =>
          task.id === taskId ? unarchivedTask : task
        ));
        showSuccess(`Task "${unarchivedTask.name}" unarchived successfully!`);
        return unarchivedTask;
      },
      {
        operation: 'unarchiveTask',
        errorHandler: () => showError('Failed to unarchive task. Please try again.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

  // 'orphan' by default: the UI no longer shows or edits parent tasks, so
  // children a user can't see must never block deleting their parent.
  const deleteTask = useCallback(async (taskId: string, strategy: TaskDeletionStrategy = 'orphan'): Promise<void> => {
    const taskToDelete = tasks.find(task => task.id === taskId);
    await executeAsync(
      async () => {
        await taskService.deleteTask(taskId, strategy);
        // Reload tasks to reflect all changes (including orphaned/cascaded deletions)
        const updatedTasks = await taskService.getAllTasks();
        setTasks(updatedTasks);
        showSuccess(`Task "${taskToDelete?.name || 'Unknown'}" deleted successfully!`);
      },
      {
        operation: 'deleteTask',
        errorHandler: () => showError('Failed to delete task. Please try again.')
      }
    );
  }, [taskService, executeAsync, tasks, showSuccess, showError]);

  const getTaskById = useCallback((taskId: string): Task | undefined => {
    return taskByIdMap.get(taskId);
  }, [taskByIdMap]);

  const getTaskByName = useCallback((taskName: string): Task | undefined => {
    return taskByNameMap.get(taskName);
  }, [taskByNameMap]);

  const getTaskNames = useCallback((): string[] => {
    return taskNames;
  }, [taskNames]);

  const calculateEarnings = useCallback((durationMs: number, hourlyRate?: number): number | undefined => {
    if (!hourlyRate || hourlyRate <= 0 || durationMs <= 0) {
      return undefined;
    }
    const hours = durationMs / (1000 * 60 * 60);
    return hours * hourlyRate;
  }, []);

  // Hierarchical methods
  const getTaskHierarchy = useCallback(async (): Promise<TaskHierarchy[]> => {
    return executeAsync(
      async () => {
        return await taskService.getTaskHierarchy();
      },
      {
        operation: 'getTaskHierarchy',
        errorHandler: () => showError('Failed to load task hierarchy. Please try again.')
      }
    ) || [];
  }, [taskService, executeAsync, showError]);

  const getChildTasks = useCallback(async (parentId: string): Promise<Task[]> => {
    return executeAsync(
      async () => {
        return await taskService.getChildTasks(parentId);
      },
      {
        operation: 'getChildTasks',
        errorHandler: () => showError('Failed to load child tasks. Please try again.')
      }
    ) || [];
  }, [taskService, executeAsync, showError]);

  const getParentTask = useCallback(async (taskId: string): Promise<Task | undefined> => {
    return executeAsync(
      async () => {
        return await taskService.getParentTask(taskId);
      },
      {
        operation: 'getParentTask',
        errorHandler: () => showError('Failed to load parent task. Please try again.')
      }
    );
  }, [taskService, executeAsync, showError]);

  const getTaskPath = useCallback(async (taskId: string): Promise<Task[]> => {
    return executeAsync(
      async () => {
        return await taskService.getTaskPath(taskId);
      },
      {
        operation: 'getTaskPath',
        errorHandler: () => showError('Failed to load task path. Please try again.')
      }
    ) || [];
  }, [taskService, executeAsync, showError]);

  return {
    tasks,
    activeTasks,
    archivedTasks,
    addTask,
    updateTask,
    deleteTask,
    archiveTask,
    unarchiveTask,
    getTaskById,
    getTaskByName,
    getTaskNames,
    calculateEarnings,
    // Hierarchical methods
    getTaskHierarchy,
    getChildTasks,
    getParentTask,
    getTaskPath,
    isLoading,
  };
}
