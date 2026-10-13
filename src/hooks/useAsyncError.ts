/**
 * Async operation runner for the record hooks (tasks, notes, templates): runs
 * the operation, logs a failure, hands it to an optional error handler and
 * rethrows it as an AsyncError — a real Error carrying the original message,
 * so callers can show what actually went wrong.
 */

import { useCallback } from 'react';
import { errorMessage } from '../utils/errors';

export class AsyncError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly operation?: string;
  readonly timestamp = new Date();

  constructor(cause: unknown, operation?: string) {
    super(errorMessage(cause, 'Unknown error occurred'));
    this.name = 'AsyncError';
    this.code =
      typeof cause === 'object' && cause !== null && typeof (cause as { code?: unknown }).code === 'string'
        ? (cause as { code: string }).code
        : undefined;
    this.details = cause;
    this.operation = operation;
  }
}

export interface ExecuteAsyncOptions {
  operation?: string;
  errorHandler?: (error: AsyncError) => void;
}

export interface UseAsyncErrorReturn {
  executeAsync: <T>(asyncFn: () => Promise<T>, options?: ExecuteAsyncOptions) => Promise<T>;
}

export function useAsyncError(): UseAsyncErrorReturn {
  const executeAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    options: ExecuteAsyncOptions = {}
  ): Promise<T> => {
    const { operation, errorHandler } = options;
    try {
      return await asyncFn();
    } catch (err) {
      const asyncError = err instanceof AsyncError ? err : new AsyncError(err, operation);
      errorHandler?.(asyncError);
      console.error(`Async operation failed for "${operation}":`, asyncError);
      throw asyncError;
    }
  }, []);

  return { executeAsync };
}
