/**
 * Tests for useValidatedLocalStorage hook
 */

import { renderHook, act } from '@testing-library/react';
import { z } from 'zod';
import { useValidatedLocalStorage, createTypeGuards, useValidatedArrayStorage } from '../useValidatedLocalStorage';

vi.mock('../../utils/dataMigration', () => ({
  migrateData: vi.fn(),
  createBackup: vi.fn(),
  needsMigration: vi.fn(),
}));

import { migrateData as mockMigrateData, createBackup as mockCreateBackup, needsMigration as mockNeedsMigration } from '../../utils/dataMigration';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn((...args): string | null => {
    console.log('[mockLocalStorage] getItem', ...args)
    return null
  }),
  setItem: vi.fn((...args) => {
    console.log('[mockLocalStorage] setItem', ...args)
    return undefined
  }),
  removeItem: vi.fn((...args) => {
    console.log('[mockLocalStorage] removeItem', ...args)
    return undefined
  }),
  clear: vi.fn(() => {
    console.log('[mockLocalStorage] clear')
    return undefined
  }),
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

  const mockOnValidationError = vi.fn();
  const mockOnMigrationError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockLocalStorage.removeItem.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockNeedsMigration.mockReset();
    mockNeedsMigration.mockReturnValue(false);
    mockMigrateData.mockReset();
    mockMigrateData.mockImplementation((_key, data) => data);
    mockCreateBackup.mockReset();
    mockOnValidationError.mockReset();
    mockOnMigrationError.mockReset();
    // Re-define window.localStorage before each test to ensure the mock is always used
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
  });

  describe('initialization', () => {
    it('should initialize with initial value when localStorage is empty', () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => null);
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );
      expect(result.current.value).toEqual(initialValue);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(testKey);
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
    });

    it('should load valid data from localStorage', () => {
      const storedData = { name: 'stored', count: 5 };
      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(storedData));
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );
      expect(result.current.value).toEqual(storedData);
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
    });

    it('should use initial value for invalid stored data', () => {
      const invalidData = { name: 'test', count: 'invalid' };
      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(invalidData));
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );
      expect(result.current.value).toEqual(initialValue);
      expect(mockOnValidationError).toHaveBeenCalledWith(
        expect.stringContaining('Schema validation failed'),
        testKey
      );
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
    });

    it('should handle JSON parse errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => 'invalid json');
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          onValidationError: mockOnValidationError,
        })
      );
      expect(result.current.value).toEqual(initialValue);
      expect(mockOnValidationError).toHaveBeenCalled();
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
    });
  });

  describe('data migration', () => {
    it('should migrate data when needed', () => {
      const oldData = { name: 'old', version: 1 };
      const migratedData = { name: 'migrated', count: 0 };

      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(oldData));
      mockNeedsMigration.mockReturnValue(true);
      mockMigrateData.mockReturnValue({ version: 1, data: migratedData });

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

      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(oldData));
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

      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(oldData));
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
      mockLocalStorage.getItem.mockImplementationOnce(() => null);
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
      console.log('setItem calls:', mockLocalStorage.setItem.mock.calls);
    });

    it('should create backup before setting new value', () => {
      const existingValue = { name: 'existing', count: 5 };
      mockLocalStorage.getItem.mockImplementation(() => JSON.stringify(existingValue));
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
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
      console.log('setItem calls:', mockLocalStorage.setItem.mock.calls);
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
      mockLocalStorage.setItem.mockImplementationOnce(() => {
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
      console.log('setItem calls:', mockLocalStorage.setItem.mock.calls);
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
      const invalidData = { name: 'test', count: 'invalid' };
      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(invalidData));
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );
      const validation = result.current.validateCurrentValue();
      expect(validation.success).toBe(true);
      expect(validation.data).toEqual(initialValue);
    });
  });

  describe('revalidate', () => {
    it('should revalidate and fix invalid stored data', () => {
      // Start with invalid data in localStorage
      const invalidData = { name: 'test', count: 'invalid' };
      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(invalidData));
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );
      // Should have fallen back to initial value
      expect(result.current.value).toEqual(initialValue);
      // Now fix the stored data
      // Set up getItem to return the fixed data for the next call
      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify({ name: 'fixed', count: 5 }));
      act(() => {
        result.current.revalidate();
      });
      // After revalidate, value should be updated to the fixed data
      expect(result.current.value).toEqual({ name: 'fixed', count: 5 });
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
    });
  });

  describe('clearValue', () => {
    it('should clear value and reset to initial value', () => {
      // Set up localStorage with a value
      const storedData = { name: 'stored', count: 5 };
      mockLocalStorage.getItem.mockImplementationOnce(() => JSON.stringify(storedData));
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema)
      );
      expect(result.current.value).toEqual(storedData);
      // After clearValue, getItem should return null (simulate cleared localStorage)
      mockLocalStorage.getItem.mockImplementationOnce(() => null);
      act(() => {
        result.current.clearValue();
      });
      // After clear, value should be reset to initialValue
      expect(result.current.value).toEqual(initialValue);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(testKey);
      console.log('removeItem calls:', mockLocalStorage.removeItem.mock.calls);
    });

    it('should create backup before clearing', () => {
      const storedData = { name: 'stored', count: 5 };
      mockLocalStorage.getItem.mockImplementation(() => JSON.stringify(storedData));
      const { result } = renderHook(() =>
        useValidatedLocalStorage(testKey, initialValue, testValidator, testSchema, {
          enableBackup: true,
        })
      );
      act(() => {
        result.current.clearValue();
      });
      expect(mockCreateBackup).toHaveBeenCalledWith(testKey, storedData);
      console.log('getItem calls:', mockLocalStorage.getItem.mock.calls);
      console.log('removeItem calls:', mockLocalStorage.removeItem.mock.calls);
    });

    it('should handle clear errors gracefully', () => {
      mockLocalStorage.removeItem.mockImplementationOnce(() => {
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
      // onValidationError should be called with the error
      expect(mockOnValidationError).toHaveBeenCalledWith('Clear failed', testKey);
      console.log('removeItem calls:', mockLocalStorage.removeItem.mock.calls);
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
  const mockOnValidationError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
