/**
 * Tasks Hook
 * 
 * Simple hook to manage tasks data, providing a consistent interface
 * for accessing predefined tasks across the application.
 */

import { useState, useEffect } from 'react';
import { Task } from '../types/task';
import { StorageService } from '../services/StorageService';

export interface UseTasksReturn {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storageService = StorageService.getInstance();

  const loadTasks = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const loadedTasks = await storageService.getTasks();
      setTasks(loadedTasks);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tasks';
      setError(errorMessage);
      console.error('Error loading tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshTasks = async () => {
    await loadTasks();
  };

  useEffect(() => {
    loadTasks();
  }, []);

  return {
    tasks,
    isLoading,
    error,
    refreshTasks,
  };
}
