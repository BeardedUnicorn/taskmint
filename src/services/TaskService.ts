/**
 * Task Service
 * 
 * Centralized task management business logic
 * Handles CRUD operations, validation, and Tauri backend synchronization
 */

import { invoke } from '@tauri-apps/api/core';
import { Task, TaskDeletionStrategy, TaskHierarchy } from '../types/task';
import { IStorageService } from './StorageService';
import { createTaskError, TaskErrorClass } from '../types/errors';
import { validateTaskName } from '../utils/validation';
import {
  buildTaskHierarchy,
  getChildTasks,
  getParentTask,
  getTaskPath,
  canDeleteTask,
  prepareTaskDeletion,
  validateTaskHierarchy,
  getNextChildOrder
} from '../utils/taskHierarchy';

export interface ITaskService {
  // CRUD operations
  createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task>;
  deleteTask(taskId: string, strategy?: TaskDeletionStrategy): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  getAllTasks(): Promise<Task[]>;

  // Search and filtering
  searchTasks(query: string): Promise<Task[]>;
  getTasksByHourlyRate(minRate?: number, maxRate?: number): Promise<Task[]>;

  // Hierarchical operations
  getTaskHierarchy(): Promise<TaskHierarchy[]>;
  getChildTasks(parentId: string): Promise<Task[]>;
  getParentTask(taskId: string): Promise<Task | undefined>;
  getTaskPath(taskId: string): Promise<Task[]>;
  moveTask(taskId: string, newParentId: string | null): Promise<Task>;

  // Validation
  validateTask(task: Partial<Task>): Promise<{ isValid: boolean; errors: string[] }>;
  isTaskNameUnique(name: string, excludeId?: string): Promise<boolean>;
  validateTaskHierarchy(taskId: string, newParentId: string | null): Promise<boolean>;

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
        childOrder: taskData.parentId ? await this.getNextChildOrderForParent(taskData.parentId) : undefined,
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

      return updatedTask;
    } catch (error) {
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
   * Delete a task with hierarchical support
   */
  async deleteTask(taskId: string, strategy: TaskDeletionStrategy = 'prevent'): Promise<void> {
    try {

      const tasks = await this.getAllTasks();

      // Check if deletion is allowed with the given strategy
      const deletionCheck = canDeleteTask(tasks, taskId, strategy);
      if (!deletionCheck.canDelete) {
        throw createTaskError(
          'TASK_DELETE_PREVENTED',
          deletionCheck.reason || 'Cannot delete task',
          { taskId, strategy, affectedTasks: deletionCheck.affectedTasks },
          'deleteTask'
        );
      }

      // Prepare deletion based on strategy
      const { tasksToDelete, tasksToUpdate } = prepareTaskDeletion(tasks, taskId, strategy);

      // Update tasks that need to be modified (orphaned children)
      for (const update of tasksToUpdate) {
        await this.updateTask(update.id, update.updates);
      }

      // Delete time entries associated with tasks being deleted
      const timeEntries = await this.storageService.getTimeEntries();
      const filteredTimeEntries = timeEntries.filter(entry =>
        !tasksToDelete.includes(entry.taskId || '') &&
        !tasksToDelete.some(deletedTaskId => {
          const deletedTask = tasks.find(t => t.id === deletedTaskId);
          return deletedTask && entry.taskName === deletedTask.name;
        })
      );

      // Save the filtered time entries back to storage
      await this.storageService.setTimeEntries(filteredTimeEntries);

      // Remove tasks from storage
      const filteredTasks = tasks.filter(t => !tasksToDelete.includes(t.id));
      await this.storageService.setTasks(filteredTasks);

      // Remove from cache
      tasksToDelete.forEach(id => this.taskCache.delete(id));

      // Sync with Tauri backend
      await this.syncWithTauriBackend();

    } catch (error) {
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

    // Validate defaultNoteTemplateId (optional validation - just check if it's a string when provided)
    if (task.defaultNoteTemplateId !== undefined && task.defaultNoteTemplateId !== null) {
      if (typeof task.defaultNoteTemplateId !== 'string' || task.defaultNoteTemplateId.trim() === '') {
        errors.push('Default note template ID must be a valid string');
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
   * Get task hierarchy
   */
  async getTaskHierarchy(): Promise<TaskHierarchy[]> {
    try {
      const tasks = await this.getAllTasks();
      return buildTaskHierarchy(tasks);
    } catch (error) {
      console.error('Failed to get task hierarchy:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to retrieve task hierarchy',
        { originalError: error },
        'getTaskHierarchy'
      );
    }
  }

  /**
   * Get child tasks of a parent
   */
  async getChildTasks(parentId: string): Promise<Task[]> {
    try {
      const tasks = await this.getAllTasks();
      return getChildTasks(tasks, parentId);
    } catch (error) {
      console.error('Failed to get child tasks:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to retrieve child tasks',
        { originalError: error, parentId },
        'getChildTasks'
      );
    }
  }

  /**
   * Get parent task
   */
  async getParentTask(taskId: string): Promise<Task | undefined> {
    try {
      const tasks = await this.getAllTasks();
      return getParentTask(tasks, taskId);
    } catch (error) {
      console.error('Failed to get parent task:', error);
      return undefined;
    }
  }

  /**
   * Get task path from root to task
   */
  async getTaskPath(taskId: string): Promise<Task[]> {
    try {
      const tasks = await this.getAllTasks();
      return getTaskPath(tasks, taskId);
    } catch (error) {
      console.error('Failed to get task path:', error);
      throw createTaskError(
        'TASK_NOT_FOUND',
        'Failed to retrieve task path',
        { originalError: error, taskId },
        'getTaskPath'
      );
    }
  }

  /**
   * Move a task to a new parent
   */
  async moveTask(taskId: string, newParentId: string | null): Promise<Task> {
    try {
      const tasks = await this.getAllTasks();

      // Validate the move
      if (!validateTaskHierarchy(tasks, taskId, newParentId)) {
        throw createTaskError(
          'TASK_VALIDATION_FAILED',
          'Invalid task hierarchy: would create circular reference',
          { taskId, newParentId },
          'moveTask'
        );
      }

      const childOrder = newParentId ? getNextChildOrder(tasks, newParentId) : undefined;

      return await this.updateTask(taskId, {
        parentId: newParentId,
        childOrder,
      });
    } catch (error) {
      if (error instanceof TaskErrorClass) {
        throw error;
      }

      console.error('Failed to move task:', error);
      throw createTaskError(
        'TASK_UPDATE_FAILED',
        'Failed to move task',
        { originalError: error, taskId, newParentId },
        'moveTask'
      );
    }
  }

  /**
   * Validate task hierarchy
   */
  async validateTaskHierarchy(taskId: string, newParentId: string | null): Promise<boolean> {
    try {
      const tasks = await this.getAllTasks();
      return validateTaskHierarchy(tasks, taskId, newParentId);
    } catch (error) {
      console.error('Failed to validate task hierarchy:', error);
      return false;
    }
  }

  /**
   * Get next child order for a parent
   */
  private async getNextChildOrderForParent(parentId: string | null): Promise<number | undefined> {
    if (!parentId) return undefined;

    try {
      const tasks = await this.getAllTasks();
      return getNextChildOrder(tasks, parentId);
    } catch (error) {
      console.error('Failed to get next child order:', error);
      return 0;
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.lastSyncTime < this.CACHE_TTL;
  }
}
