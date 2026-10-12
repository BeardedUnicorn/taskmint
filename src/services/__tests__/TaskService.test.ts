/**
 * TaskService Tests
 *
 * Tests validation, name uniqueness, hierarchy operations,
 * and CRUD error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../TaskService';
import { IStorageService } from '../StorageService';
import { Task } from '../../types/task';
import * as hierarchyUtils from '../../utils/taskHierarchy';

// Mock task hierarchy utilities
vi.mock('../../utils/taskHierarchy', () => ({
  buildTaskHierarchy: vi.fn(),
  getChildTasks: vi.fn(),
  getParentTask: vi.fn(),
  getTaskPath: vi.fn(),
  canDeleteTask: vi.fn(),
  prepareTaskDeletion: vi.fn(),
  validateTaskHierarchy: vi.fn(),
  getNextChildOrder: vi.fn(),
}));

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
      getTimeEntries: vi.fn().mockResolvedValue([]),
      setTimeEntries: vi.fn().mockResolvedValue(undefined),
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

  describe('hierarchy operations', () => {
    it('should return task hierarchy using utility function', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);
      const mockHierarchy = [{ task: baseTask, children: [], depth: 0, path: [] }];
      vi.mocked(hierarchyUtils.buildTaskHierarchy).mockReturnValue(mockHierarchy as any);

      const result = await service.getTaskHierarchy();

      expect(hierarchyUtils.buildTaskHierarchy).toHaveBeenCalledWith([baseTask]);
      expect(result).toEqual(mockHierarchy);
    });

    it('should throw when moving task creates invalid hierarchy', async () => {
      const tasks = [baseTask];
      mockStorageService.getTasks = vi.fn().mockResolvedValue(tasks);
      vi.mocked(hierarchyUtils.validateTaskHierarchy).mockReturnValue(false);
      const updateSpy = vi.spyOn(service, 'updateTask');

      await expect(service.moveTask('task1', 'parent')).rejects.toMatchObject({
        code: 'TASK_UPDATE_FAILED',
      });
      expect(hierarchyUtils.validateTaskHierarchy).toHaveBeenCalledWith(tasks, 'task1', 'parent');
      expect(updateSpy).not.toHaveBeenCalled();
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
        code: 'TASK_UPDATE_FAILED',
      });
    });
  });

  describe('CRUD error handling', () => {
    it('should reject creating task when validation fails', async () => {
      await expect(service.createTask({ name: '' } as any)).rejects.toMatchObject({
        code: 'TASK_CREATE_FAILED',
      });
    });

    it('should reject creating task with duplicate name', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);
      await expect(service.createTask({ name: 'Existing Task' } as any)).rejects.toMatchObject({
        code: 'TASK_CREATE_FAILED',
      });
    });

    it('should reject updating non-existent task', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([]);
      await expect(service.updateTask('missing', { name: 'Updated' })).rejects.toMatchObject({
        code: 'TASK_UPDATE_FAILED',
      });
    });

    it('should reject deleting task when deletion is prevented', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);
      vi.mocked(hierarchyUtils.canDeleteTask).mockReturnValue({ canDelete: false, reason: 'Cannot delete' });
      const prepareSpy = vi.mocked(hierarchyUtils.prepareTaskDeletion);

      await expect(service.deleteTask('task1', 'prevent')).rejects.toMatchObject({
        code: 'TASK_DELETE_FAILED',
      });
      expect(hierarchyUtils.canDeleteTask).toHaveBeenCalled();
      expect(prepareSpy).not.toHaveBeenCalled();
    });

    it('orphans child tasks by default instead of refusing the delete', async () => {
      mockStorageService.getTasks = vi.fn().mockResolvedValue([baseTask]);
      vi.mocked(hierarchyUtils.canDeleteTask).mockReturnValue({ canDelete: true });
      vi.mocked(hierarchyUtils.prepareTaskDeletion).mockReturnValue({
        tasksToDelete: ['task1'],
        tasksToUpdate: [],
      });

      await service.deleteTask('task1');

      expect(hierarchyUtils.canDeleteTask).toHaveBeenCalledWith(expect.any(Array), 'task1', 'orphan');
      expect(hierarchyUtils.prepareTaskDeletion).toHaveBeenCalledWith(expect.any(Array), 'task1', 'orphan');
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([]);
    });

    it('should throw when getTask encounters storage error', async () => {
      mockStorageService.getTasks = vi.fn().mockRejectedValue(new Error('failure'));
      await expect(service.getTask('task1')).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });
  });
});

