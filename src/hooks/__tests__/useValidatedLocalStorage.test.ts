/**
 * Tests for useValidatedLocalStorage hook
 */

import { renderHook, act } from '@testing-library/react';
import { z } from 'zod';
import { useValidatedLocalStorage, createTypeGuards, useValidatedArrayStorage } from '../useValidatedLocalStorage';

// Declare mock variables before they are used in jest.mock
const mockMigrateData = jest.fn();
const mockCreateBackup = jest.fn();
const mockNeedsMigration = jest.fn();

// Mock data migration utilities
jest.mock('../../utils/dataMigration', () => ({
  migrateData: mockMigrateData,
  createBackup: mockCreateBackup,
  needsMigration: mockNeedsMigration,
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('useValidatedLocalStorage', () => {
  const testKey = 'test-key';
  const initialValue = { name: 'test', count: 0 };

  // Test schema
  const testSchema = z.object({
    name: z.string(),
    count: z.number(),
  });

  // Test validator
  const testValidator = (value: unknown): value is typeof initialValue => {
    return typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      'count' in value &&
      typeof (value as any).name === 'string' &&
      typeof (value as any).count === 'number';
  };

  const mockOnValidationError = jest.fn();
  const mockOnMigrationError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockNeedsMigration.mockReturnValue(false);
    mockMigrateData.mockImplementation((_key, data) => data);
  });

  describe('initialization', () => {
    it('should initialize with initial value when localStorage is empty', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      expect(result.current.value).toEqual(initialValue);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(testKey);
    });

    it('should load valid data from localStorage', () => {
      const storedData = { name: 'stored', count: 5 };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      expect(result.current.value).toEqual(storedData);
    });

    it('should use initial value for invalid stored data', () => {
      const invalidData = { name: 'test', count: 'invalid' };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(invalidData));

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );

      expect(result.current.value).toEqual(initialValue);
      expect(mockOnValidationError).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed'),
        testKey
      );
    });

    it('should handle JSON parse errors gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );

      expect(result.current.value).toEqual(initialValue);
      expect(mockOnValidationError).toHaveBeenCalled();
    });
  });

  describe('data migration', () => {
    it('should migrate data when needed', () => {
      const oldData = { name: 'old', version: 1 };
      const migratedData = { name: 'migrated', count: 0 };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldData));
      mockNeedsMigration.mockReturnValue(true);
      mockMigrateData.mockReturnValue({ data: migratedData });

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableMigration: true,
        })
      );

      expect(mockMigrateData).toHaveBeenCalledWith(testKey, oldData);
      expect(result.current.value).toEqual(migratedData);
    });

    it('should handle migration errors', () => {
      const oldData = { name: 'old', version: 1 };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldData));
      mockNeedsMigration.mockReturnValue(true);
      mockMigrateData.mockImplementation(() => {
        throw new Error('Migration failed');
      });

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableMigration: true,
          onMigrationError: mockOnMigrationError,
        })
      );

      expect(result.current.value).toEqual(initialValue);
      expect(mockOnMigrationError).toHaveBeenCalledWith('Migration failed', testKey);
    });

    it('should skip migration when disabled', () => {
      const oldData = { name: 'old', version: 1 };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldData));
      mockNeedsMigration.mockReturnValue(true);

      renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableMigration: false,
        })
      );

      expect(mockMigrateData).not.toHaveBeenCalled();
    });
  });

  describe('setValue', () => {
    it('should set valid value and update localStorage', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      const newValue = { name: 'updated', count: 10 };

      act(() => {
        result.current.setValue(newValue);
      });

      expect(result.current.value).toEqual(newValue);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        testKey,
        JSON.stringify(newValue)
      );
    });

    it('should create backup before setting new value', () => {
      const existingValue = { name: 'existing', count: 5 };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingValue));

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableBackup: true,
        })
      );

      const newValue = { name: 'updated', count: 10 };

      act(() => {
        result.current.setValue(newValue);
      });

      expect(mockCreateBackup).toHaveBeenCalledWith(testKey, existingValue);
    });

    it('should reject invalid values', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );

      const invalidValue = { name: 'test', count: 'invalid' } as any;

      act(() => {
        result.current.setValue(invalidValue);
      });

      expect(result.current.value).toEqual(initialValue);
      expect(mockOnValidationError).toHaveBeenCalled();
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );

      const newValue = { name: 'updated', count: 10 };

      act(() => {
        result.current.setValue(newValue);
      });

      expect(mockOnValidationError).toHaveBeenCalledWith(
        'Storage quota exceeded',
        testKey
      );
    });
  });

  describe('validateCurrentValue', () => {
    it('should return validation result for current value', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      const validation = result.current.validateCurrentValue();

      expect(validation.success).toBe(true);
      expect(validation.data).toEqual(initialValue);
    });

    it('should return validation error for invalid value', () => {
      const { result, rerender } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      // Force invalid state by directly manipulating the internal state, which is not ideal but works for testing
      act(() => {
        // This is a way to simulate an invalid state that bypasses setValue's validation
        // In a real app, this might happen if data in localStorage becomes corrupt.
        (result.current as any).value = { name: 'test', count: 'invalid' };
      });
      rerender(); // Rerender to update the hook's internal value

      const validation = result.current.validateCurrentValue();

      expect(validation.success).toBe(false);
      expect(validation.error).toBeDefined();
    });
  });

  describe('revalidate', () => {
    it('should revalidate and fix invalid stored data', () => {
      const invalidData = { name: 'test', count: 'invalid' };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(invalidData));

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      // Should have fallen back to initial value
      expect(result.current.value).toEqual(initialValue);

      // Now fix the stored data
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify({ name: 'fixed', count: 5 }));

      act(() => {
        result.current.revalidate();
      });

      expect(result.current.value).toEqual({ name: 'fixed', count: 5 });
    });
  });

  describe('clearValue', () => {
    it('should clear value and reset to initial value', () => {
      const storedData = { name: 'stored', count: 5 };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      expect(result.current.value).toEqual(storedData);

      act(() => {
        result.current.clearValue();
      });

      expect(result.current.value).toEqual(initialValue);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(testKey);
    });

    it('should create backup before clearing', () => {
      const storedData = { name: 'stored', count: 5 };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableBackup: true,
        })
      );

      act(() => {
        result.current.clearValue();
      });

      expect(mockCreateBackup).toHaveBeenCalledWith(testKey, storedData);
    });

    it('should handle clear errors gracefully', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );

      act(() => {
        result.current.clearValue();
      });

      expect(mockOnValidationError).toHaveBeenCalledWith('Clear failed', testKey);
    });
  });

  describe('schema validation', () => {
    it('should use Zod schema for validation when provided', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      const invalidValue = { name: 123, count: 'invalid' } as any;

      act(() => {
        result.current.setValue(invalidValue);
      });

      expect(result.current.value).toEqual(initialValue);
    });

    it('should work without schema', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator)
      );

      const newValue = { name: 'updated', count: 10 };

      act(() => {
        result.current.setValue(newValue);
      });

      expect(result.current.value).toEqual(newValue);
    });
  });

  describe('options handling', () => {
    it('should use default options when not provided', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );

      // Should not throw and should work with defaults
      expect(result.current.value).toEqual(initialValue);
    });

    it('should respect disabled backup option', () => {
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableBackup: false,
        })
      );

      const newValue = { name: 'updated', count: 10 };

      act(() => {
        result.current.setValue(newValue);
      });

      expect(mockCreateBackup).not.toHaveBeenCalled();
    });
  });
});

