/**
 * Type Guards Implementation
 * 
 * This file contains runtime type checking utilities for ensuring type safety
 * and data validation throughout the application.
 */

import { TimeEntry } from '../types/timer';
import { Task } from '../types/task';


/**
 * Basic type guards for primitive types
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Advanced type guards
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

export function isValidEmail(value: unknown): value is string {
  if (!isString(value)) return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(value);
}

export function isValidUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidDateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString().split('T')[0] === value;
}

export function isValidISOString(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    const date = new Date(value);
    return date.toISOString() === value;
  } catch {
    return false;
  }
}

/**
 * Application-specific type guards
 */
export function isTimeEntry(value: unknown): value is TimeEntry {
  if (!isObject(value)) return false;
  
  const obj = value as Record<string, unknown>;
  
  return (
    isNonEmptyString(obj.id) &&
    isNonEmptyString(obj.taskName) &&
    (isUndefined(obj.taskId) || isNonEmptyString(obj.taskId)) &&
    isDate(obj.startTime) &&
    (isUndefined(obj.endTime) || isDate(obj.endTime)) &&
    (isUndefined(obj.duration) || isNonNegativeNumber(obj.duration)) &&
    isBoolean(obj.isRunning) &&
    isValidDateString(obj.date)
  );
}

export function isTask(value: unknown): value is Task {
  if (!isObject(value)) return false;

  const obj = value as Record<string, unknown>;

  return (
    isNonEmptyString(obj.id) &&
    isNonEmptyString(obj.name) &&
    (isUndefined(obj.hourlyRate) || isPositiveNumber(obj.hourlyRate)) &&
    (isUndefined(obj.defaultNoteTemplateId) || obj.defaultNoteTemplateId === null || isNonEmptyString(obj.defaultNoteTemplateId)) &&
    isValidISOString(obj.createdAt) &&
    isValidISOString(obj.updatedAt)
  );
}





/**
 * Array type guards
 */
export function isTimeEntryArray(value: unknown): value is TimeEntry[] {
  return isArray(value) && value.every(isTimeEntry);
}

export function isTaskArray(value: unknown): value is Task[] {
  return isArray(value) && value.every(isTask);
}



/**
 * Generic type guard factory
 */
export function createArrayTypeGuard<T>(
  itemGuard: (value: unknown) => value is T
): (value: unknown) => value is T[] {
  return (value: unknown): value is T[] => {
    return isArray(value) && value.every(itemGuard);
  };
}

export function createObjectTypeGuard<T>(
  propertyGuards: Record<keyof T, (value: unknown) => boolean>
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    if (!isObject(value)) return false;
    
    const obj = value as Record<string, unknown>;
    
    return Object.entries(propertyGuards).every(([key, guard]) => {
      return (guard as (value: unknown) => boolean)(obj[key]);
    });
  };
}

/**
 * Utility type guards for common patterns
 */
export function hasProperty<K extends string>(
  obj: unknown,
  prop: K
): obj is Record<K, unknown> {
  return isObject(obj) && prop in obj;
}

export function hasProperties<K extends string>(
  obj: unknown,
  props: K[]
): obj is Record<K, unknown> {
  return isObject(obj) && props.every(prop => prop in obj);
}

export function isOneOf<T extends readonly unknown[]>(
  value: unknown,
  options: T
): value is T[number] {
  return options.includes(value);
}

export function isStringEnum<T extends Record<string, string>>(
  value: unknown,
  enumObject: T
): value is T[keyof T] {
  return isString(value) && Object.values(enumObject).includes(value);
}

/**
 * Validation helpers
 */
export function assertIsTimeEntry(value: unknown): asserts value is TimeEntry {
  if (!isTimeEntry(value)) {
    throw new Error('Value is not a valid TimeEntry');
  }
}

export function assertIsTask(value: unknown): asserts value is Task {
  if (!isTask(value)) {
    throw new Error('Value is not a valid Task');
  }
}



/**
 * Safe parsing utilities
 */
export function safeParseTimeEntry(value: unknown): TimeEntry | null {
  try {
    if (isTimeEntry(value)) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function safeParseTask(value: unknown): Task | null {
  try {
    if (isTask(value)) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}



/**
 * Type narrowing utilities
 */
export function filterTimeEntries(values: unknown[]): TimeEntry[] {
  return values.filter(isTimeEntry);
}

export function filterTasks(values: unknown[]): Task[] {
  return values.filter(isTask);
}



/**
 * Deep type checking
 */
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => isDeepEqual(item, b[index]));
    }
    
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    
    if (aKeys.length !== bKeys.length) return false;
    
    return aKeys.every(key => 
      bKeys.includes(key) && isDeepEqual(aObj[key], bObj[key])
    );
  }
  
  return false;
}

/**
 * Runtime type checking with detailed error messages
 */
export interface TypeCheckResult {
  isValid: boolean;
  errors: string[];
}

export function validateTimeEntry(value: unknown): TypeCheckResult {
  const errors: string[] = [];
  
  if (!isObject(value)) {
    return { isValid: false, errors: ['Value must be an object'] };
  }
  
  const obj = value as Record<string, unknown>;
  
  if (!isNonEmptyString(obj.id)) {
    errors.push('id must be a non-empty string');
  }
  
  if (!isNonEmptyString(obj.taskName)) {
    errors.push('taskName must be a non-empty string');
  }
  
  if (obj.taskId !== undefined && !isNonEmptyString(obj.taskId)) {
    errors.push('taskId must be a non-empty string or undefined');
  }
  
  if (!isDate(obj.startTime)) {
    errors.push('startTime must be a valid Date');
  }
  
  if (obj.endTime !== undefined && !isDate(obj.endTime)) {
    errors.push('endTime must be a valid Date or undefined');
  }
  
  if (obj.duration !== undefined && !isNonNegativeNumber(obj.duration)) {
    errors.push('duration must be a non-negative number or undefined');
  }
  
  if (!isBoolean(obj.isRunning)) {
    errors.push('isRunning must be a boolean');
  }
  
  if (!isValidDateString(obj.date)) {
    errors.push('date must be a valid date string in YYYY-MM-DD format');
  }
  
  return { isValid: errors.length === 0, errors };
}
