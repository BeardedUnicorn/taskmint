/**
 * Task Management Related Types
 *
 * This file contains all types related to task management functionality,
 * including task definitions, task forms, and task-related operations.
 */

import { z } from 'zod';

export interface Task {
  id: string;
  name: string;
  hourlyRate?: number; // Optional hourly rate in dollars
  defaultNoteTemplateId?: string | null; // Optional default note template
  parentId?: string | null; // Optional parent task for hierarchy
  childOrder?: number; // Order within parent's children
  isArchived?: boolean; // Archive status (defaults to false)
  archivedAt?: string | null; // ISO string when archived
  isFavorite?: boolean; // Starred: listed first in the tray and start pickers
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Zod validation schemas
export const TaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  hourlyRate: z.number().min(0).max(1000).optional(),
  defaultNoteTemplateId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  childOrder: z.number().min(0).optional(),
  isArchived: z.boolean().default(false),
  archivedAt: z.iso.datetime().nullable().optional(),
  isFavorite: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export interface TaskFormData {
  name: string;
  hourlyRate: string; // String for form input, converted to number
  defaultNoteTemplateId?: string | null; // Optional default note template
  parentId?: string | null; // Optional parent task
}

// Props interfaces for task-related components
export interface TaskManagementProps {
  tasks: Task[];
  onAddTask: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task | null>;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<Task | null>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

// Hierarchical task types
export interface TaskHierarchy {
  task: Task;
  children: TaskHierarchy[];
  depth: number;
  path: string[]; // Array of parent task names leading to this task
}

export interface TaskTreeNode extends Task {
  children: TaskTreeNode[];
  depth: number;
  isExpanded?: boolean;
}

// Task deletion options
export type TaskDeletionStrategy = 'orphan' | 'cascade' | 'prevent';

// Task management hook return type
export interface UseTaskManagementReturn {
  tasks: Task[];
  activeTasks: Task[];
  archivedTasks: Task[];
  addTask: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task | null>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<Task | null>;
  deleteTask: (taskId: string, strategy?: TaskDeletionStrategy) => Promise<void>;
  archiveTask: (taskId: string) => Promise<Task | null>;
  unarchiveTask: (taskId: string) => Promise<Task | null>;
  /** Star or unstar a task (no toast: the star itself shows the change). */
  toggleFavorite: (taskId: string) => Promise<Task | null>;
  getTaskById: (taskId: string) => Task | undefined;
  getTaskByName: (taskName: string) => Task | undefined;
  getTaskNames: () => string[];
  calculateEarnings: (durationMs: number, hourlyRate?: number) => number | undefined;
  // Hierarchical methods
  getTaskHierarchy: () => Promise<TaskHierarchy[]>;
  getChildTasks: (parentId: string) => Promise<Task[]>;
  getParentTask: (taskId: string) => Promise<Task | undefined>;
  getTaskPath: (taskId: string) => Promise<Task[]>;
  isLoading: boolean;
}
