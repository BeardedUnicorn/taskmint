/**
 * Error types thrown by the task and storage services. Both are real `Error`s,
 * so callers can read `.message` the same way as any other failure.
 */

export type TaskErrorCode =
  | 'TASK_CREATE_FAILED'
  | 'TASK_UPDATE_FAILED'
  | 'TASK_DELETE_FAILED'
  | 'TASK_NOT_FOUND'
  | 'TASK_DUPLICATE_NAME'
  | 'TASK_VALIDATION_FAILED';

export type StorageErrorCode = 'STORAGE_WRITE_FAILED' | 'STORAGE_VALIDATION_FAILED';

export class TaskErrorClass extends Error {
  readonly category = 'task' as const;
  readonly code: TaskErrorCode;
  readonly details?: unknown;
  readonly operation?: string;
  readonly timestamp = new Date();

  constructor(code: TaskErrorCode, message: string, details?: unknown, operation?: string) {
    super(message);
    this.name = 'TaskError';
    this.code = code;
    this.details = details;
    this.operation = operation;
  }
}

export class StorageErrorClass extends Error {
  readonly category = 'storage' as const;
  readonly code: StorageErrorCode;
  readonly details?: unknown;
  readonly operation?: string;
  readonly timestamp = new Date();

  constructor(code: StorageErrorCode, message: string, details?: unknown, operation?: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
    this.operation = operation;
  }
}

export function createStorageError(
  code: StorageErrorCode,
  message: string,
  details?: unknown,
  operation?: string
): StorageErrorClass {
  return new StorageErrorClass(code, message, details, operation);
}

export function createTaskError(
  code: TaskErrorCode,
  message: string,
  details?: unknown,
  operation?: string
): TaskErrorClass {
  return new TaskErrorClass(code, message, details, operation);
}
