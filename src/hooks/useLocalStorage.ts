import { useState, useEffect } from 'react';
import { migrateData, createBackup, needsMigration } from '../utils/dataMigration';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsedData = JSON.parse(item);

        // Check if data needs migration
        if (needsMigration(parsedData)) {
          console.log(`Data migration needed for key "${key}"`);

          // Create backup before migration
          createBackup(key, parsedData);

          // Migrate data
          const migratedData = migrateData(key, parsedData);

          // Save migrated data back to localStorage
          window.localStorage.setItem(key, JSON.stringify(migratedData));

          // Return the actual data (unwrap from versioned structure if needed)
          return migratedData.version ? migratedData.data : migratedData;
        }

        // Return the actual data (unwrap from versioned structure if needed)
        return parsedData.version ? parsedData.data : parsedData;
      }
      return initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  // Automatically save to localStorage whenever storedValue changes
  useEffect(() => {
    try {
      // Store data in versioned format
      const versionedData = {
        version: 1,
        data: storedValue,
        migratedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(key, JSON.stringify(versionedData));
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}
