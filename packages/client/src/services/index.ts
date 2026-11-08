/**
 * Service singletons.
 */

import { TaskService } from './TaskService';
import { StorageService } from './StorageService';

let taskService: TaskService | undefined;

export const ServiceFactory = {
  getTaskService(): TaskService {
    taskService ??= new TaskService(StorageService.getInstance());
    return taskService;
  },
};
