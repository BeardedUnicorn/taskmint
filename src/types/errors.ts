/**
 * Enhanced Error Type Definitions
 * 
 * This file contains comprehensive error type definitions for better error
 * categorization, handling, and debugging throughout the application.
 */

// Base error interface
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
  operation?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: ErrorCategory;
  userMessage?: string;
  technicalMessage?: string;
  suggestions?: string[];
  retryable: boolean;
}

// Error categories
export type ErrorCategory = 
  | 'timer'
  | 'task'
  | 'payout'
  | 'storage'
  | 'network'
  | 'validation'
  | 'authentication'
  | 'system'
  | 'ui'
  | 'migration'
  | 'backup'
  | 'tauri'
  | 'unknown';

// Timer-related errors
export interface TimerError extends AppError {
  category: 'timer';
  code: 
    | 'TIMER_START_FAILED'
    | 'TIMER_STOP_FAILED'
    | 'TIMER_SYNC_FAILED'
    | 'TIMER_STATE_INVALID'
    | 'TIMER_DURATION_INVALID'
    | 'TIMER_TASK_NOT_FOUND'
    | 'TIMER_ALREADY_RUNNING'
    | 'TIMER_NOT_RUNNING';
}

// Task management errors
export interface TaskError extends AppError {
  category: 'task';
  code:
    | 'TASK_CREATE_FAILED'
    | 'TASK_UPDATE_FAILED'
    | 'TASK_DELETE_FAILED'
    | 'TASK_DELETE_PREVENTED'
    | 'TASK_NOT_FOUND'
    | 'TASK_DUPLICATE_NAME'
    | 'TASK_INVALID_RATE'
    | 'TASK_VALIDATION_FAILED'
    | 'TASK_NAME_TOO_LONG'
    | 'TASK_NAME_EMPTY';
}



// Storage-related errors
export interface StorageError extends AppError {
  category: 'storage';
  code:
    | 'STORAGE_READ_FAILED'
    | 'STORAGE_WRITE_FAILED'
    | 'STORAGE_DELETE_FAILED'
    | 'STORAGE_QUOTA_EXCEEDED'
    | 'STORAGE_CORRUPTED'
    | 'STORAGE_UNAVAILABLE'
    | 'STORAGE_PERMISSION_DENIED'
    | 'STORAGE_MIGRATION_FAILED'
    | 'STORAGE_VALIDATION_FAILED'
    | 'STORAGE_CLEAR_FAILED'
    | 'STORAGE_BACKUP_FAILED';
}

// Network-related errors
export interface NetworkError extends AppError {
  category: 'network';
  code:
    | 'NETWORK_CONNECTION_FAILED'
    | 'NETWORK_TIMEOUT'
    | 'NETWORK_OFFLINE'
    | 'NETWORK_DNS_FAILED'
    | 'NETWORK_SSL_ERROR'
    | 'NETWORK_PROXY_ERROR'
    | 'NETWORK_RATE_LIMITED'
    | 'NETWORK_FORBIDDEN';
}

// Validation errors
export interface ValidationError extends AppError {
  category: 'validation';
  code:
    | 'VALIDATION_REQUIRED_FIELD'
    | 'VALIDATION_INVALID_FORMAT'
    | 'VALIDATION_OUT_OF_RANGE'
    | 'VALIDATION_TYPE_MISMATCH'
    | 'VALIDATION_SCHEMA_FAILED'
    | 'VALIDATION_CONSTRAINT_VIOLATED'
    | 'VALIDATION_CUSTOM_RULE_FAILED';
  field?: string;
  expectedType?: string;
  actualValue?: unknown;
}

// Authentication errors
export interface AuthenticationError extends AppError {
  category: 'authentication';
  code:
    | 'AUTH_LOGIN_FAILED'
    | 'AUTH_LOGOUT_FAILED'
    | 'AUTH_TOKEN_EXPIRED'
    | 'AUTH_TOKEN_INVALID'
    | 'AUTH_PERMISSION_DENIED'
    | 'AUTH_SESSION_EXPIRED'
    | 'AUTH_CREDENTIALS_INVALID'
    | 'AUTH_ACCOUNT_LOCKED';
}

// System-related errors
export interface SystemError extends AppError {
  category: 'system';
  code:
    | 'SYSTEM_TRAY_FAILED'
    | 'SYSTEM_NOTIFICATION_FAILED'
    | 'SYSTEM_CLIPBOARD_FAILED'
    | 'SYSTEM_FILE_ACCESS_DENIED'
    | 'SYSTEM_PROCESS_FAILED'
    | 'SYSTEM_MEMORY_ERROR'
    | 'SYSTEM_PLATFORM_UNSUPPORTED';
}

// UI-related errors
export interface UIError extends AppError {
  category: 'ui';
  code:
    | 'UI_RENDER_FAILED'
    | 'UI_COMPONENT_CRASHED'
    | 'UI_EVENT_HANDLER_FAILED'
    | 'UI_DIALOG_FAILED'
    | 'UI_NAVIGATION_FAILED'
    | 'UI_THEME_LOAD_FAILED'
    | 'UI_ACCESSIBILITY_ERROR';
}

