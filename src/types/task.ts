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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
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

export interface StartTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onStartTask: (taskName: string) => void;
  existingTasks: string[];
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
  addTask: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task | null>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<Task | null>;
  deleteTask: (taskId: string, strategy?: TaskDeletionStrategy) => Promise<void>;
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
