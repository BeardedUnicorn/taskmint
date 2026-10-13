/**
 * Validation Utilities
 * 
 * This file contains utility functions for runtime validation using Zod schemas
 * and other validation helpers for data integrity.
 */

import { z } from 'zod';

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  issues?: z.ZodIssue[];
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
