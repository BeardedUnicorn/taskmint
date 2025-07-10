/**
 * Enhanced Error Handler Utility
 * 
 * Provides centralized error handling with Sentry integration
 * for services and other parts of the application.
 */

import { captureException, addBreadcrumb, setContext } from './sentry';

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

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
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
    // Properly handle different error types
    let errorObj: Error;
    let errorMessage: string;
    
    if (error instanceof Error) {
      errorObj = error;
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      // Handle objects that might have message properties
      const errorAsAny = error as any;
      errorMessage = errorAsAny.message || errorAsAny.toString() || JSON.stringify(error);
      errorObj = new Error(errorMessage);
    } else {
      errorMessage = String(error);
      errorObj = new Error(errorMessage);
    }
    
    const fullContext: ErrorContext = {
      service: this.serviceName,
      method,
      ...context,
    };

    // Create enhanced error with properly formatted message
    const appError = new AppError(
      `${this.serviceName}.${method}: ${errorMessage}`,
      fullContext,
      this.determineSeverity(errorObj, method)
    );

    // Add breadcrumb
    addBreadcrumb(
      `Service error in ${this.serviceName}.${method}`,
      'error',
      'error',
      {
        service: this.serviceName,
        method,
        originalError: errorObj.message,
        ...context,
      }
    );

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
   * Handle sync operations with automatic error capture
   */
  handleSync<T>(
    operation: () => T,
    method: string,
    context: Omit<ErrorContext, 'service' | 'method'> = {}
  ): T {
    try {
      return operation();
    } catch (error) {
      throw this.handleError(error, method, context);
    }
  }

  /**
   * Log info message with breadcrumb
   */
  logInfo(message: string, method: string, data?: Record<string, any>) {
    addBreadcrumb(
      `${this.serviceName}.${method}: ${message}`,
      'info',
      'info',
      {
        service: this.serviceName,
        method,
        ...data,
      }
    );
  }

  /**
   * Log warning message with breadcrumb
   */
  logWarning(message: string, method: string, data?: Record<string, any>) {
    addBreadcrumb(
      `${this.serviceName}.${method}: ${message}`,
      'warning',
      'warning',
      {
        service: this.serviceName,
        method,
        ...data,
      }
    );
  }

  /**
   * Determine error severity based on error type and method
   */
  private determineSeverity(
    error: Error,
    method: string
  ): 'low' | 'medium' | 'high' | 'critical' {
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
 * Global error handler for unhandled errors
 */
export const globalErrorHandler = new ServiceErrorHandler('Global');

/**
 * Create a service error handler for a specific service
 */
export function createServiceErrorHandler(serviceName: string): ServiceErrorHandler {
  return new ServiceErrorHandler(serviceName);
}

/**
 * Utility function to safely execute async operations with error handling
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback: T,
  context: ErrorContext = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    globalErrorHandler.handleError(error, 'safeAsync', context);
    return fallback;
  }
}

/**
 * Utility function to safely execute sync operations with error handling
 */
export function safeSync<T>(
  operation: () => T,
  fallback: T,
  context: ErrorContext = {}
): T {
  try {
    return operation();
  } catch (error) {
    globalErrorHandler.handleError(error, 'safeSync', context);
    return fallback;
  }
}
