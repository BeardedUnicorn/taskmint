/**
 * TaskService Tests
 *
 * Tests validation, name uniqueness, archiving, the favorites migration,
 * and CRUD error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../TaskService';
import { IStorageService } from '../StorageService';
import { Task } from '../../types/task';

describe('TaskService', () => {
  let service: TaskService;
  let mockStorageService: IStorageService;

  const baseTask: Task = {
    id: 'task1',
    name: 'Existing Task',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Minimal mock storage service
    mockStorageService = {
      getTasks: vi.fn().mockResolvedValue([]),
      setTasks: vi.fn().mockResolvedValue(undefined),
    } as unknown as IStorageService;

    service = new TaskService(mockStorageService);
  });

  describe('validation logic', () => {
    it('should return validation errors for invalid task data', async () => {
      const result = await service.validateTask({ hourlyRate: -5 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Task name is required');
      expect(result.errors).toContain('Hourly rate must be a positive number');
    });
  });

  describe('name uniqueness', () => {
    it('should detect duplicate task names', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);

      expect(await service.isTaskNameUnique('New Task')).toBe(true);
      expect(await service.isTaskNameUnique('Existing Task')).toBe(false);
    });
  });

  describe('archiving', () => {
    it('should archive a task, stamping archivedAt and bumping updatedAt', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask }]);

      const archived = await service.archiveTask('task1');

      expect(archived.isArchived).toBe(true);
      expect(archived.archivedAt).toEqual(expect.any(String));
      expect(new Date(archived.archivedAt as string).getTime()).not.toBeNaN();
      expect(new Date(archived.updatedAt).getTime()).toBeGreaterThan(
        new Date(baseTask.updatedAt).getTime()
      );

      const savedTasks = vi.mocked(mockStorageService.setTasks).mock.calls[0][0];
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0]).toMatchObject({ id: 'task1', isArchived: true });
    });

    it('should unarchive a task, clearing archivedAt', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([
        { ...baseTask, isArchived: true, archivedAt: '2023-02-01T00:00:00.000Z' },
      ]);

      const unarchived = await service.unarchiveTask('task1');

      expect(unarchived.isArchived).toBe(false);
      expect(unarchived.archivedAt).toBeNull();
    });

    it('should keep an archived task retrievable via getAllTasks', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask }]);
      await service.archiveTask('task1');

      const savedTasks = vi.mocked(mockStorageService.setTasks).mock.calls[0][0];
      mockStorageService.getTasks = vi.fn().mockResolvedValue(savedTasks);

      const allTasks = await service.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0]).toMatchObject({ id: 'task1', isArchived: true });
    });

    it('should reject archiving a non-existent task', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([]);
      await expect(service.archiveTask('missing')).rejects.toMatchObject({
        code: 'TASK_NOT_FOUND',
      });
    });
  });

  describe('legacy favorites migration', () => {
    const otherTask: Task = { ...baseTask, id: 'task2', name: 'Other Task' };

    beforeEach(() => {
      window.localStorage.clear();
    });

    const storeLegacyFavorites = (ids: string[]) =>
      window.localStorage.setItem(
        'favoriteTasks',
        JSON.stringify({ version: 1, data: { favoriteTaskIds: ids, maxRecentTasks: 5 } })
      );

    it('moves the old favorites list onto the tasks once, then removes it', async () => {
      storeLegacyFavorites(['task2']);
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask }, { ...otherTask }]);

      const tasks = await service.getAllTasks();

      expect(tasks.find(t => t.id === 'task2')?.isFavorite).toBe(true);
      expect(tasks.find(t => t.id === 'task1')?.isFavorite).toBeFalsy();
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([
        { ...baseTask },
        { ...otherTask, isFavorite: true },
      ]);
      expect(window.localStorage.getItem('favoriteTasks')).toBeNull();
    });

    it('does nothing when there is no old favorites list', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask }]);

      await service.getAllTasks();

      expect(mockStorageService.setTasks).not.toHaveBeenCalled();
    });

    it('keeps the old list to retry when saving the tasks fails', async () => {
      storeLegacyFavorites(['task1']);
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask }]);
      mockStorageService.setTasks = vi.fn().mockRejectedValue(new Error('disk full'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const tasks = await service.getAllTasks();

      expect(tasks[0].isFavorite).toBeFalsy();
      expect(window.localStorage.getItem('favoriteTasks')).not.toBeNull();
    });
  });

  describe('CRUD error handling', () => {
    it('should reject creating task when validation fails', async () => {
      await expect(service.createTask({ name: '' } as any)).rejects.toMatchObject({
        code: 'TASK_VALIDATION_FAILED',
        message: expect.stringContaining('Task name is required'),
      });
    });

    it('should reject creating task with duplicate name', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);
      await expect(service.createTask({ name: 'Existing Task' } as any)).rejects.toMatchObject({
        code: 'TASK_DUPLICATE_NAME',
        message: 'A task with the name "Existing Task" already exists',
      });
    });

    it('should reject updating non-existent task', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([]);
      await expect(service.updateTask('missing', { name: 'Updated' })).rejects.toMatchObject({
        code: 'TASK_NOT_FOUND',
      });
    });

    it('deletes just that task, keeping the others (and any parentId they carry)', async () => {
      const child: Task = { ...baseTask, id: 'task2', name: 'Child', parentId: 'task1' };
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask, child]);

      await service.deleteTask('task1');

      expect(mockStorageService.setTasks).toHaveBeenCalledWith([child]);
    });

    it('should reject deleting a task that does not exist', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);

      await expect(service.deleteTask('missing')).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
      expect(mockStorageService.setTasks).not.toHaveBeenCalled();
    });

    it('should throw when getTask encounters storage error', async () => {
      mockStorageService.getTasks = vi.fn().mockRejectedValue(new Error('failure'));
      await expect(service.getTask('task1')).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });
  });
});

