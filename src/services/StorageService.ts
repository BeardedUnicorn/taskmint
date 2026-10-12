/**
 * Storage Service
 * 
 * Centralized storage management with validation, migration, and error handling
 * Provides a unified interface for all data persistence operations
 *
 * The records (tasks, notes, note templates, the daily goal and its history)
 * live in the app's appdata.json in the desktop app, through the records
 * cache (services/appRecords); everything else, and every key outside the
 * app, uses localStorage.
 */

import { z } from 'zod';
import { TimeEntry, TimeEntrySchema } from '../types/timer';
import { Task, TaskSchema } from '../types/task';
import { NoteTemplate, TaskNote, NoteTemplateSchema, TaskNoteSchema } from '../types/notes';
import { DailyGoal, DailyGoalAchievement, DailyGoalSchema, DailyGoalAchievementSchema } from '../types/goal';

import { STORAGE_KEYS } from '../constants';
import { migrateData, createBackup, needsMigration, migrateTaskNotes } from '../utils/dataMigration';
import { validateWithSchema } from '../utils/validation';
import { StorageErrorClass, createStorageError } from '../types/errors';
import {
  AppRecordKey,
  appRecordsActive,
  isAppRecordKey,
  readAppRecord,
  writeAppRecord,
} from './appRecords';

export interface IStorageService {
  // Generic storage operations
  getItem<T>(key: string, defaultValue: T, schema?: z.ZodType<T>): Promise<T>;
  setItem<T>(key: string, value: T, schema?: z.ZodType<T>): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  
  // Typed storage operations
  getTimeEntries(): Promise<TimeEntry[]>;
  setTimeEntries(entries: TimeEntry[]): Promise<void>;
  getTasks(): Promise<Task[]>;
  setTasks(tasks: Task[]): Promise<void>;
  getNoteTemplates(): Promise<NoteTemplate[]>;
  setNoteTemplates(templates: NoteTemplate[]): Promise<void>;
  getTaskNotes(): Promise<TaskNote[]>;
  setTaskNotes(notes: TaskNote[]): Promise<void>;
  getDailyGoal(): Promise<DailyGoal | null>;
  setDailyGoal(goal: DailyGoal): Promise<void>;
  getGoalAchievements(): Promise<DailyGoalAchievement[]>;
  setGoalAchievements(achievements: DailyGoalAchievement[]): Promise<void>;

  // Backup and migration
  createBackup(key: string): Promise<void>;
  needsMigration(key: string): Promise<boolean>;
}

export class StorageService implements IStorageService {
  private static instance: StorageService;

  constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /** Kept in appdata.json (desktop app) rather than localStorage. */
  private usesAppRecords(key: string): key is AppRecordKey {
    return appRecordsActive() && isAppRecordKey(key);
  }

  /** A record from the records cache, validated like a localStorage read. */
  private readRecord<T>(key: AppRecordKey, defaultValue: T, schema?: z.ZodType<T>): T {
    let data = readAppRecord(key);
    if (data === undefined) return defaultValue;
    // Plain data is stored; tolerate a version wrapper restored from old data
    if (data && typeof data === 'object' && typeof (data as { version?: unknown }).version === 'number' && 'data' in data) {
      data = (data as { data: unknown }).data;
    }
    if (!schema) return data as T;

    const validationResult = validateWithSchema(schema, data);
    if (!validationResult.success) {
      console.error(`Validation failed for key "${key}":`, validationResult.error);
      throw createStorageError('STORAGE_VALIDATION_FAILED',
        `Data validation failed for key "${key}": ${validationResult.error}`,
        { key, validationError: validationResult.error }
      );
    }
    return validationResult.data!;
  }

