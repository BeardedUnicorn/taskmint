/**
 * Task Service
 * 
 * Centralized task management business logic
 * Handles CRUD operations, validation, and Tauri backend synchronization
 */

import { invoke } from '@tauri-apps/api/core';
import { Task } from '../types/task';
import { IStorageService } from './StorageService';
import { createTaskError, TaskErrorClass } from '../types/errors';
import { validateTaskName } from '../utils/validation';

export interface ITaskService {
  // CRUD operations
  createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  getAllTasks(): Promise<Task[]>;
  
  // Search and filtering
  searchTasks(query: string): Promise<Task[]>;
  getTasksByHourlyRate(minRate?: number, maxRate?: number): Promise<Task[]>;
  
  // Validation
  validateTask(task: Partial<Task>): Promise<{ isValid: boolean; errors: string[] }>;
  isTaskNameUnique(name: string, excludeId?: string): Promise<boolean>;
  
  // Tauri backend synchronization
  syncWithTauriBackend(): Promise<void>;
}

export class TaskService implements ITaskService {
  private storageService: IStorageService;
  private taskCache: Map<string, Task> = new Map();
  private lastSyncTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  /**
   * Create a new task
   */
  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    try {
      // Validate task data
      const validation = await this.validateTask(taskData);
      if (!validation.isValid) {
        throw createTaskError(
          'TASK_VALIDATION_FAILED',
          `Task validation failed: ${validation.errors.join(', ')}`,
          { taskData, errors: validation.errors },
          'createTask'
        );
      }

      // Check if task name is unique
      const isUnique = await this.isTaskNameUnique(taskData.name);
      if (!isUnique) {
        throw createTaskError(
          'TASK_DUPLICATE_NAME',
          `A task with the name "${taskData.name}" already exists`,
          { taskName: taskData.name },
          'createTask'
        );
      }

      const now = new Date().toISOString();
      const newTask: Task = {
        ...taskData,
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: taskData.name.trim(),
        createdAt: now,
        updatedAt: now,
      };

      // Save to storage
      const tasks = await this.getAllTasks();
      tasks.push(newTask);
      await this.storageService.setTasks(tasks);

      // Update cache
      this.taskCache.set(newTask.id, newTask);

      // Sync with Tauri backend
      await this.syncWithTauriBackend();

      console.log('Task created successfully:', newTask);
      return newTask;
    } catch (error) {
      if (error instanceof TaskErrorClass) {
        throw error;
      }
      
      console.error('Failed to create task:', error);
      throw createTaskError(
        'TASK_CREATE_FAILED',
        'Failed to create task',
        { originalError: error, taskData },
        'createTask'
      );
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(
    taskId: string, 
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task> {
    try {
      const existingTask = await this.getTask(taskId);
      if (!existingTask) {
        throw createTaskError(
          'TASK_NOT_FOUND',
          `Task with ID ${taskId} not found`,
          { taskId },
          'updateTask'
        );
      }

      // Validate updates
      const updatedTaskData = { ...existingTask, ...updates };
      const validation = await this.validateTask(updatedTaskData);
      if (!validation.isValid) {
        throw createTaskError(
          'TASK_VALIDATION_FAILED',
          `Task validation failed: ${validation.errors.join(', ')}`,
          { taskId, updates, errors: validation.errors },
          'updateTask'
        );
      }

      // Check name uniqueness if name is being updated
      if (updates.name && updates.name !== existingTask.name) {
        const isUnique = await this.isTaskNameUnique(updates.name, taskId);
        if (!isUnique) {
          throw createTaskError(
            'TASK_DUPLICATE_NAME',
            `A task with the name "${updates.name}" already exists`,
            { taskName: updates.name, taskId },
            'updateTask'
          );
        }
      }

      const updatedTask: Task = {
        ...existingTask,
        ...updates,
        name: updates.name ? updates.name.trim() : existingTask.name,
        updatedAt: new Date().toISOString(),
      };

      // Update in storage
      const tasks = await this.getAllTasks();
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        throw createTaskError(
          'TASK_NOT_FOUND',
          `Task with ID ${taskId} not found in storage`,
          { taskId },
          'updateTask'
        );
      }

      tasks[taskIndex] = updatedTask;
      await this.storageService.setTasks(tasks);

      // Update cache
      this.taskCache.set(taskId, updatedTask);

      // Sync with Tauri backend
      await this.syncWithTauriBackend();

      console.log('Task updated successfully:', updatedTask);
      return updatedTask;
    } catch (error) {
      if (error instanceof TaskErrorClass) {
        throw error;
      }
      
      console.error('Failed to update task:', error);
      throw createTaskError(
        'TASK_UPDATE_FAILED',
        'Failed to update task',
        { originalError: error, taskId, updates },
        'updateTask'
      );
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      const existingTask = await this.getTask(taskId);
      if (!existingTask) {
        throw createTaskError(
          'TASK_NOT_FOUND',
          `Task with ID ${taskId} not found`,
          { taskId },
          'deleteTask'
        );
      }

      // Remove from storage
      const tasks = await this.getAllTasks();
      const filteredTasks = tasks.filter(t => t.id !== taskId);
      
      if (filteredTasks.length === tasks.length) {
        throw createTaskError(
          'TASK_NOT_FOUND',
          `Task with ID ${taskId} not found in storage`,
          { taskId },
          'deleteTask'
        );
      }

      await this.storageService.setTasks(filteredTasks);

      // Remove from cache
      this.taskCache.delete(taskId);

      // Sync with Tauri backend
      await this.syncWithTauriBackend();

      console.log('Task deleted successfully:', taskId);
    } catch (error) {
      if (error instanceof TaskErrorClass) {
        throw error;
      }
      
      console.error('Failed to delete task:', error);
      throw createTaskError(
        'TASK_DELETE_FAILED',
        'Failed to delete task',
        { originalError: error, taskId },
        'deleteTask'
      );
    }
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    try {
      // Check cache first
      if (this.taskCache.has(taskId) && this.isCacheValid()) {
        return this.taskCache.get(taskId) || null;
      }

      // Load from storage
      const tasks = await this.getAllTasks();
      const task = tasks.find(t => t.id === taskId) || null;
      
      if (task) {
        this.taskCache.set(taskId, task);
      }
      
      return task;
    } catch (error) {
      console.error('Failed to get task:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to retrieve task',
        { originalError: error, taskId },
        'getTask'
      );
    }
  }

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    try {
      const tasks = await this.storageService.getTasks();
      
      // Update cache
      tasks.forEach(task => {
        this.taskCache.set(task.id, task);
      });
      this.lastSyncTime = Date.now();
      
      return tasks;
    } catch (error) {
      console.error('Failed to get all tasks:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to retrieve tasks',
        { originalError: error },
        'getAllTasks'
      );
    }
  }

