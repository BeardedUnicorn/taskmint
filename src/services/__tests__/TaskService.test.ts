import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../TaskService';
import { TaskErrorClass } from '../../types/errors';

// Mock StorageService interface

describe('TaskService error handling', () => {
  let taskService: TaskService;
  let mockStorageService: any;

  beforeEach(() => {
    mockStorageService = {
      getTasks: vi.fn(),
      setTasks: vi.fn(),
    };
    taskService = new TaskService(mockStorageService as any);
  });

  it('should wrap storage errors in TaskError when retrieving tasks', async () => {
    mockStorageService.getTasks.mockRejectedValue(new Error('Storage failure'));

    await expect(taskService.getAllTasks()).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
      category: 'task',
    });
  });

  it('should propagate TaskErrorClass thrown by storage service', async () => {
    const storageError = new TaskErrorClass('TASK_NOT_FOUND', 'failed');
    mockStorageService.getTasks.mockRejectedValue(storageError);
    await expect(taskService.getAllTasks()).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
      category: 'task',
    });
  });
});
