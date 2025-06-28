/**
 * Validated Local Storage Hook
 * 
 * This hook extends the basic localStorage functionality with runtime validation
 * using Zod schemas to ensure data integrity and type safety.
 */

import { useState, useCallback } from 'react';
import { z } from 'zod';
import { migrateData, createBackup, needsMigration } from '../utils/dataMigration';

// Validation result interface
interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Hook options interface
interface UseValidatedLocalStorageOptions {
  enableMigration?: boolean;
  enableBackup?: boolean;
  onValidationError?: (error: string, key: string) => void;
  onMigrationError?: (error: string, key: string) => void;
}

/**
 * Enhanced localStorage hook with validation and migration support
 */
export function useValidatedLocalStorage<T>(
  key: string,
  initialValue: T,
  validator: (value: unknown) => value is T,
  schema?: z.ZodSchema<T>,
  options: UseValidatedLocalStorageOptions = {}
) {
  const {
    enableMigration = true,
    enableBackup = true,
    onValidationError,
    onMigrationError,
  } = options;

  // Validate data using type guard or Zod schema
  const validateData = useCallback((data: unknown): ValidationResult<T> => {
    try {
      // First try the type guard if provided
      if (validator && validator(data)) {
        return { success: true, data };
      }

      // Then try Zod schema if provided
      if (schema) {
        const result = schema.safeParse(data);
        if (result.success) {
          return { success: true, data: result.data };
        } else {
          const errorMessage = result.error.issues
            .map(issue => `${issue.path.join('.')}: ${issue.message}`)
            .join(', ');
          return { success: false, error: `Schema validation failed: ${errorMessage}` };
        }
      }

      return { success: false, error: 'No validator provided' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }, [validator, schema]);

  // Initialize state with validated data
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // Always call getItem with the key argument for test compatibility
      const item = window.localStorage.getItem(key);
      if (item) {
        let parsedData = JSON.parse(item);

        // Handle migration if enabled
        if (enableMigration && needsMigration(parsedData)) {
          console.log(`Data migration needed for key "${key}"`);
          
          try {
            // Create backup before migration
            if (enableBackup) {
              console.log('[useValidatedLocalStorage] createBackup (migration)', key, parsedData)
              createBackup(key, parsedData);
            }
            
            // Migrate data
            const migratedData = migrateData(key, parsedData);
            
            // Save migrated data back to localStorage
            window.localStorage.setItem(key, JSON.stringify(migratedData));
            
            // Extract the actual data from versioned structure
            parsedData = migratedData.version ? migratedData.data : migratedData;
          } catch (migrationError) {
            const errorMessage = migrationError instanceof Error 
              ? migrationError.message 
              : 'Unknown migration error';
            console.error(`Migration failed for key "${key}":`, errorMessage);
            
            if (onMigrationError) {
              onMigrationError(errorMessage, key);
            }
            
            // Fall back to original data if migration fails
            parsedData = parsedData.version ? parsedData.data : parsedData;
          }
        } else if (parsedData.version) {
          // Extract data from versioned structure
          parsedData = parsedData.data;
        }

        // Validate the data
        const validationResult = validateData(parsedData);
        if (validationResult.success && validationResult.data !== undefined) {
          return validationResult.data;
        } else {
          const errorMessage = validationResult.error || 'Validation failed';
          console.error(`Validation failed for localStorage key "${key}":`, errorMessage);
          
          if (onValidationError) {
            onValidationError(errorMessage, key);
          }
          
          // Return initial value if validation fails
          return initialValue;
        }
      }
      return initialValue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error reading localStorage key "${key}":`, errorMessage);
      
      if (onValidationError) {
        onValidationError(errorMessage, key);
      }
      
      return initialValue;
    }
  });

  // Enhanced setValue function with validation
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Validate the value before storing
      const validationResult = validateData(valueToStore);
      if (!validationResult.success) {
        const errorMessage = validationResult.error || 'Validation failed';
        console.error(`Validation failed when setting localStorage key "${key}":`, errorMessage);
        
        if (onValidationError) {
          onValidationError(errorMessage, key);
        }
        
        // Don't update state or localStorage if validation fails
        return;
      }

      // Create backup before updating if enabled
      if (enableBackup) {
        try {
          console.log('[useValidatedLocalStorage] getItem (setValue)', key)
          const currentItem = window.localStorage.getItem(key);
          if (currentItem) {
            console.log('[useValidatedLocalStorage] createBackup (setValue)', key, JSON.parse(currentItem))
            createBackup(key, JSON.parse(currentItem));
          }
        } catch (backupError) {
          console.warn(`Failed to create backup for key "${key}":`, backupError);
          // Continue with the update even if backup fails
        }
      }

      // Update state
      setStoredValue(valueToStore);
      
      // Store in localStorage
      console.log('[useValidatedLocalStorage] setItem', key, valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error setting localStorage key "${key}":`, errorMessage);
      
      if (onValidationError) {
        onValidationError(errorMessage, key);
      }
    }
  }, [key, storedValue, validateData, enableBackup, onValidationError]);

  // Function to manually validate current stored value
  const validateCurrentValue = useCallback((): ValidationResult<T> => {
    return validateData(storedValue);
  }, [storedValue, validateData]);

  // Function to force re-validation and reload from localStorage
  const revalidate = useCallback(() => {
    try {
      console.log('[useValidatedLocalStorage] getItem (revalidate)', key)
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsedData = JSON.parse(item);
        const actualData = parsedData.version ? parsedData.data : parsedData;
        
        const validationResult = validateData(actualData);
        if (validationResult.success && validationResult.data !== undefined) {
          setStoredValue(validationResult.data);
        } else {
          const errorMessage = validationResult.error || 'Validation failed';
          console.error(`Revalidation failed for localStorage key "${key}":`, errorMessage);
          
          if (onValidationError) {
            onValidationError(errorMessage, key);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error during revalidation for localStorage key "${key}":`, errorMessage);
      
      if (onValidationError) {
        onValidationError(errorMessage, key);
      }
    }
  }, [key, validateData, onValidationError]);

  // Function to clear the stored value
  const clearValue = useCallback(() => {
    try {
      // Create backup before clearing if enabled
      if (enableBackup) {
        try {
          console.log('[useValidatedLocalStorage] getItem (clearValue)', key)
          const currentItem = window.localStorage.getItem(key);
          if (currentItem) {
            console.log('[useValidatedLocalStorage] createBackup (clearValue)', key, JSON.parse(currentItem))
            createBackup(key, JSON.parse(currentItem));
          }
        } catch (backupError) {
          console.warn(`Failed to create backup before clearing key "${key}":`, backupError);
        }
      }
      console.log('[useValidatedLocalStorage] removeItem', key)
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error clearing localStorage key "${key}":`, errorMessage);
      
      if (onValidationError) {
        onValidationError(errorMessage, key);
      }
    }
  }, [key, initialValue, enableBackup, onValidationError]);

  return {
    value: storedValue,
    setValue,
    validateCurrentValue,
    revalidate,
    clearValue,
  } as const;
}

/**
 * Type guard factory for common data types
 */
export const createTypeGuards = {
  array: <T>(itemValidator: (item: unknown) => item is T) => 
    (value: unknown): value is T[] => 
      Array.isArray(value) && value.every(itemValidator),
      
  object: <T>(validator: (obj: unknown) => obj is T) => 
    (value: unknown): value is T => 
      typeof value === 'object' && value !== null && validator(value),
      
  string: (value: unknown): value is string => 
    typeof value === 'string',
    
  number: (value: unknown): value is number => 
    typeof value === 'number' && !isNaN(value),
    
  boolean: (value: unknown): value is boolean => 
    typeof value === 'boolean',
};

/**
 * Convenience hook for arrays with validation
 */
export function useValidatedArrayStorage<T>(
  key: string,
  initialValue: T[],
  itemValidator: (item: unknown) => item is T,
  itemSchema?: z.ZodSchema<T>,
  options?: UseValidatedLocalStorageOptions
) {
  const arrayValidator = createTypeGuards.array(itemValidator);
  const arraySchema = itemSchema ? z.array(itemSchema) : undefined;
  
  return useValidatedLocalStorage(
    key,
    initialValue,
    arrayValidator,
    arraySchema,
    options
  );
}
