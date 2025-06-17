/**
 * Data Migration System
 * 
 * This file contains utilities for migrating data between different versions
 * of the application to ensure backward compatibility and data integrity.
 */

import { validateTimeEntries, validateTasks } from './validation';

// Current data version
export const CURRENT_DATA_VERSION = 1;

// Migration interface
export interface Migration {
  version: number;
  description: string;
  migrate: (data: any) => any;
}

// Data structure with version info
export interface VersionedData {
  version: number;
  data: any;
  migratedAt?: string;
  originalVersion?: number;
}

/**
 * Migration definitions
 * Each migration should transform data from the previous version to the current version
 */
const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial data structure with version tracking',
    migrate: (data: any) => {
      // First migration: add version tracking to existing data
      if (typeof data === 'object' && data !== null) {
        return {
          version: 1,
          data: data,
          migratedAt: new Date().toISOString(),
          originalVersion: 0, // Assume data without version is version 0
        };
      }
      return {
        version: 1,
        data: data,
        migratedAt: new Date().toISOString(),
        originalVersion: 0,
      };
    },
  },
  // Future migrations would be added here
  // {
  //   version: 2,
  //   description: 'Add new field to TimeEntry',
  //   migrate: (data: VersionedData) => {
  //     // Transform data from version 1 to version 2
  //     return {
  //       ...data,
  //       version: 2,
  //       data: {
  //         ...data.data,
  //         // Add new fields or transform existing ones
  //       },
  //       migratedAt: new Date().toISOString(),
  //     };
  //   },
  // },
];

/**
 * Get the current version of data
 */
export function getDataVersion(data: any): number {
  if (typeof data === 'object' && data !== null && typeof data.version === 'number') {
    return data.version;
  }
  return 0; // Assume unversioned data is version 0
}

/**
 * Check if data needs migration
 */
export function needsMigration(data: any): boolean {
  const currentVersion = getDataVersion(data);
  return currentVersion < CURRENT_DATA_VERSION;
}

/**
 * Migrate data to the current version
 */
export function migrateData(key: string, data: any): any {
  try {
    const currentVersion = getDataVersion(data);
    
    if (currentVersion >= CURRENT_DATA_VERSION) {
      // Data is already at current version or newer
      return data;
    }

    console.log(`Migrating data for key "${key}" from version ${currentVersion} to ${CURRENT_DATA_VERSION}`);

    // Apply migrations sequentially
    let migratedData = data;
    const applicableMigrations = migrations.filter(m => m.version > currentVersion);

    for (const migration of applicableMigrations) {
      console.log(`Applying migration ${migration.version}: ${migration.description}`);
      try {
        migratedData = migration.migrate(migratedData);
      } catch (error) {
        console.error(`Migration ${migration.version} failed:`, error);
        throw new Error(`Migration ${migration.version} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`Successfully migrated data for key "${key}" to version ${CURRENT_DATA_VERSION}`);
    return migratedData;

  } catch (error) {
    console.error(`Data migration failed for key "${key}":`, error);
    // Return original data if migration fails
    return data;
  }
}

/**
 * Migrate and validate time entries data
 */
export function migrateTimeEntries(data: any): any {
  try {
    // First migrate the data structure
    const migratedData = migrateData('timeEntries', data);
    
    // Extract the actual entries from the versioned data structure
    const entries = migratedData.version ? migratedData.data : migratedData;
    
    // Validate the migrated data
    const validationResult = validateTimeEntries(entries);
    
    if (!validationResult.success) {
      console.warn('Time entries validation failed after migration:', validationResult.error);
      // Return empty array if validation fails
      return migratedData.version ? { ...migratedData, data: [] } : [];
    }

    return migratedData.version ? { ...migratedData, data: validationResult.data } : validationResult.data;
  } catch (error) {
    console.error('Time entries migration failed:', error);
    return [];
  }
}

/**
 * Migrate and validate tasks data
 */
export function migrateTasks(data: any): any {
  try {
    // First migrate the data structure
    const migratedData = migrateData('tasks', data);
    
    // Extract the actual tasks from the versioned data structure
    const tasks = migratedData.version ? migratedData.data : migratedData;
    
    // Validate the migrated data
    const validationResult = validateTasks(tasks);
    
    if (!validationResult.success) {
      console.warn('Tasks validation failed after migration:', validationResult.error);
      // Return empty array if validation fails
      return migratedData.version ? { ...migratedData, data: [] } : [];
    }

    return migratedData.version ? { ...migratedData, data: validationResult.data } : validationResult.data;
  } catch (error) {
    console.error('Tasks migration failed:', error);
    return [];
  }
}



/**
 * Create a backup of data before migration
 */
export function createBackup(key: string, data: any): void {
  try {
    const backupKey = `${key}_backup_${Date.now()}`;
    const backupData = {
      originalKey: key,
      data: data,
      backedUpAt: new Date().toISOString(),
      version: getDataVersion(data),
    };
    
    localStorage.setItem(backupKey, JSON.stringify(backupData));
    console.log(`Created backup for "${key}" as "${backupKey}"`);
    
    // Clean up old backups (keep only the last 5)
    cleanupOldBackups(key);
  } catch (error) {
    console.error(`Failed to create backup for "${key}":`, error);
  }
}

/**
 * Clean up old backup files
 */
function cleanupOldBackups(key: string): void {
  try {
    const backupKeys: string[] = [];
    
    // Find all backup keys for this data key
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && storageKey.startsWith(`${key}_backup_`)) {
        backupKeys.push(storageKey);
      }
    }
    
    // Sort by timestamp (newest first)
    backupKeys.sort((a, b) => {
      const timestampA = parseInt(a.split('_backup_')[1] || '0');
      const timestampB = parseInt(b.split('_backup_')[1] || '0');
      return timestampB - timestampA;
    });
    
    // Remove old backups (keep only the last 5)
    const backupsToRemove = backupKeys.slice(5);
    for (const backupKey of backupsToRemove) {
      localStorage.removeItem(backupKey);
      console.log(`Removed old backup: ${backupKey}`);
    }
  } catch (error) {
    console.error('Failed to cleanup old backups:', error);
  }
}

/**
 * Get available backups for a data key
 */
export function getAvailableBackups(key: string): Array<{ key: string; timestamp: number; date: string }> {
  const backups: Array<{ key: string; timestamp: number; date: string }> = [];
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && storageKey.startsWith(`${key}_backup_`)) {
        const timestamp = parseInt(storageKey.split('_backup_')[1] || '0');
        backups.push({
          key: storageKey,
          timestamp,
          date: new Date(timestamp).toISOString(),
        });
      }
    }
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get available backups:', error);
  }
  
  return backups;
}

/**
 * Restore data from a backup
 */
export function restoreFromBackup(backupKey: string): any {
  try {
    const backupData = localStorage.getItem(backupKey);
    if (!backupData) {
      throw new Error(`Backup not found: ${backupKey}`);
    }
    
    const parsed = JSON.parse(backupData);
    console.log(`Restored data from backup: ${backupKey}`);
    return parsed.data;
  } catch (error) {
    console.error(`Failed to restore from backup "${backupKey}":`, error);
    throw error;
  }
}
