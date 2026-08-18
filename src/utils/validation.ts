/**
 * Validation Utilities
 * 
 * This file contains utility functions for runtime validation using Zod schemas
 * and other validation helpers for data integrity.
 */

import { z } from 'zod';
import { TimeEntrySchema, TimeEntry } from '../types/timer';
import { TaskSchema, Task } from '../types/task';


// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  issues?: z.ZodIssue[];
}

/**
 * Validate a TimeEntry object
 */
export function validateTimeEntry(data: unknown): ValidationResult<TimeEntry> {
  try {
    const result = TimeEntrySchema.safeParse(data);
    if (result.success) {
      return {
        success: true,
        data: result.data as TimeEntry
      };
    } else {
      return {
        success: false,
        error: 'TimeEntry validation failed',
        issues: result.error.issues
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Validate a Task object
 */
export function validateTask(data: unknown): ValidationResult<Task> {
  try {
    const result = TaskSchema.safeParse(data);
    if (result.success) {
      return {
        success: true,
        data: result.data as Task
      };
    } else {
      return {
        success: false,
        error: 'Task validation failed',
        issues: result.error.issues
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}





/**
 * Validate an array of TimeEntry objects
 */
export function validateTimeEntries(data: unknown): ValidationResult<TimeEntry[]> {
  if (!Array.isArray(data)) {
    return {
      success: false,
      error: 'Expected an array of TimeEntry objects'
    };
  }

  const validatedEntries: TimeEntry[] = [];
  const errors: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const result = validateTimeEntry(data[i]);
    if (result.success && result.data) {
      validatedEntries.push(result.data);
    } else {
      errors.push(`Entry ${i}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Validation failed for ${errors.length} entries: ${errors.join(', ')}`
    };
  }

  return {
    success: true,
    data: validatedEntries
  };
}

/**
 * Validate an array of Task objects
 */
export function validateTasks(data: unknown): ValidationResult<Task[]> {
  if (!Array.isArray(data)) {
    return {
      success: false,
      error: 'Expected an array of Task objects'
    };
  }

  const validatedTasks: Task[] = [];
  const errors: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const result = validateTask(data[i]);
    if (result.success && result.data) {
      validatedTasks.push(result.data);
    } else {
      errors.push(`Task ${i}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Validation failed for ${errors.length} tasks: ${errors.join(', ')}`
    };
  }

  return {
    success: true,
    data: validatedTasks
  };
}



/**
 * Generic validation function that can be used with any Zod schema
 */
export function validateWithSchema<T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return {
        success: true,
        data: result.data
      };
    } else {
      return {
        success: false,
        error: 'Schema validation failed',
        issues: result.error.issues
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Check if a value is a valid date string
 */
export function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

/**
 * Check if a value is a valid ISO datetime string
 */
export function isValidISOString(value: string): boolean {
  try {
    const date = new Date(value);
    return date.toISOString() === value;
  } catch {
    return false;
  }
}

/**
 * Sanitize and validate a task name
 */
export function validateTaskName(name: string): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      success: false,
      error: 'Task name must be a string'
    };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return {
      success: false,
      error: 'Task name cannot be empty'
    };
  }

  if (trimmed.length > 100) {
    return {
      success: false,
      error: 'Task name cannot exceed 100 characters'
    };
  }

  return {
    success: true,
    data: trimmed
  };
}
