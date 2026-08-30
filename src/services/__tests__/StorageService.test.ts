/**
 * StorageService Tests
 *
 * Verifies persistence and error handling for tasks, sessions, notes, and subscription data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../StorageService';
import { STORAGE_KEYS } from '../../constants';
import { Task } from '../../types/task';
import { TaskNote } from '../../types/notes';
import { SUBSCRIPTION_SKUS, UserSubscriptionSchema } from '../../types/subscription';
import { StorageErrorClass } from '../../types/errors';

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
      // The schema materializes isArchived on read (the archiving backfill)
      expect(result).toEqual([{ ...tasks[0], isArchived: false }]);
    });

    it('should return empty array when key is missing', async () => {
      const result = await service.getTasks();
      expect(result).toEqual([]);
    });

    it('should throw StorageError on invalid JSON', async () => {
      localStorage.setItem(STORAGE_KEYS.PREDEFINED_TASKS, 'not-json');
      await expect(service.getTasks()).rejects.toBeInstanceOf(StorageErrorClass);
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

  describe('subscription data persistence', () => {
    it('should persist and retrieve subscription data', async () => {
      const sub = { sku: SUBSCRIPTION_SKUS.PRO, activatedAt: '2023-01-01T00:00:00.000Z' };
      await service.setItem(STORAGE_KEYS.USER_SUBSCRIPTION, sub, UserSubscriptionSchema);
      const result = await service.getItem(
        STORAGE_KEYS.USER_SUBSCRIPTION,
        { sku: SUBSCRIPTION_SKUS.FREE, activatedAt: 'default' },
        UserSubscriptionSchema
      );
      expect(result).toEqual(sub);
    });

    it('should return default value when key is missing', async () => {
      const def = { sku: SUBSCRIPTION_SKUS.FREE, activatedAt: 'default' };
      const result = await service.getItem(STORAGE_KEYS.USER_SUBSCRIPTION, def, UserSubscriptionSchema);
      expect(result).toEqual(def);
    });

    it('should throw StorageError on invalid JSON', async () => {
      localStorage.setItem(STORAGE_KEYS.USER_SUBSCRIPTION, 'invalid');
      await expect(
        service.getItem(
          STORAGE_KEYS.USER_SUBSCRIPTION,
          { sku: SUBSCRIPTION_SKUS.FREE, activatedAt: 'x' },
          UserSubscriptionSchema
        )
      ).rejects.toBeInstanceOf(StorageErrorClass);
    });
  });
});

