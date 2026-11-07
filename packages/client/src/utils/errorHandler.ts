/**
 * Enhanced Error Handler Utility
 *
 * Provides centralized error handling with Sentry integration
 * for services and other parts of the application.
 */

import { captureException, addBreadcrumb, setContext } from './sentry';
import { errorMessage } from './errors';

export interface ErrorContext {
  service?: string;
  method?: string;
  userId?: string;
  taskId?: string;
  taskName?: string;
  entryId?: string;
  noteId?: string;
  templateId?: string;
  timeEntryId?: string;
  elapsedMs?: number;
  operation?: string;
  data?: Record<string, any>;
}

/**
 * Enhanced error class with additional context
 */
export class AppError extends Error {
  public readonly context: ErrorContext;
  public readonly timestamp: string;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';

  constructor(
    message: string,
    context: ErrorContext = {},
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    super(message);
    this.name = 'AppError';
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.severity = severity;
  }
}

/**
 * Service error handler that captures errors and sends them to Sentry
 */
export class ServiceErrorHandler {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Handle and capture service errors
   */
  handleError(
    error: Error | unknown,
    method: string,
    context: Omit<ErrorContext, 'service' | 'method'> = {}
  ): AppError {
    // Backend commands reject with strings, and some code throws { message }
    const errorObj = error instanceof Error ? error : new Error(errorMessage(error, String(error)));

    const fullContext: ErrorContext = {
      service: this.serviceName,
      method,
      ...context,
    };

    // The message stays the original one (it may be shown to the user); the
    // service and method travel in the context.
    const appError = new AppError(errorObj.message, fullContext, this.determineSeverity(errorObj, method));

    // Add breadcrumb
    addBreadcrumb(`Service error in ${this.serviceName}.${method}`, 'error', 'error', {
      service: this.serviceName,
      method,
      originalError: errorObj.message,
      ...context,
    });

    // Set context for Sentry
    setContext('serviceError', {
      service: this.serviceName,
      method,
      timestamp: appError.timestamp,
      severity: appError.severity,
      ...fullContext,
    });

    // Capture exception
    captureException(appError, {
      service: this.serviceName,
      method,
      originalError: errorObj.message,
      originalStack: errorObj.stack,
      ...context,
    });

    // Log to console in development
    if (import.meta.env.MODE === 'development') {
      console.error(`[${this.serviceName}] Error in ${method}:`, errorObj);
      console.error('Context:', fullContext);
    }

    return appError;
  }

  /**
   * Handle async operations with automatic error capture
   */
  async handleAsync<T>(
    operation: () => Promise<T>,
    method: string,
    context: Omit<ErrorContext, 'service' | 'method'> = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.handleError(error, method, context);
    }
  }

  /**
   * Log info message with breadcrumb
   */
  logInfo(message: string, method: string, data?: Record<string, any>) {
    addBreadcrumb(`${this.serviceName}.${method}: ${message}`, 'info', 'info', {
      service: this.serviceName,
      method,
      ...data,
    });
  }

  /**
   * Determine error severity based on error type and method
   */
  private determineSeverity(error: Error, method: string): 'low' | 'medium' | 'high' | 'critical' {
    // Critical operations that affect data integrity
    if (method.includes('delete') || method.includes('update') || method.includes('create')) {
      return 'high';
    }

    // Network or storage related errors
    if (error.message.includes('network') || error.message.includes('storage') || error.message.includes('fetch')) {
      return 'medium';
    }

    // Validation errors
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return 'low';
    }

    // Default to medium severity
    return 'medium';
  }
}

/**
 * Create a service error handler for a specific service
 */
export function createServiceErrorHandler(serviceName: string): ServiceErrorHandler {
  return new ServiceErrorHandler(serviceName);
}
