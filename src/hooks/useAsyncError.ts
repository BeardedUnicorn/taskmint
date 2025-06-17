/**
 * Async Error Handling Hook
 * 
 * This hook provides utilities for handling async operations with proper error
 * management, loading states, and retry mechanisms.
 */

import { useState, useCallback, useRef } from 'react';

// Error types
export interface AsyncError {
  message: string;
  code?: string;
  details?: unknown;
  timestamp: Date;
  operation?: string;
}

// Loading state interface
export interface LoadingState {
  isLoading: boolean;
  operation?: string;
}

// Retry options interface
export interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  retryCondition?: (error: Error) => boolean;
}

// Hook return type
export interface UseAsyncErrorReturn {
  error: AsyncError | null;
  isLoading: boolean;
  loadingState: LoadingState;
  executeAsync: <T>(
    asyncFn: () => Promise<T>,
    options?: {
      operation?: string;
      errorHandler?: (error: AsyncError) => void;
      onSuccess?: (result: T) => void;
      retry?: RetryOptions;
    }
  ) => Promise<T>;
  executeWithRetry: <T>(
    asyncFn: () => Promise<T>,
    retryOptions?: RetryOptions,
    options?: {
      operation?: string;
      errorHandler?: (error: AsyncError) => void;
      onSuccess?: (result: T) => void;
    }
  ) => Promise<T>;
  clearError: () => void;
  setLoading: (loading: boolean, operation?: string) => void;
}

/**
 * Hook for managing async operations with error handling
 */
