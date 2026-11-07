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
      expect(new Date(archived.updatedAt).getTime()).toBeGreaterThan(new Date(baseTask.updatedAt).getTime());

      const savedTasks = vi.mocked(mockStorageService.setTasks).mock.calls[0][0];
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0]).toMatchObject({ id: 'task1', isArchived: true });
    });

    it('should unarchive a task, clearing archivedAt', async () => {
      mockStorageService.getTasks = vi
        .fn()
        .mockResolvedValue([{ ...baseTask, isArchived: true, archivedAt: '2023-02-01T00:00:00.000Z' }]);

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
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([{ ...baseTask }, { ...otherTask, isFavorite: true }]);
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

    it('puts a deleted task back at its old place', async () => {
      const other: Task = { ...baseTask, id: 'task2', name: 'Other' };
      const third: Task = { ...baseTask, id: 'task3', name: 'Third' };
      mockStorageService.getTasks = vi.fn().mockResolvedValue([other, third]);

      await service.restoreTask(baseTask, 1);

      expect(mockStorageService.setTasks).toHaveBeenCalledWith([other, baseTask, third]);
    });

    it("won't restore a task that's back already or whose name was taken since", async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);
      await expect(service.restoreTask(baseTask, 0)).rejects.toThrow(/already back/);

      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask, id: 'new-id' }]);
      await expect(service.restoreTask(baseTask, 0)).rejects.toMatchObject({ code: 'TASK_DUPLICATE_NAME' });
      expect(mockStorageService.setTasks).not.toHaveBeenCalled();
    });

    it("says so when the tasks can't be read", async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorageService.getTasks = vi.fn().mockRejectedValue(new Error('failure'));
      await expect(service.getAllTasks()).rejects.toMatchObject({
        code: 'TASK_NOT_FOUND',
        message: 'Failed to retrieve tasks',
      });
    });

    it('reports a save that failed as such', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask }]);
      mockStorageService.setTasks = vi.fn().mockRejectedValue(new Error('disk full'));
      await expect(service.createTask({ name: 'New' })).rejects.toMatchObject({ code: 'TASK_CREATE_FAILED' });
      await expect(service.updateTask('task1', { hourlyRate: 5 })).rejects.toMatchObject({
        code: 'TASK_UPDATE_FAILED',
      });
      await expect(service.deleteTask('task1')).rejects.toMatchObject({ code: 'TASK_DELETE_FAILED' });
    });
  });

  describe('creating and changing tasks', () => {
    beforeEach(() => {
      // As stored: a fresh copy on each read
      mockStorageService.getTasks = vi.fn(async () => [
        { ...baseTask },
        { ...baseTask, id: 'task2', name: 'Other Task' },
      ]);
    });

    it('creates a task with a trimmed name and an id of its own', async () => {
      const task = await service.createTask({ name: '  Review  ', hourlyRate: 40 });
      expect(task).toMatchObject({ name: 'Review', hourlyRate: 40, id: expect.stringMatching(/^task_/) });
      expect(vi.mocked(mockStorageService.setTasks).mock.calls[0][0]).toHaveLength(3);
    });

    it('renames a task to a trimmed name not already taken, and leaves the name alone otherwise', async () => {
      expect((await service.updateTask('task1', { name: ' Renamed ' })).name).toBe('Renamed');
      expect((await service.updateTask('task1', { hourlyRate: 60 })).name).toBe('Existing Task');
      expect((await service.updateTask('task1', { name: 'Existing Task' })).name).toBe('Existing Task');
      await expect(service.updateTask('task1', { name: 'other task' })).rejects.toMatchObject({
        code: 'TASK_DUPLICATE_NAME',
      });
      await expect(service.updateTask('task1', { hourlyRate: -1 })).rejects.toMatchObject({
        code: 'TASK_VALIDATION_FAILED',
      });
    });

    it('checks the rate and the default note template', async () => {
      const errors = async (task: Partial<Task>) => (await service.validateTask({ name: 'Ok', ...task })).errors;
      expect(await errors({ hourlyRate: 1001 })).toEqual(['Hourly rate cannot exceed $1000']);
      expect(await errors({ hourlyRate: '12' as never })).toEqual(['Hourly rate must be a positive number']);
      expect(await errors({ defaultNoteTemplateId: '  ' })).toEqual([
        'Default note template ID must be a valid string',
      ]);
      expect(await errors({ defaultNoteTemplateId: 'tmpl', hourlyRate: 20 })).toEqual([]);
      expect(await errors({ name: 'x'.repeat(101) })).toEqual(['Task name cannot exceed 100 characters']);
    });

    it("treats a name as taken when the tasks can't be read", async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorageService.getTasks = vi.fn().mockRejectedValue(new Error('failure'));
      expect(await service.isTaskNameUnique('Anything')).toBe(false);
    });
  });

  describe('legacy favorites, as older versions left them', () => {
    beforeEach(() => {
      window.localStorage.clear();
      mockStorageService.getTasks = vi.fn().mockResolvedValue([{ ...baseTask, isFavorite: true }]);
    });

    it('reads an unversioned list, and drops it when there is nothing new to carry over', async () => {
      window.localStorage.setItem('favoriteTasks', JSON.stringify({ favoriteTaskIds: ['task1', 7] }));
      await service.getAllTasks();
      expect(mockStorageService.setTasks).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('favoriteTasks')).toBeNull();
    });

    it("drops a list it can't read", async () => {
      window.localStorage.setItem('favoriteTasks', 'not json');
      expect(await service.getAllTasks()).toEqual([{ ...baseTask, isFavorite: true }]);
      expect(window.localStorage.getItem('favoriteTasks')).toBeNull();
    });

    it("leaves the tasks as they are when localStorage can't be read", async () => {
      vi.mocked(window.localStorage.getItem).mockImplementationOnce(() => {
        throw new Error('SecurityError');
      });
      expect(await service.getAllTasks()).toEqual([{ ...baseTask, isFavorite: true }]);
    });
  });
});
