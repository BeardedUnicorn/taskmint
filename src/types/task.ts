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
  // Parent tasks were removed (nothing showed or used them); values saved by
  // older versions are kept as they are.
  parentId?: string | null;
  childOrder?: number;
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

// Task management hook return type
export interface UseTaskManagementReturn {
  tasks: Task[];
  activeTasks: Task[];
  archivedTasks: Task[];
  addTask: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task | null>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<Task | null>;
  deleteTask: (taskId: string) => Promise<void>;
  archiveTask: (taskId: string) => Promise<Task | null>;
  unarchiveTask: (taskId: string) => Promise<Task | null>;
  /** Star or unstar a task (no toast: the star itself shows the change). */
  toggleFavorite: (taskId: string) => Promise<Task | null>;
  isLoading: boolean;
}
