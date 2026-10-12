/**
 * StorageService Tests
 *
 * Verifies persistence and error handling for tasks, sessions, notes, and generic schema-validated data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { StorageService } from '../StorageService';
import { STORAGE_KEYS } from '../../constants';
import { Task } from '../../types/task';
import { TaskNote } from '../../types/notes';
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
      // The schema materializes isArchived and isFavorite on read
      expect(result).toEqual([{ ...tasks[0], isArchived: false, isFavorite: false }]);
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

    it('should throw StorageError on invalid JSON', async () => {
      localStorage.setItem(KEY, 'invalid');
      await expect(
        service.getItem(KEY, { name: 'x', count: 0 }, RecordSchema)
      ).rejects.toBeInstanceOf(StorageErrorClass);
    });
  });
});