  /**
   * Search tasks by name
   */
  async searchTasks(query: string): Promise<Task[]> {
    try {
      const tasks = await this.getAllTasks();
      const searchTerm = query.toLowerCase().trim();
      
      if (!searchTerm) {
        return tasks;
      }
      
      return tasks.filter(task => 
        task.name.toLowerCase().includes(searchTerm)
      );
    } catch (error) {
      console.error('Failed to search tasks:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to search tasks',
        { originalError: error, query },
        'searchTasks'
      );
    }
  }

  /**
   * Get tasks by hourly rate range
   */
  async getTasksByHourlyRate(minRate?: number, maxRate?: number): Promise<Task[]> {
    try {
      const tasks = await this.getAllTasks();
      
      return tasks.filter(task => {
        if (task.hourlyRate === undefined) {
          return minRate === undefined && maxRate === undefined;
        }
        
        const rate = task.hourlyRate;
        const meetsMin = minRate === undefined || rate >= minRate;
        const meetsMax = maxRate === undefined || rate <= maxRate;
        
        return meetsMin && meetsMax;
      });
    } catch (error) {
      console.error('Failed to get tasks by hourly rate:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to retrieve tasks by hourly rate',
        { originalError: error, minRate, maxRate },
        'getTasksByHourlyRate'
      );
    }
  }

  /**
   * Validate task data
   */
  async validateTask(task: Partial<Task>): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate name
    if (!task.name) {
      errors.push('Task name is required');
    } else {
      const nameValidation = validateTaskName(task.name);
      if (!nameValidation.success) {
        errors.push(nameValidation.error!);
      }
    }

    // Validate hourly rate
    if (task.hourlyRate !== undefined) {
      if (typeof task.hourlyRate !== 'number' || task.hourlyRate < 0) {
        errors.push('Hourly rate must be a positive number');
      }
      if (task.hourlyRate > 1000) {
        errors.push('Hourly rate cannot exceed $1000');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if task name is unique
   */
  async isTaskNameUnique(name: string, excludeId?: string): Promise<boolean> {
    try {
      const tasks = await this.getAllTasks();
      const trimmedName = name.trim().toLowerCase();
      
      return !tasks.some(task => 
        task.id !== excludeId && 
        task.name.toLowerCase() === trimmedName
      );
    } catch (error) {
      console.error('Failed to check task name uniqueness:', error);
      return false;
    }
  }

  /**
   * Sync tasks with Tauri backend
   */
  async syncWithTauriBackend(): Promise<void> {
    try {
      const tasks = await this.getAllTasks();
      await invoke('update_tasks', { tasks });
    } catch (error) {
      console.error('Failed to sync tasks with Tauri backend:', error);
      // Don't throw error for backend sync to avoid breaking main functionality
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.lastSyncTime < this.CACHE_TTL;
  }
}