  /**
   * Generic method to get data from localStorage with validation and migration
   */
  async getItem<T>(
    key: string,
    defaultValue: T,
    schema?: z.ZodType<T>
  ): Promise<T> {
    if (this.usesAppRecords(key)) {
      return this.readRecord(key, defaultValue, schema);
    }
    try {
      const item = localStorage.getItem(key);

      // If key is not found in localStorage, return defaultValue immediately
      if (item === null) {
        return defaultValue;
      }

      let parsedData = JSON.parse(item);

      // Return early if no migration is required
      if (parsedData === null || !needsMigration(parsedData)) {
        if (parsedData !== null && parsedData.version) {
          // Data is already versioned, extract the actual data
          parsedData = parsedData.data;
        }

        // Validate data if schema provided
        if (schema) {
          const validationResult = validateWithSchema(schema, parsedData);
          if (!validationResult.success) {
            console.error(`Validation failed for key "${key}":`, validationResult.error);
            throw createStorageError('STORAGE_VALIDATION_FAILED',
              `Data validation failed for key "${key}": ${validationResult.error}`,
              { key, validationError: validationResult.error }
            );
          }
          return validationResult.data!;
        }

        return parsedData;
      }

      // Create backup before migration
      await this.createBackup(key);

      // Migrate data
      const migratedData = migrateData(key, parsedData);

      // Save migrated data back to localStorage
      localStorage.setItem(key, JSON.stringify(migratedData));

      // Extract actual data from versioned structure
      parsedData = migratedData.version ? migratedData.data : migratedData;

      // Validate data if schema provided
      if (schema) {
        const validationResult = validateWithSchema(schema, parsedData);
        if (!validationResult.success) {
          console.error(`Validation failed for key "${key}":`, validationResult.error);
          throw createStorageError('STORAGE_VALIDATION_FAILED',
            `Data validation failed for key "${key}": ${validationResult.error}`,
            { key, validationError: validationResult.error }
          );
        }
        return validationResult.data!;
      }

      return parsedData;
    } catch (error) {
      if (error instanceof StorageErrorClass) {
        throw error;
      }

      console.error(`Failed to get item from localStorage for key "${key}":`, error);
      throw createStorageError('STORAGE_READ_FAILED',
        `Failed to read data for key "${key}"`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Generic method to set data in localStorage with validation
   */
  async setItem<T>(
    key: string, 
    value: T, 
    schema?: z.ZodType<T>
  ): Promise<void> {
    try {
      // Validate data if schema provided
      if (schema) {
        const validationResult = validateWithSchema(schema, value);
        if (!validationResult.success) {
          throw createStorageError('STORAGE_VALIDATION_FAILED', 
            `Data validation failed for key "${key}": ${validationResult.error}`, 
            { key, validationError: validationResult.error }
          );
        }
      }

      if (this.usesAppRecords(key)) {
        await writeAppRecord(key, value);
        return;
      }

      const serializedValue = JSON.stringify(value);
      localStorage.setItem(key, serializedValue);
    } catch (error) {
      if (error instanceof StorageErrorClass) {
        throw error;
      }
      
      console.error(`Failed to save data for key "${key}":`, error);
      throw createStorageError('STORAGE_WRITE_FAILED', 
        `Failed to write data for key "${key}"`, 
        { key, originalError: error }
      );
    }
  }

  /**
   * Remove item from localStorage
   */
  async removeItem(key: string): Promise<void> {
    try {
      if (this.usesAppRecords(key)) {
        await writeAppRecord(key, null);
        return;
      }
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove data for key "${key}":`, error);
      throw createStorageError('STORAGE_DELETE_FAILED', 
        `Failed to delete data for key "${key}"`, 
        { key, originalError: error }
      );
    }
  }

  /**
   * Clear all localStorage data
   */
  async clear(): Promise<void> {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      throw createStorageError('STORAGE_CLEAR_FAILED', 
        'Failed to clear all storage data', 
        { originalError: error }
      );
    }
  }

  // Typed storage operations

  async getTimeEntries(): Promise<TimeEntry[]> {
    const entries = await this.getItem(
      STORAGE_KEYS.TIME_ENTRIES, 
      [], 
      z.array(TimeEntrySchema)
    );
    
    // Convert stored entries back to proper Date objects
    return entries.map(entry => ({
      ...entry,
      startTime: new Date(entry.startTime),
      endTime: entry.endTime ? new Date(entry.endTime) : undefined,
    }));
  }

  async setTimeEntries(entries: TimeEntry[]): Promise<void> {
    await this.setItem(
      STORAGE_KEYS.TIME_ENTRIES, 
      entries, 
      z.array(TimeEntrySchema)
    );
  }

  async getTasks(): Promise<Task[]> {
    return await this.getItem(
      STORAGE_KEYS.PREDEFINED_TASKS,
      [],
      z.array(TaskSchema)
    );
  }

  async setTasks(tasks: Task[]): Promise<void> {
    await this.setItem(
      STORAGE_KEYS.PREDEFINED_TASKS,
      tasks,
      z.array(TaskSchema)
    );
  }

  async getNoteTemplates(): Promise<NoteTemplate[]> {
    return await this.getItem(
      STORAGE_KEYS.NOTE_TEMPLATES,
      [],
      z.array(NoteTemplateSchema)
    );
  }

  async setNoteTemplates(templates: NoteTemplate[]): Promise<void> {
    await this.setItem(
      STORAGE_KEYS.NOTE_TEMPLATES,
      templates,
      z.array(NoteTemplateSchema)
    );
  }

  async getTaskNotes(): Promise<TaskNote[]> {
    if (this.usesAppRecords(STORAGE_KEYS.TASK_NOTES)) {
      return this.readRecord(STORAGE_KEYS.TASK_NOTES, [], z.array(TaskNoteSchema));
    }
    try {
      const item = localStorage.getItem(STORAGE_KEYS.TASK_NOTES);

      // If key is not found in localStorage, return empty array
      if (item === null) {
        return [];
      }

      let parsedData = JSON.parse(item);

      // Return early if no migration is required
      if (parsedData === null || !needsMigration(parsedData)) {
        if (parsedData !== null && parsedData.version) {
          parsedData = parsedData.data;
        }

        // Validate data
        const validationResult = validateWithSchema(z.array(TaskNoteSchema), parsedData);
        if (!validationResult.success) {
          console.error(`Validation failed for task notes:`, validationResult.error);
          throw createStorageError('STORAGE_VALIDATION_FAILED',
            `Data validation failed for key "${STORAGE_KEYS.TASK_NOTES}": ${validationResult.error}`,
            { key: STORAGE_KEYS.TASK_NOTES, validationError: validationResult.error }
          );
        }

        return validationResult.data!;
      }

      // Create backup before migration
      await this.createBackup(STORAGE_KEYS.TASK_NOTES);

      // Migrate task notes with archive fields
      const migratedData = migrateTaskNotes(parsedData);

      // Save migrated data back to localStorage
      localStorage.setItem(STORAGE_KEYS.TASK_NOTES, JSON.stringify(migratedData));

      // Extract actual data from versioned structure
      parsedData = migratedData.version ? migratedData.data : migratedData;

      // Validate data
      const validationResult = validateWithSchema(z.array(TaskNoteSchema), parsedData);
      if (!validationResult.success) {
        console.error(`Validation failed for task notes:`, validationResult.error);
        throw createStorageError('STORAGE_VALIDATION_FAILED',
          `Data validation failed for key "${STORAGE_KEYS.TASK_NOTES}": ${validationResult.error}`,
          { key: STORAGE_KEYS.TASK_NOTES, validationError: validationResult.error }
        );
      }

      return validationResult.data!;
    } catch (error) {
      if (error instanceof StorageErrorClass) {
        throw error;
      }

      console.error(`Failed to get task notes:`, error);
      throw createStorageError('STORAGE_READ_FAILED',
        `Failed to read data for key "${STORAGE_KEYS.TASK_NOTES}"`,
        { key: STORAGE_KEYS.TASK_NOTES, originalError: error }
      );
    }
  }

  async setTaskNotes(notes: TaskNote[]): Promise<void> {
    await this.setItem(
      STORAGE_KEYS.TASK_NOTES,
      notes,
      z.array(TaskNoteSchema)
    );
  }

  async getDailyGoal(): Promise<DailyGoal | null> {
    return await this.getItem(
      STORAGE_KEYS.DAILY_GOAL,
      null,
      DailyGoalSchema.nullable()
    );
  }

  async setDailyGoal(goal: DailyGoal): Promise<void> {
    await this.setItem(
      STORAGE_KEYS.DAILY_GOAL,
      goal,
      DailyGoalSchema
    );
  }

  async getGoalAchievements(): Promise<DailyGoalAchievement[]> {
    return await this.getItem(
      STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
      [],
      z.array(DailyGoalAchievementSchema)
    );
  }

  async setGoalAchievements(achievements: DailyGoalAchievement[]): Promise<void> {
    await this.setItem(
      STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS,
      achievements,
      z.array(DailyGoalAchievementSchema)
    );
  }

  // Session data lives in the Rust backend (sessions.json); the legacy
  // localStorage copies of sessions/timer instances were removed with
  // SessionService.

  async createBackup(key: string): Promise<void> {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        createBackup(key, JSON.parse(data));
      }
    } catch (error) {
      console.error(`Failed to create backup for key "${key}":`, error);
      throw createStorageError('STORAGE_BACKUP_FAILED', 
        `Failed to create backup for key "${key}"`, 
        { key, originalError: error }
      );
    }
  }

  async needsMigration(key: string): Promise<boolean> {
    try {
      const item = localStorage.getItem(key);
      if (!item) return false;
      
      const parsedData = JSON.parse(item);
      return needsMigration(parsedData);
    } catch (error) {
      console.error(`Failed to check migration status for key "${key}":`, error);
      return false;
    }
  }
}
