/**
 * Service singletons.
 */

import { TaskService } from './TaskService';
import { StorageService } from './StorageService';

export class ServiceFactory {
  private static taskService: TaskService | undefined;

  static getTaskService(): TaskService {
    ServiceFactory.taskService ??= new TaskService(StorageService.getInstance());
    return ServiceFactory.taskService;
  }
}
