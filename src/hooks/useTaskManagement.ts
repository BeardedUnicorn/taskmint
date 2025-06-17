import { useCallback, useMemo, useState, useEffect } from 'react';
import { Task, UseTaskManagementReturn } from '../types/task';
import { ServiceFactory } from '../services';
import { useAsyncError } from './useAsyncError';

export function useTaskManagement(): UseTaskManagementReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const taskService = ServiceFactory.getTaskService();
  const { executeAsync } = useAsyncError();

  // Load tasks on mount
  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const loadedTasks = await taskService.getAllTasks();
        setTasks(loadedTasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [taskService]);

  const addTask = useCallback(async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    return executeAsync(
      async () => {
        const newTask = await taskService.createTask(taskData);
        setTasks(prev => [...prev, newTask]);
        return newTask;
      },
      { operation: 'addTask' }
    );
  }, [taskService, executeAsync]);

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

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    return executeAsync(
      async () => {
        const updatedTask = await taskService.updateTask(taskId, updates);
        setTasks(prev => prev.map(task =>
          task.id === taskId ? updatedTask : task
        ));
        return updatedTask;
      },
      { operation: 'updateTask' }
    );
  }, [taskService, executeAsync]);

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    await executeAsync(
      async () => {
        await taskService.deleteTask(taskId);
        setTasks(prev => prev.filter(task => task.id !== taskId));
      },
      { operation: 'deleteTask' }
    );
  }, [taskService, executeAsync]);

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
    if (!hourlyRate || hourlyRate <= 0) return undefined;
    const hours = durationMs / (1000 * 60 * 60);
    return hours * hourlyRate;
  }, []);

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    getTaskById,
    getTaskByName,
    getTaskNames,
    calculateEarnings,
    isLoading,
  };
}
