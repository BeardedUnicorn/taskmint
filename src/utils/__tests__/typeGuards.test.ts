/**
 * Tests for type guards utilities
 */

import {
  isString,
  isNumber,
  isBoolean,
  isDate,
  isObject,
  isArray,
  isNonEmptyString,
  isPositiveNumber,
  isValidEmail,
  isValidUrl,
  isValidDateString,
  isValidISOString,
  isTimeEntry,
  isTask,

  validateTimeEntry,
} from '../typeGuards';

describe('Basic Type Guards', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-123)).toBe(true);
      expect(isNumber(123.45)).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber(Infinity)).toBe(false);
      expect(isNumber(-Infinity)).toBe(false);
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe('isDate', () => {
    it('should return true for valid dates', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('2023-01-01'))).toBe(true);
    });

    it('should return false for invalid dates', () => {
      expect(isDate(new Date('invalid'))).toBe(false);
      expect(isDate('2023-01-01')).toBe(false);
      expect(isDate(123456789)).toBe(false);
      expect(isDate(null)).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });
});

describe('Advanced Type Guards', () => {
  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString('  text  ')).toBe(true);
    });

    it('should return false for empty or non-strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
    });
  });

  describe('isPositiveNumber', () => {
    it('should return true for positive numbers', () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(123.45)).toBe(true);
      expect(isPositiveNumber(0.1)).toBe(true);
    });

    it('should return false for non-positive numbers', () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
      expect(isPositiveNumber('1')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('test+tag@example.org')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail(123)).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('ftp://files.example.com')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl(123)).toBe(false);
    });
  });

  describe('isValidDateString', () => {
    it('should return true for valid date strings', () => {
      expect(isValidDateString('2023-01-01')).toBe(true);
      expect(isValidDateString('2023-12-31')).toBe(true);
    });

    it('should return false for invalid date strings', () => {
      expect(isValidDateString('2023-13-01')).toBe(false);
      expect(isValidDateString('2023-02-30')).toBe(false);
      expect(isValidDateString('01-01-2023')).toBe(false);
      expect(isValidDateString('not-a-date')).toBe(false);
      expect(isValidDateString(123)).toBe(false);
    });
  });

  describe('isValidISOString', () => {
    it('should return true for valid ISO strings', () => {
      const isoString = new Date().toISOString();
      expect(isValidISOString(isoString)).toBe(true);
      expect(isValidISOString('2023-01-01T00:00:00.000Z')).toBe(true);
    });

    it('should return false for invalid ISO strings', () => {
      expect(isValidISOString('2023-01-01')).toBe(false);
      expect(isValidISOString('not-iso')).toBe(false);
      expect(isValidISOString(123)).toBe(false);
    });
  });
});

describe('Application-Specific Type Guards', () => {
  describe('isTimeEntry', () => {
    const validTimeEntry = {
      id: 'entry-1',
      taskName: 'Test Task',
      taskId: 'task-1',
      startTime: new Date(),
      endTime: new Date(),
      duration: 3600000,
      isRunning: false,
      date: '2023-01-01',
    };

    it('should return true for valid time entries', () => {
      expect(isTimeEntry(validTimeEntry)).toBe(true);
      
      // Test with optional fields undefined
      const minimalEntry = {
        id: 'entry-1',
        taskName: 'Test Task',
        startTime: new Date(),
        isRunning: false,
        date: '2023-01-01',
      };
      expect(isTimeEntry(minimalEntry)).toBe(true);
    });

    it('should return false for invalid time entries', () => {
      expect(isTimeEntry(null)).toBe(false);
      expect(isTimeEntry({})).toBe(false);
      
      // Missing required fields
      expect(isTimeEntry({ ...validTimeEntry, id: undefined })).toBe(false);
      expect(isTimeEntry({ ...validTimeEntry, taskName: '' })).toBe(false);
      expect(isTimeEntry({ ...validTimeEntry, startTime: 'not-a-date' })).toBe(false);
      expect(isTimeEntry({ ...validTimeEntry, isRunning: 'not-boolean' })).toBe(false);
      expect(isTimeEntry({ ...validTimeEntry, date: 'invalid-date' })).toBe(false);
    });
  });

  describe('isTask', () => {
    const validTask = {
      id: 'task-1',
      name: 'Test Task',
      hourlyRate: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should return true for valid tasks', () => {
      expect(isTask(validTask)).toBe(true);
      
      // Test with optional hourlyRate undefined
      const taskWithoutRate = {
        ...validTask,
        hourlyRate: undefined,
      };
      expect(isTask(taskWithoutRate)).toBe(true);
    });

    it('should return false for invalid tasks', () => {
      expect(isTask(null)).toBe(false);
      expect(isTask({})).toBe(false);
      
      // Missing required fields
      expect(isTask({ ...validTask, id: '' })).toBe(false);
      expect(isTask({ ...validTask, name: '' })).toBe(false);
      expect(isTask({ ...validTask, createdAt: 'invalid-iso' })).toBe(false);
      expect(isTask({ ...validTask, hourlyRate: -1 })).toBe(false);
    });
  });





});

describe('Validation Functions', () => {
  describe('validateTimeEntry', () => {
    const validTimeEntry = {
      id: 'entry-1',
      taskName: 'Test Task',
      startTime: new Date(),
      isRunning: false,
      date: '2023-01-01',
    };

    it('should return valid result for correct time entry', () => {
      const result = validateTimeEntry(validTimeEntry);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return detailed errors for invalid time entry', () => {
      const invalidEntry = {
        id: '',
        taskName: '',
        startTime: 'not-a-date',
        isRunning: 'not-boolean',
        date: 'invalid-date',
      };

      const result = validateTimeEntry(invalidEntry);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('id must be a non-empty string');
      expect(result.errors).toContain('taskName must be a non-empty string');
      expect(result.errors).toContain('startTime must be a valid Date');
      expect(result.errors).toContain('isRunning must be a boolean');
      expect(result.errors).toContain('date must be a valid date string in YYYY-MM-DD format');
    });

    it('should handle non-object input', () => {
      const result = validateTimeEntry('not-an-object');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Value must be an object');
    });
  });
});
