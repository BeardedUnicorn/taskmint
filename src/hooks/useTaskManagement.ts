import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Task, UseTaskManagementReturn } from '../types/task';
import { ServiceFactory } from '../services';
import { useAsyncError } from './useAsyncError';
import { useNotification } from '../contexts/NotificationContext';

export function useTaskManagement(): UseTaskManagementReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const taskService = ServiceFactory.getTaskService();
  const { executeAsync } = useAsyncError();
  const { showError, showSuccess } = useNotification();
  // Latest list for actions that look a task up, so they don't change
  // identity on every edit
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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
        return newTask;
      },
      {
        operation: 'addTask',
        errorHandler: error => showError(error.message || 'Failed to create task.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

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
        return updatedTask;
      },
      {
        operation: 'updateTask',
        errorHandler: error => showError(error.message || 'Failed to update task.')
      }
    );
  }, [taskService, executeAsync, showError]);

  const archiveTask = useCallback(async (taskId: string) => {
    return executeAsync(
      async () => {
        const archivedTask = await taskService.archiveTask(taskId);
        setTasks(prev => prev.map(task =>
          task.id === taskId ? archivedTask : task
        ));
        showSuccess(`Archived "${archivedTask.name}"`, { category: 'task' });
        return archivedTask;
      },
      {
        operation: 'archiveTask',
        errorHandler: error => showError(error.message || 'Failed to archive task.')
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
        return unarchivedTask;
      },
      {
        operation: 'unarchiveTask',
        errorHandler: error => showError(error.message || 'Failed to unarchive task.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

  // The star is its own feedback, so unlike updateTask this doesn't toast.
  const toggleFavorite = useCallback(async (taskId: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return null;
    return executeAsync(
      async () => {
        const updatedTask = await taskService.updateTask(taskId, { isFavorite: !task.isFavorite });
        setTasks(prev => prev.map(t => (t.id === taskId ? updatedTask : t)));
        return updatedTask;
      },
      {
        operation: 'toggleFavorite',
        errorHandler: error => showError(error.message || 'Failed to update the favorite.')
      }
    );
  }, [taskService, executeAsync, showError]);

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    const taskToDelete = tasksRef.current.find(task => task.id === taskId);
    await executeAsync(
      async () => {
        await taskService.deleteTask(taskId);
        const updatedTasks = await taskService.getAllTasks();
        setTasks(updatedTasks);
        showSuccess(`Deleted "${taskToDelete?.name || 'the task'}"`, { category: 'task' });
      },
      {
        operation: 'deleteTask',
        errorHandler: error => showError(error.message || 'Failed to delete task.')
      }
    );
  }, [taskService, executeAsync, showSuccess, showError]);

  return useMemo(() => ({
    tasks,
    activeTasks,
    archivedTasks,
    addTask,
    updateTask,
    deleteTask,
    archiveTask,
    unarchiveTask,
    toggleFavorite,
    isLoading,
  }), [tasks, activeTasks, archivedTasks, addTask, updateTask, deleteTask, archiveTask, unarchiveTask, toggleFavorite, isLoading]);
}
