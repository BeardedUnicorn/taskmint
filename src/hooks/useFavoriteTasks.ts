/**
 * Favorite Tasks Hook
 * 
 * Manages favorite tasks and recent task functionality
 */

import { useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { FavoriteTasksSettings, TaskWithUsage } from '../types/timer';
import { Task } from '../types/task';
import { TimeEntry } from '../types/timer';

const DEFAULT_FAVORITE_TASKS_SETTINGS: FavoriteTasksSettings = {
  favoriteTaskIds: [],
  maxRecentTasks: 5,
};

export function useFavoriteTasks(tasks: Task[], timeEntries: TimeEntry[]) {
  const [settings, setSettings] = useLocalStorage<FavoriteTasksSettings>(
    STORAGE_KEYS.FAVORITE_TASKS,
    DEFAULT_FAVORITE_TASKS_SETTINGS
  );

  // Calculate recent tasks based on time entries
  const recentTasks = useMemo(() => {
    if (!timeEntries || timeEntries.length === 0) {
      return [];
    }

    // Create a map of task names to their most recent usage and count
    const taskUsageMap = new Map<string, { lastUsed: Date; count: number; taskId?: string }>();
    
    timeEntries.forEach(entry => {
      const entryDate = new Date(entry.startTime);
      const current = taskUsageMap.get(entry.taskName);
      
      if (!current || entryDate > current.lastUsed) {
        taskUsageMap.set(entry.taskName, {
          lastUsed: entryDate,
          count: (current?.count || 0) + 1,
          taskId: entry.taskId,
        });
      } else {
        taskUsageMap.set(entry.taskName, {
          ...current,
          count: current.count + 1,
        });
      }
    });

    // Convert to array and sort by last used date
    const recentTasksArray = Array.from(taskUsageMap.entries())
      .map(([taskName, usage]) => {
        const task = tasks.find(t => t.name === taskName || t.id === usage.taskId);
        return {
          taskName,
          lastUsed: usage.lastUsed,
          usageCount: usage.count,
          task,
        };
      })
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, settings.maxRecentTasks);

    return recentTasksArray;
  }, [timeEntries, tasks, settings.maxRecentTasks]);

  // Get favorite tasks
  const favoriteTasks = useMemo(() => {
    return tasks.filter(task => settings.favoriteTaskIds.includes(task.id));
  }, [tasks, settings.favoriteTaskIds]);

  // Combine favorite and recent tasks with usage info
  const tasksWithUsage = useMemo((): TaskWithUsage[] => {
    const taskUsageMap = new Map<string, { lastUsed: Date; count: number }>();
    
    // Build usage map from time entries
    timeEntries.forEach(entry => {
      const entryDate = new Date(entry.startTime);
      const current = taskUsageMap.get(entry.taskName);
      
      if (!current || entryDate > current.lastUsed) {
        taskUsageMap.set(entry.taskName, {
          lastUsed: entryDate,
          count: (current?.count || 0) + 1,
        });
      } else {
        taskUsageMap.set(entry.taskName, {
          ...current,
          count: current.count + 1,
        });
      }
    });

    // Map tasks with usage info
    return tasks.map(task => {
      const usage = taskUsageMap.get(task.name);
      return {
        ...task,
        lastUsed: usage?.lastUsed,
        usageCount: usage?.count || 0,
        isFavorite: settings.favoriteTaskIds.includes(task.id),
      };
    });
  }, [tasks, timeEntries, settings.favoriteTaskIds]);

  // Get combined favorite and recent tasks for quick access
  const quickAccessTasks = useMemo(() => {
    const favoriteTasksSet = new Set(settings.favoriteTaskIds);
    // const recentTaskNames = new Set(recentTasks.map(rt => rt.taskName)); // Commented out unused variable
    
    // Start with favorite tasks
    const quickTasks = [...favoriteTasks];
    
    // Add recent tasks that aren't already favorites
    recentTasks.forEach(recentTask => {
      if (recentTask.task && !favoriteTasksSet.has(recentTask.task.id)) {
        quickTasks.push(recentTask.task);
      }
    });

    return quickTasks;
  }, [favoriteTasks, recentTasks, settings.favoriteTaskIds]);

  const toggleFavorite = (taskId: string) => {
    setSettings(prev => {
      const favoriteTaskIds = prev.favoriteTaskIds.includes(taskId)
        ? prev.favoriteTaskIds.filter(id => id !== taskId)
        : [...prev.favoriteTaskIds, taskId];
      
      return {
        ...prev,
        favoriteTaskIds,
      };
    });
  };

  const addFavorite = (taskId: string) => {
    setSettings(prev => ({
      ...prev,
      favoriteTaskIds: prev.favoriteTaskIds.includes(taskId)
        ? prev.favoriteTaskIds
        : [...prev.favoriteTaskIds, taskId],
    }));
  };

  const removeFavorite = (taskId: string) => {
    setSettings(prev => ({
      ...prev,
      favoriteTaskIds: prev.favoriteTaskIds.filter(id => id !== taskId),
    }));
  };

  const isFavorite = (taskId: string): boolean => {
    return settings.favoriteTaskIds.includes(taskId);
  };

  const setMaxRecentTasks = (maxRecentTasks: number) => {
    setSettings(prev => ({
      ...prev,
      maxRecentTasks: Math.max(1, Math.min(20, maxRecentTasks)),
    }));
  };

  return {
    // Settings
    settings,
    setMaxRecentTasks,
    
    // Favorite tasks
    favoriteTasks,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    isFavorite,
    
    // Recent tasks
    recentTasks,
    
    // Combined data
    tasksWithUsage,
    quickAccessTasks,
  };
}
