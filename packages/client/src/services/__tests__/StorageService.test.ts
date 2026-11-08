/**
 * StorageService Tests
 *
 * Verifies persistence and error handling for tasks, sessions, notes, and generic schema-validated data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { StorageService } from '../StorageService';
import { STORAGE_KEYS } from '../../constants';
import { Task } from '../../types/task';
import { TaskNote } from '../../types/notes';
import { StorageErrorClass } from '../../types/errors';
import { seedAppRecords } from '../../testing';

const service = StorageService.getInstance();

describe('StorageService', () => {
  beforeEach(() => {
    // Ensure clean slate before each test
    localStorage.clear();
  });

  describe('tasks persistence', () => {
    it('should persist and retrieve tasks', async () => {
      const now = new Date().toISOString();
      const tasks: Task[] = [
        {
          id: '1',
          name: 'Test Task',
          createdAt: now,
          updatedAt: now,
        },
      ];

      await service.setTasks(tasks);
      const result = await service.getTasks();
      // The schema materializes isArchived and isFavorite on read
      expect(result).toEqual([{ ...tasks[0], isArchived: false, isFavorite: false }]);
    });

    it('should return empty array when key is missing', async () => {
      const result = await service.getTasks();
      expect(result).toEqual([]);
    });

    it('should throw StorageError on a tasks record that is not a task list', async () => {
      seedAppRecords({ [STORAGE_KEYS.PREDEFINED_TASKS]: 'not-a-list' });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(service.getTasks()).rejects.toBeInstanceOf(StorageErrorClass);
      error.mockRestore();
    });
  });

  // Session persistence moved to the Rust backend (sessions.json); the
  // localStorage task-session methods were removed with SessionService.

  describe('notes persistence', () => {
    it('should persist and retrieve task notes', async () => {
      const now = new Date().toISOString();
      const notes: TaskNote[] = [
        {
          id: 'note1',
          taskId: 'task1',
          templateId: 'tpl1',
          templateName: 'Template',
          fieldValues: { field: 'value' },
          timeEntryId: null,
          sessionId: null,
          timerInstanceId: null,
          noteLevel: 'task',
          isArchived: false,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      await service.setTaskNotes(notes);
      const result = await service.getTaskNotes();
      expect(result).toEqual(notes);
    });

    it('should return empty array when key is missing', async () => {
      const result = await service.getTaskNotes();
      expect(result).toEqual([]);
    });
  });

  describe('schema-validated persistence', () => {
    const KEY = 'storageServiceTestRecord';
    const RecordSchema = z.object({ name: z.string(), count: z.number() });

    it('should persist and retrieve schema-validated data', async () => {
      const record = { name: 'saved', count: 3 };
      await service.setItem(KEY, record, RecordSchema);
      const result = await service.getItem(KEY, { name: 'default', count: 0 }, RecordSchema);
      expect(result).toEqual(record);
    });

    it('should return default value when key is missing', async () => {
      const def = { name: 'default', count: 0 };
      const result = await service.getItem(KEY, def, RecordSchema);
      expect(result).toEqual(def);
    });

    it("falls back to the default for a setting it can't read", async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(KEY, 'invalid');
      expect(await service.getItem(KEY, { name: 'x', count: 0 }, RecordSchema)).toEqual({ name: 'x', count: 0 });
      error.mockRestore();
    });

    it("refuses a setting the schema doesn't accept, stored or saved", async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(KEY, JSON.stringify({ version: 1, data: { name: 'saved' } }));
      await expect(service.getItem(KEY, { name: 'x', count: 0 }, RecordSchema)).rejects.toBeInstanceOf(
        StorageErrorClass
      );
      await expect(service.setItem(KEY, { name: 'x' } as never, RecordSchema)).rejects.toMatchObject({
        code: 'STORAGE_VALIDATION_FAILED',
      });
      error.mockRestore();
    });
  });

  describe('the daily goal', () => {
    const goal = {
      targetAmount: 200,
      currency: 'USD',
      isEnabled: true,
      lastNotifiedPercent: 0,
      lastNotificationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    it('saves the goal and its history as records', async () => {
      seedAppRecords({});
      await service.setDailyGoal(goal);
      expect(await service.getDailyGoal()).toEqual(goal);
      const achievement = {
        id: 'goal_2026-10-01',
        date: '2026-10-01',
        goalAmount: 200,
        earnedAmount: 250,
        currency: 'USD',
        percentageAchieved: 125,
        status: 'exceeded' as const,
        difference: 50,
        recordedAt: '2026-10-01T23:00:00.000Z',
      };
      await service.setGoalAchievements([achievement]);
      expect(await service.getGoalAchievements()).toEqual([achievement]);
    });
  });
});