export function useAsyncError(): UseAsyncErrorReturn {
  const [error, setError] = useState<AsyncError | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({ isLoading: false });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clear any existing error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Set loading state
  const setLoading = useCallback((loading: boolean, operation?: string) => {
    setLoadingState({ isLoading: loading, operation });
  }, []);

  // Create an async error object
  const createAsyncError = useCallback((
    err: unknown,
    operation?: string
  ): AsyncError => {
    if (err instanceof Error) {
      return {
        message: err.message,
        code: (err as any).code,
        details: err,
        timestamp: new Date(),
        operation,
      };
    }
    
    return {
      message: typeof err === 'string' ? err : 'Unknown error occurred',
      details: err,
      timestamp: new Date(),
      operation,
    };
  }, []);

  // Sleep utility for delays
  const sleep = useCallback((ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  // Calculate delay with backoff
  const calculateDelay = useCallback((
    attempt: number,
    baseDelay: number,
    backoff: 'linear' | 'exponential'
  ): number => {
    switch (backoff) {
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      case 'linear':
      default:
        return baseDelay * attempt;
    }
  }, []);

  // Execute async function with retry logic
  const executeWithRetry = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    retryOptions: RetryOptions = {},
    options: {
      operation?: string;
      errorHandler?: (error: AsyncError) => void;
      onSuccess?: (result: T) => void;
    } = {}
  ): Promise<T> => {
    const {
      maxRetries = 3,
      delay = 1000,
      backoff = 'exponential',
      retryCondition = () => true,
    } = retryOptions;

    const { operation, errorHandler, onSuccess } = options;

    // let lastError: AsyncError | null = null; // Commented out as it's not used

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        setLoading(true, operation);
        clearError();

        const result = await asyncFn();
        
        setLoading(false);
        
        if (onSuccess) {
          onSuccess(result);
        }
        
        return result;
      } catch (err) {
        const asyncError = createAsyncError(err, operation);
        // lastError = asyncError; // Commented out as lastError is not used

        console.error(`Attempt ${attempt} failed for operation "${operation}":`, asyncError);

        // Check if we should retry
        if (attempt <= maxRetries && retryCondition(asyncError.details as Error)) {
          const delayMs = calculateDelay(attempt, delay, backoff);
          console.log(`Retrying in ${delayMs}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
          await sleep(delayMs);
          continue;
        }

        // All retries exhausted or retry condition not met
        setLoading(false);
        setError(asyncError);
        
        if (errorHandler) {
          errorHandler(asyncError);
        }

        throw asyncError;
      }
    }

    throw new Error('All retry attempts failed');
  }, [createAsyncError, setLoading, clearError, calculateDelay, sleep]);

  // Execute async function without automatic retry
  const executeAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    options: {
      operation?: string;
      errorHandler?: (error: AsyncError) => void;
      onSuccess?: (result: T) => void;
      retry?: RetryOptions;
    } = {}
  ): Promise<T> => {
    const { operation, errorHandler, onSuccess, retry } = options;

    // If retry options are provided, use executeWithRetry
    if (retry) {
      return executeWithRetry(asyncFn, retry, { operation, errorHandler, onSuccess });
    }

    try {
      setLoading(true, operation);
      clearError();

      // Cancel any previous operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this operation
      abortControllerRef.current = new AbortController();

      const result = await asyncFn();
      
      setLoading(false);
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (err) {
      const asyncError = createAsyncError(err, operation);
      
      setLoading(false);
      setError(asyncError);
      
      if (errorHandler) {
        errorHandler(asyncError);
      }
      
      console.error(`Async operation failed for "${operation}":`, asyncError);
      throw asyncError;
    }
  }, [createAsyncError, setLoading, clearError, executeWithRetry]);

  return {
    error,
    isLoading: loadingState.isLoading,
    loadingState,
    executeAsync,
    executeWithRetry,
    clearError,
    setLoading,
  };
}

/**
 * Hook for managing multiple async operations
 */
export function useMultipleAsyncErrors() {
  const [errors, setErrors] = useState<Map<string, AsyncError>>(new Map());
  const [loadingStates, setLoadingStates] = useState<Map<string, LoadingState>>(new Map());

  const clearError = useCallback((operationId: string) => {
    setErrors(prev => {
      const newErrors = new Map(prev);
      newErrors.delete(operationId);
      return newErrors;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors(new Map());
  }, []);

  const setLoading = useCallback((operationId: string, loading: boolean, operation?: string) => {
    setLoadingStates(prev => {
      const newStates = new Map(prev);
      if (loading) {
        newStates.set(operationId, { isLoading: true, operation });
      } else {
        newStates.delete(operationId);
      }
      return newStates;
    });
  }, []);

  const executeAsync = useCallback(async <T>(
    operationId: string,
    asyncFn: () => Promise<T>,
    options: {
      operation?: string;
      errorHandler?: (error: AsyncError) => void;
      onSuccess?: (result: T) => void;
    } = {}
  ): Promise<T | null> => {
    const { operation, errorHandler, onSuccess } = options;

    try {
      setLoading(operationId, true, operation);
      clearError(operationId);

      const result = await asyncFn();
      
      setLoading(operationId, false);
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (err) {
      const asyncError: AsyncError = {
        message: err instanceof Error ? err.message : 'Unknown error',
        code: (err as any)?.code,
        details: err,
        timestamp: new Date(),
        operation,
      };
      
      setLoading(operationId, false);
      setErrors(prev => new Map(prev).set(operationId, asyncError));
      
      if (errorHandler) {
        errorHandler(asyncError);
      }
      
      return null;
    }
  }, [setLoading, clearError]);

  return {
    errors,
    loadingStates,
    isAnyLoading: loadingStates.size > 0,
    executeAsync,
    clearError,
    clearAllErrors,
    setLoading,
  };
}

/**
 * Utility function to check if an error is retryable
 */
export const isRetryableError = (error: Error): boolean => {
  // Network errors are usually retryable
  if (error.name === 'NetworkError' || error.name === 'TypeError') {
    return true;
  }

  // Timeout errors are retryable
  if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
    return true;
  }

  // 5xx HTTP errors are retryable
  if ('status' in error && typeof error.status === 'number') {
    return error.status >= 500 && error.status < 600;
  }

  // Rate limiting errors (429) are retryable
  if ('status' in error && error.status === 429) {
    return true;
  }

  return false;
};

/**
 * Utility function to create common retry options
 */
export const createRetryOptions = {
  network: (): RetryOptions => ({
    maxRetries: 3,
    delay: 1000,
    backoff: 'exponential',
    retryCondition: isRetryableError,
  }),
  
  api: (): RetryOptions => ({
    maxRetries: 2,
    delay: 500,
    backoff: 'linear',
    retryCondition: isRetryableError,
  }),
  
  critical: (): RetryOptions => ({
    maxRetries: 5,
    delay: 2000,
    backoff: 'exponential',
    retryCondition: isRetryableError,
  }),
};