// Migration errors
export interface MigrationError extends AppError {
  category: 'migration';
  code:
    | 'MIGRATION_VERSION_MISMATCH'
    | 'MIGRATION_BACKUP_FAILED'
    | 'MIGRATION_TRANSFORM_FAILED'
    | 'MIGRATION_VALIDATION_FAILED'
    | 'MIGRATION_ROLLBACK_FAILED'
    | 'MIGRATION_CORRUPTED_DATA';
  fromVersion?: number;
  toVersion?: number;
}

// Backup errors
export interface BackupError extends AppError {
  category: 'backup';
  code:
    | 'BACKUP_CREATE_FAILED'
    | 'BACKUP_RESTORE_FAILED'
    | 'BACKUP_EXPORT_FAILED'
    | 'BACKUP_IMPORT_FAILED'
    | 'BACKUP_CORRUPTED'
    | 'BACKUP_NOT_FOUND'
    | 'BACKUP_PERMISSION_DENIED';
}

// Tauri-specific errors
export interface TauriError extends AppError {
  category: 'tauri';
  code:
    | 'TAURI_IPC_FAILED'
    | 'TAURI_COMMAND_FAILED'
    | 'TAURI_EVENT_FAILED'
    | 'TAURI_WEBVIEW_FAILED'
    | 'TAURI_WINDOW_FAILED'
    | 'TAURI_MENU_FAILED'
    | 'TAURI_PLUGIN_FAILED';
}

// Error classes for instanceof checks
export class TimerErrorClass extends Error implements TimerError {
  category: 'timer' = 'timer';
  code: TimerError['code'];
  details?: unknown;
  timestamp: Date;
  operation?: string;
  severity: AppError['severity'];
  userMessage: string;
  technicalMessage?: string;
  suggestions: string[];
  retryable: boolean;

  constructor(code: TimerError['code'], message: string, details?: unknown, operation?: string) {
    super(message);
    this.name = 'TimerError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    this.operation = operation;
    this.severity = 'medium';
    this.userMessage = 'There was a problem with the timer. Please try again.';
    this.technicalMessage = message;
    this.suggestions = ['Try stopping and starting the timer again'];
    this.retryable = true;
  }
}

export class TaskErrorClass extends Error implements TaskError {
  category: 'task' = 'task';
  code: TaskError['code'];
  details?: unknown;
  timestamp: Date;
  operation?: string;
  severity: AppError['severity'];
  userMessage: string;
  technicalMessage?: string;
  suggestions: string[];
  retryable: boolean;

  constructor(code: TaskError['code'], message: string, details?: unknown, operation?: string) {
    super(message);
    this.name = 'TaskError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    this.operation = operation;
    this.severity = 'medium';
    this.userMessage = 'There was a problem managing tasks. Please try again.';
    this.technicalMessage = message;
    this.suggestions = ['Check task data and try again'];
    this.retryable = true;
  }
}



export class StorageErrorClass extends Error implements StorageError {
  category: 'storage' = 'storage';
  code: StorageError['code'];
  details?: unknown;
  timestamp: Date;
  operation?: string;
  severity: AppError['severity'];
  userMessage: string;
  technicalMessage?: string;
  suggestions: string[];
  retryable: boolean;

  constructor(code: StorageError['code'], message: string, details?: unknown, operation?: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    this.operation = operation;
    this.severity = 'medium';
    this.userMessage = 'There was a problem accessing stored data. Please try again.';
    this.technicalMessage = message;
    this.suggestions = ['Check if storage is available', 'Try refreshing the application'];
    this.retryable = true;
  }
}

// Union type for all error types
export type ApplicationError =
  | TimerError
  | TaskError

  | StorageError
  | NetworkError
  | ValidationError
  | AuthenticationError
  | SystemError
  | UIError
  | MigrationError
  | BackupError
  | TauriError;

// Error severity levels
export const ErrorSeverity = {
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
  HIGH: 'high' as const,
  CRITICAL: 'critical' as const,
} as const;