describe('createTypeGuards', () => {
  describe('array guard', () => {
    it('should validate arrays correctly', () => {
      const stringValidator = (value: unknown): value is string => typeof value === 'string';
      const arrayGuard = createTypeGuards.array(stringValidator);

      expect(arrayGuard(['a', 'b', 'c'])).toBe(true);
      expect(arrayGuard(['a', 1, 'c'])).toBe(false);
      expect(arrayGuard('not array')).toBe(false);
    });
  });

  describe('object guard', () => {
    it('should validate objects correctly', () => {
      const testValidator = (value: unknown): value is { name: string } =>
        typeof value === 'object' && value !== null && 'name' in value;
      const objectGuard = createTypeGuards.object(testValidator);

      expect(objectGuard({ name: 'test' })).toBe(true);
      expect(objectGuard({ other: 'prop' })).toBe(false);
      expect(objectGuard(null)).toBe(false);
    });
  });

  describe('primitive guards', () => {
    it('should validate strings', () => {
      expect(createTypeGuards.string('test')).toBe(true);
      expect(createTypeGuards.string(123)).toBe(false);
    });

    it('should validate numbers', () => {
      expect(createTypeGuards.number(123)).toBe(true);
      expect(createTypeGuards.number(NaN)).toBe(false);
      expect(createTypeGuards.number('123')).toBe(false);
    });

    it('should validate booleans', () => {
      expect(createTypeGuards.boolean(true)).toBe(true);
      expect(createTypeGuards.boolean(false)).toBe(true);
      expect(createTypeGuards.boolean('true')).toBe(false);
    });
  });
});

describe('useValidatedArrayStorage', () => {
  const testKey = 'test-array';
  const initialArray: string[] = [];
  const stringValidator = (value: unknown): value is string => typeof value === 'string';
  const stringSchema = z.string();
  const mockOnValidationError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('should work with array data', () => {
    const { result } = renderHook(() =>
      useValidatedArrayStorage(testKey, initialArray, stringValidator, stringSchema)
    );

    expect(result.current.value).toEqual(initialArray);

    const newArray = ['a', 'b', 'c'];

    act(() => {
      result.current.setValue(newArray);
    });

    expect(result.current.value).toEqual(newArray);
  });

  it('should validate array items', () => {
    const { result } = renderHook(() =>
      useValidatedArrayStorage(testKey, initialArray, stringValidator, stringSchema, {
        onValidationError: mockOnValidationError,
      })
    );

    const invalidArray = ['a', 123, 'c'] as any;

    act(() => {
      result.current.setValue(invalidArray);
    });

    expect(result.current.value).toEqual(initialArray);
    expect(mockOnValidationError).toHaveBeenCalled();
  });
});
