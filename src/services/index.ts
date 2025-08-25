/**
 * Services Index
 *
 * Central export file for all application services
 * Provides singleton instances and service interfaces
 */

import { SessionService } from './SessionService';
import { TaskService } from './TaskService';
import { StorageService } from './StorageService';
import { NoteTemplateService } from './NoteTemplateService';
import { TaskNotesService } from './TaskNotesService';

export { SessionService } from './SessionService';
export { TaskService } from './TaskService';
export { StorageService } from './StorageService';
export { NoteTemplateService } from './NoteTemplateService';
export { TaskNotesService } from './TaskNotesService';

// Service interfaces for dependency injection
export type { ISessionService } from './SessionService';
export type { ITaskService } from './TaskService';
export type { IStorageService } from './StorageService';
export type { ITaskNotesService } from './TaskNotesService';

// Service factory for getting singleton instances
export class ServiceFactory {
  private static storageService: StorageService;
  private static sessionService: SessionService;
  private static taskService: TaskService;
  private static noteTemplateService: NoteTemplateService;
  private static taskNotesService: TaskNotesService;

  static getStorageService(): StorageService {
    if (!ServiceFactory.storageService) {
      ServiceFactory.storageService = new StorageService();
    }
    return ServiceFactory.storageService;
  }

  static getSessionService(): SessionService {
    if (!ServiceFactory.sessionService) {
      ServiceFactory.sessionService = new SessionService();
    }
    return ServiceFactory.sessionService;
  }

  static getTaskService(): TaskService {
    if (!ServiceFactory.taskService) {
      ServiceFactory.taskService = new TaskService(
        ServiceFactory.getStorageService()
      );
    }
    return ServiceFactory.taskService;
  }

  static getNoteTemplateService(): NoteTemplateService {
    if (!ServiceFactory.noteTemplateService) {
      ServiceFactory.noteTemplateService = NoteTemplateService.getInstance();
    }
    return ServiceFactory.noteTemplateService;
  }

  static getTaskNotesService(): TaskNotesService {
    if (!ServiceFactory.taskNotesService) {
      ServiceFactory.taskNotesService = TaskNotesService.getInstance();
    }
    return ServiceFactory.taskNotesService;
  }

  // Reset all services (useful for testing)
  static resetServices(): void {
    ServiceFactory.storageService = undefined as any;
    ServiceFactory.sessionService = undefined as any;
    ServiceFactory.taskService = undefined as any;
    ServiceFactory.noteTemplateService = undefined as any;
    ServiceFactory.taskNotesService = undefined as any;
  }
}
