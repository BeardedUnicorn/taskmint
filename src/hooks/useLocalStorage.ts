import { useState } from 'react';
import { migrateData, createBackup, needsMigration } from '../utils/dataMigration';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsedData = JSON.parse(item);

        // If the stored value is literally null, return it without migration
        if (parsedData === null) {
          return parsedData;
        }

        // Check if data needs migration
        if (needsMigration(parsedData)) {
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
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;

      // Save to localStorage in versioned format
      const versionedData = {
        version: 1,
        data: valueToStore,
        migratedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(key, JSON.stringify(versionedData));

      // Update state
      setStoredValue(valueToStore);
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}
