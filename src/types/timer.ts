/**
 * Timer and Time Entry Related Types
 *
 * This file contains all types related to time tracking functionality,
 * including time entries, timer state, and time-related utilities.
 */

import { z } from 'zod';
import { Task } from './task';

export interface TimeEntry {
  id: string;
  taskName: string;
  taskId?: string; // Optional link to predefined task
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  isRunning: boolean;
  date: string; // YYYY-MM-DD format
}

// Zod validation schemas
export const TimeEntrySchema = z.object({
  id: z.string().min(1),
  taskName: z.string().min(1),
  taskId: z.string().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  duration: z.number().min(0).optional(),
  isRunning: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
});

export interface EarningsData {
  taskName: string;
  duration: number;
  hourlyRate?: number;
  earnings?: number;
}

// Props interfaces for timer-related components
export interface TimeEntryFormProps {
  onSave: (entry: TimeEntry) => void;
  predefinedTasks: Array<{
    id: string;
    name: string;
    hourlyRate?: number;
    createdAt: string;
    updatedAt: string;
  }>;
  activeEntry?: TimeEntry | null;
  onUpdateActiveEntry: (entry: TimeEntry | null) => void;
  onCreateNewTask: (taskName: string) => Promise<{
    id: string;
    name: string;
    hourlyRate?: number;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface CalendarViewProps {
  entries: TimeEntry[];
  tasks: Array<{
    id: string;
    name: string;
    hourlyRate?: number;
    createdAt: string;
    updatedAt: string;
  }>;
  onUpdateEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
}

// System tray related interfaces
export interface UseSystemTrayProps {
  activeEntry: TimeEntry | null;
  timeEntries: TimeEntry[];
  onStartTimer: (taskName: string, startTime: Date) => void;
  onStopTimer: () => void;
  onShowNewTaskDialog: () => void;
}

// Timer rounding options
export type TimerRoundingOption = 'none' | 'up-5min' | 'up-15min' | 'up-30min';

export interface TimerSettings {
  roundingOption: TimerRoundingOption;
}

// Zod schema for timer settings
export const TimerSettingsSchema = z.object({
  roundingOption: z.enum(['none', 'up-5min', 'up-15min', 'up-30min'])
});

// Favorite tasks functionality
export interface FavoriteTasksSettings {
  favoriteTaskIds: string[];
  maxRecentTasks: number;
}

export interface TaskWithUsage extends Task {
  lastUsed?: Date;
  usageCount?: number;
  isFavorite?: boolean;
}

// Zod schema for favorite tasks settings
export const FavoriteTasksSettingsSchema = z.object({
  favoriteTaskIds: z.array(z.string()),
  maxRecentTasks: z.number().min(1).max(20).default(5)
});
