import { useCallback } from 'react';
import { captureException, addBreadcrumb, setContext } from '../utils/sentry';

/**
 * Custom hook for handling errors with Sentry integration
 */
export function useSentryErrorHandler() {
  const handleError = useCallback((error: Error, context?: Record<string, any>) => {
    // Add breadcrumb for error context
    addBreadcrumb(
      `Error in component: ${error.message}`,
      'error',
      'error',
      context
    );

    // Set additional context if provided
    if (context) {
      setContext('componentError', context);
    }

    // Capture the exception
    captureException(error, context);

    // Also log to console for development
    console.error('Component error:', error, context);
  }, []);

  const handleAsyncError = useCallback(async (asyncOperation: () => Promise<any>, context?: Record<string, any>) => {
    try {
      return await asyncOperation();
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      handleError(errorObj, {
        ...context,
        operationType: 'async',
      });
      throw error; // Re-throw to allow component to handle it
    }
  }, [handleError]);

  const logInfo = useCallback((message: string, context?: Record<string, any>) => {
    addBreadcrumb(message, 'info', 'info', context);
  }, []);

  const logWarning = useCallback((message: string, context?: Record<string, any>) => {
    addBreadcrumb(message, 'warning', 'warning', context);
  }, []);

  return {
    handleError,
    handleAsyncError,
    logInfo,
    logWarning,
  };
}