// Error factory functions
export class ErrorFactory {
  static createTimerError(
    code: TimerError['code'],
    message: string,
    details?: unknown,
    operation?: string
  ): TimerError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      operation,
      severity: this.getSeverityForCode(code),
      category: 'timer',
      retryable: this.isRetryableCode(code),
      userMessage: this.getUserMessage('timer', code),
      suggestions: this.getSuggestions('timer', code),
    };
  }

  static createTaskError(
    code: TaskError['code'],
    message: string,
    details?: unknown,
    operation?: string
  ): TaskError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      operation,
      severity: this.getSeverityForCode(code),
      category: 'task',
      retryable: this.isRetryableCode(code),
      userMessage: this.getUserMessage('task', code),
      suggestions: this.getSuggestions('task', code),
    };
  }

  static createStorageError(
    code: StorageError['code'],
    message: string,
    details?: unknown,
    operation?: string
  ): StorageError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      operation,
      severity: this.getSeverityForCode(code),
      category: 'storage',
      retryable: this.isRetryableCode(code),
      userMessage: this.getUserMessage('storage', code),
      suggestions: this.getSuggestions('storage', code),
    };
  }

  static createValidationError(
    code: ValidationError['code'],
    message: string,
    field?: string,
    expectedType?: string,
    actualValue?: unknown
  ): ValidationError {
    return {
      code,
      message,
      field,
      expectedType,
      actualValue,
      timestamp: new Date(),
      severity: 'medium',
      category: 'validation',
      retryable: false,
      userMessage: this.getUserMessage('validation', code),
      suggestions: this.getSuggestions('validation', code),
    };
  }

  private static getSeverityForCode(code: string): AppError['severity'] {
    // Critical errors
    if (code.includes('CORRUPTED') || code.includes('CRITICAL') || code.includes('SYSTEM')) {
      return 'critical';
    }
    
    // High severity errors
    if (code.includes('FAILED') || code.includes('ERROR') || code.includes('DENIED')) {
      return 'high';
    }
    
    // Medium severity errors
    if (code.includes('INVALID') || code.includes('VALIDATION') || code.includes('TIMEOUT')) {
      return 'medium';
    }
    
    // Default to low
    return 'low';
  }

  private static isRetryableCode(code: string): boolean {
    const retryableCodes = [
      'NETWORK_CONNECTION_FAILED',
      'NETWORK_TIMEOUT',
      'STORAGE_WRITE_FAILED',
      'TIMER_SYNC_FAILED',
      'TAURI_IPC_FAILED',
    ];
    
    return retryableCodes.includes(code) || code.includes('TIMEOUT') || code.includes('NETWORK');
  }

  private static getUserMessage(_category: ErrorCategory, code: string): string {
    const messages: Record<string, string> = {
      'TIMER_START_FAILED': 'Unable to start the timer. Please try again.',
      'TIMER_STOP_FAILED': 'Unable to stop the timer. Please try again.',
      'TASK_CREATE_FAILED': 'Unable to create the task. Please check your input and try again.',
      'STORAGE_WRITE_FAILED': 'Unable to save your data. Please check your storage space.',
      'VALIDATION_REQUIRED_FIELD': 'This field is required.',
      'NETWORK_CONNECTION_FAILED': 'Unable to connect to the server. Please check your internet connection.',
    };
    
    return messages[code] || 'An unexpected error occurred. Please try again.';
  }

  private static getSuggestions(_category: ErrorCategory, code: string): string[] {
    const suggestions: Record<string, string[]> = {
      'TIMER_START_FAILED': [
        'Check if another timer is already running',
        'Verify the task name is valid',
        'Restart the application if the problem persists',
      ],
      'STORAGE_WRITE_FAILED': [
        'Check available storage space',
        'Close other applications that might be using storage',
        'Try exporting your data as a backup',
      ],
      'NETWORK_CONNECTION_FAILED': [
        'Check your internet connection',
        'Try again in a few moments',
        'Contact support if the problem persists',
      ],
    };
    
    return suggestions[code] || ['Try again later', 'Contact support if the problem persists'];
  }
}

// Error handling utilities
export function isRetryableError(error: ApplicationError): boolean {
  return error.retryable;
}

export function getErrorSeverity(error: ApplicationError): AppError['severity'] {
  return error.severity;
}

export function shouldShowToUser(error: ApplicationError): boolean {
  return error.severity !== 'low' && !!error.userMessage;
}

export function formatErrorForUser(error: ApplicationError): string {
  return error.userMessage || error.message;
}

export function formatErrorForDeveloper(error: ApplicationError): string {
  return `[${error.category.toUpperCase()}:${error.code}] ${error.message}${
    error.details ? ` | Details: ${JSON.stringify(error.details)}` : ''
  }`;
}

// Error factory functions for creating specific error types
export function createStorageError(
  code: StorageError['code'],
  message: string,
  details?: unknown,
  operation?: string
): StorageError {
  return {
    code,
    message,
    details,
    timestamp: new Date(),
    operation,
    severity: 'medium',
    category: 'storage',
    userMessage: 'There was a problem accessing stored data. Please try again.',
    technicalMessage: message,
    suggestions: ['Check if storage is available', 'Try refreshing the application'],
    retryable: true,
  };
}

export function createTimerError(
  code: TimerError['code'],
  message: string,
  details?: unknown,
  operation?: string
): TimerError {
  return {
    code,
    message,
    details,
    timestamp: new Date(),
    operation,
    severity: 'medium',
    category: 'timer',
    userMessage: 'There was a problem with the timer. Please try again.',
    technicalMessage: message,
    suggestions: ['Try stopping and starting the timer again'],
    retryable: true,
  };
}

export function createTaskError(
  code: TaskError['code'],
  message: string,
  details?: unknown,
  operation?: string
): TaskError {
  return {
    code,
    message,
    details,
    timestamp: new Date(),
    operation,
    severity: 'medium',
    category: 'task',
    userMessage: 'There was a problem managing tasks. Please try again.',
    technicalMessage: message,
    suggestions: ['Check task data and try again'],
    retryable: true,
  };
}


