/**
 * Storage Service
 *
 * Centralized storage management with validation, migration, and error handling
 * Provides a unified interface for all data persistence operations
 *
 * The records (tasks, notes, note templates, the daily goal and its history,
 * withdrawals)
 * belong to the backend and are read through the records cache
 * (services/appRecords); every other key is a device setting in localStorage
 * (utils/localStore).
 */

import { z } from 'zod';
import { Task, TaskSchema } from '../types/task';
import { NoteTemplate, TaskNote, NoteTemplateSchema, TaskNoteSchema } from '../types/notes';
import { DailyGoal, DailyGoalAchievement, DailyGoalSchema, DailyGoalAchievementSchema } from '../types/goal';
import { Withdrawal, WithdrawalListSchema } from '../types/withdrawal';

import { STORAGE_KEYS } from '../constants';
import { readLocal, writeLocal } from '../utils/localStore';
import { validateWithSchema } from '../utils/validation';
import { createStorageError } from '../types/errors';
import { AppRecordKey, isAppRecordKey, readAppRecord, writeAppRecord } from './appRecords';

export interface IStorageService {
  // Generic storage operations
  getItem<T>(key: string, defaultValue: T, schema: z.ZodType<T>): Promise<T>;
  setItem<T>(key: string, value: T, schema: z.ZodType<T>): Promise<void>;

  // Typed storage operations
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
  getWithdrawals(): Promise<Withdrawal[]>;
  setWithdrawals(withdrawals: Withdrawal[]): Promise<void>;
}

export class StorageService implements IStorageService {
  private static instance: StorageService;

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /** `data` checked against `schema`; a value that fails is refused, not repaired. */
  private validated<T>(key: string, data: unknown, schema: z.ZodType<T>): T {
    const validationResult = validateWithSchema(schema, data);
    if (!validationResult.success) {
      console.error(`Validation failed for key "${key}":`, validationResult.error);
      throw createStorageError(
        'STORAGE_VALIDATION_FAILED',
        `Data validation failed for key "${key}": ${validationResult.error}`,
        { key, validationError: validationResult.error }
      );
    }
    return validationResult.data!;
  }

  /** A record from the records cache, validated like a localStorage read. */
  private readRecord<T>(key: AppRecordKey, defaultValue: T, schema: z.ZodType<T>): T {
    let data = readAppRecord(key);
    if (data === undefined) return defaultValue;
    // Plain data is stored; tolerate a version wrapper restored from old data
    if (
      data &&
      typeof data === 'object' &&
      typeof (data as { version?: unknown }).version === 'number' &&
      'data' in data
    ) {
      data = (data as { data: unknown }).data;
    }
    return this.validated(key, data, schema);
  }

  /**
   * The value at `key`, checked against `schema`: a record, or a device
   * setting (`defaultValue` when there's none, or it can't be read).
   */
  async getItem<T>(key: string, defaultValue: T, schema: z.ZodType<T>): Promise<T> {
    if (isAppRecordKey(key)) {
      return this.readRecord(key, defaultValue, schema);
    }
    const data = readLocal<unknown>(key, undefined);
    return data === undefined ? defaultValue : this.validated(key, data, schema);
  }

  /** Saves `value` at `key` once `schema` accepts it. */
  async setItem<T>(key: string, value: T, schema: z.ZodType<T>): Promise<void> {
    this.validated(key, value, schema);
    if (!isAppRecordKey(key)) {
      writeLocal(key, value, undefined);
      return;
    }
    try {
      await writeAppRecord(key, value);
    } catch (error) {
      console.error(`Failed to save data for key "${key}":`, error);
      throw createStorageError('STORAGE_WRITE_FAILED', `Failed to write data for key "${key}"`, {
        key,
        originalError: error,
      });
    }
  }

  // Typed storage operations

  async getTasks(): Promise<Task[]> {
    return await this.getItem(STORAGE_KEYS.PREDEFINED_TASKS, [], z.array(TaskSchema));
  }

  async setTasks(tasks: Task[]): Promise<void> {
    await this.setItem(STORAGE_KEYS.PREDEFINED_TASKS, tasks, z.array(TaskSchema));
  }

  async getNoteTemplates(): Promise<NoteTemplate[]> {
    return await this.getItem(STORAGE_KEYS.NOTE_TEMPLATES, [], z.array(NoteTemplateSchema));
  }

  async setNoteTemplates(templates: NoteTemplate[]): Promise<void> {
    await this.setItem(STORAGE_KEYS.NOTE_TEMPLATES, templates, z.array(NoteTemplateSchema));
  }

  async getTaskNotes(): Promise<TaskNote[]> {
    return this.readRecord(STORAGE_KEYS.TASK_NOTES, [], z.array(TaskNoteSchema));
  }

  async setTaskNotes(notes: TaskNote[]): Promise<void> {
    await this.setItem(STORAGE_KEYS.TASK_NOTES, notes, z.array(TaskNoteSchema));
  }

  async getDailyGoal(): Promise<DailyGoal | null> {
    return await this.getItem(STORAGE_KEYS.DAILY_GOAL, null, DailyGoalSchema.nullable());
  }

  async setDailyGoal(goal: DailyGoal): Promise<void> {
    await this.setItem(STORAGE_KEYS.DAILY_GOAL, goal, DailyGoalSchema);
  }

  async getGoalAchievements(): Promise<DailyGoalAchievement[]> {
    return await this.getItem(STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS, [], z.array(DailyGoalAchievementSchema));
  }

  async setGoalAchievements(achievements: DailyGoalAchievement[]): Promise<void> {
    await this.setItem(STORAGE_KEYS.DAILY_GOAL_ACHIEVEMENTS, achievements, z.array(DailyGoalAchievementSchema));
  }

  async getWithdrawals(): Promise<Withdrawal[]> {
    return await this.getItem(STORAGE_KEYS.WITHDRAWALS, [], WithdrawalListSchema);
  }

  async setWithdrawals(withdrawals: Withdrawal[]): Promise<void> {
    await this.setItem(STORAGE_KEYS.WITHDRAWALS, withdrawals, WithdrawalListSchema);
  }
}
