/**
 * Error Recovery Hook
 * 
 * Provides intelligent error recovery mechanisms with exponential backoff,
 * retry logic, and user-friendly error handling strategies.
 */

import { useState, useCallback, useRef } from 'react';
import { ApplicationError, isRetryableError, formatErrorForUser } from '../types/errors';

export interface ErrorRecoveryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: ApplicationError) => void;
  onMaxRetriesReached?: (error: ApplicationError) => void;
  onRecoverySuccess?: (attempt: number) => void;
}

export interface ErrorRecoveryState {
  isRecovering: boolean;
  retryCount: number;
  lastError: ApplicationError | null;
  recoveryAttempts: number;
  canRetry: boolean;
}

export interface UseErrorRecoveryReturn {
  // State
  recoveryState: ErrorRecoveryState;
  
  // Recovery actions
  recoverFromError: (error: ApplicationError, operation: () => Promise<any>) => Promise<boolean>;
  retryLastOperation: () => Promise<boolean>;
  resetRecovery: () => void;
  
  // Utility functions
  shouldShowRetryButton: () => boolean;
  getRecoveryMessage: () => string;
  getRetryDelay: (attempt: number) => number;
}

/**
 * Hook for managing error recovery with intelligent retry strategies
 */
export function useErrorRecovery(options: ErrorRecoveryOptions = {}): UseErrorRecoveryReturn {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry,
    onMaxRetriesReached,
    onRecoverySuccess,
  } = options;

  const [recoveryState, setRecoveryState] = useState<ErrorRecoveryState>({
    isRecovering: false,
    retryCount: 0,
    lastError: null,
    recoveryAttempts: 0,
    canRetry: false,
  });

  const lastOperationRef = useRef<(() => Promise<any>) | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Calculate retry delay with exponential backoff
   */
  const getRetryDelay = useCallback((attempt: number): number => {
    const delay = Math.min(
      baseDelay * Math.pow(backoffMultiplier, attempt - 1),
      maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }, [baseDelay, backoffMultiplier, maxDelay]);

  /**
   * Reset recovery state
   */
  const resetRecovery = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setRecoveryState({
      isRecovering: false,
      retryCount: 0,
      lastError: null,
      recoveryAttempts: 0,
      canRetry: false,
    });

    lastOperationRef.current = null;
  }, []);

  /**
   * Attempt to recover from an error with retry logic
   */
  const recoverFromError = useCallback(async (
    error: ApplicationError,
    operation: () => Promise<any>
  ): Promise<boolean> => {
    console.log('🔄 Error recovery: Starting recovery for error:', error);

    // Store the operation for potential retries
    lastOperationRef.current = operation;

    // Check if error is retryable
    if (!isRetryableError(error)) {
      console.log('❌ Error recovery: Error is not retryable');
      setRecoveryState(prev => ({
        ...prev,
        lastError: error,
        canRetry: false,
      }));
      return false;
    }

    // Check if we've exceeded max retries
    if (recoveryState.retryCount >= maxRetries) {
      console.log('❌ Error recovery: Max retries exceeded');
      setRecoveryState(prev => ({
        ...prev,
        lastError: error,
        canRetry: false,
      }));
      
      if (onMaxRetriesReached) {
        onMaxRetriesReached(error);
      }
      
      return false;
    }

    // Start recovery process
    setRecoveryState(prev => ({
      ...prev,
      isRecovering: true,
      lastError: error,
      retryCount: prev.retryCount + 1,
      recoveryAttempts: prev.recoveryAttempts + 1,
      canRetry: true,
    }));

    const currentAttempt = recoveryState.retryCount + 1;
    const delay = getRetryDelay(currentAttempt);

    console.log(`🔄 Error recovery: Attempting retry ${currentAttempt}/${maxRetries} after ${delay}ms`);

    if (onRetry) {
      onRetry(currentAttempt, error);
    }

    try {
      // Wait for the calculated delay
      await new Promise(resolve => {
        retryTimeoutRef.current = setTimeout(resolve, delay);
      });

      // Attempt the operation again
      await operation();

      // Success! Reset recovery state
      console.log('✅ Error recovery: Operation succeeded on retry');
      
      if (onRecoverySuccess) {
        onRecoverySuccess(currentAttempt);
      }

      resetRecovery();
      return true;
    } catch (retryError) {
      console.log(`❌ Error recovery: Retry ${currentAttempt} failed:`, retryError);
      
      setRecoveryState(prev => ({
        ...prev,
        isRecovering: false,
        lastError: retryError as ApplicationError,
      }));

      // If this was the last retry, mark as non-retryable
      if (currentAttempt >= maxRetries) {
        setRecoveryState(prev => ({
          ...prev,
          canRetry: false,
        }));
        
        if (onMaxRetriesReached) {
          onMaxRetriesReached(retryError as ApplicationError);
        }
      }

      return false;
    }
  }, [
    recoveryState.retryCount,
    maxRetries,
    getRetryDelay,
    onRetry,
    onMaxRetriesReached,
    onRecoverySuccess,
    resetRecovery,
  ]);

  /**
   * Retry the last failed operation
   */
  const retryLastOperation = useCallback(async (): Promise<boolean> => {
    if (!lastOperationRef.current || !recoveryState.lastError) {
      console.log('❌ Error recovery: No operation to retry');
      return false;
    }

    return recoverFromError(recoveryState.lastError, lastOperationRef.current);
  }, [recoveryState.lastError, recoverFromError]);

  /**
   * Check if retry button should be shown to user
   */
  const shouldShowRetryButton = useCallback((): boolean => {
    return (
      recoveryState.canRetry &&
      !recoveryState.isRecovering &&
      recoveryState.lastError !== null &&
      isRetryableError(recoveryState.lastError)
    );
  }, [recoveryState]);

  /**
   * Get user-friendly recovery message
   */
  const getRecoveryMessage = useCallback((): string => {
    if (!recoveryState.lastError) {
      return '';
    }

    if (recoveryState.isRecovering) {
      return `Retrying... (Attempt ${recoveryState.retryCount}/${maxRetries})`;
    }

    if (!recoveryState.canRetry) {
      return `${formatErrorForUser(recoveryState.lastError)} Please try again later.`;
    }

    const remainingRetries = maxRetries - recoveryState.retryCount;
    return `${formatErrorForUser(recoveryState.lastError)} ${remainingRetries > 0 ? `(${remainingRetries} retries remaining)` : ''}`;
  }, [recoveryState, maxRetries]);

  return {
    recoveryState,
    recoverFromError,
    retryLastOperation,
    resetRecovery,
    shouldShowRetryButton,
    getRecoveryMessage,
    getRetryDelay,
  };
}

export const RecoveryStrategies = {
  // Network operations - more retries, longer delays
  network: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
  },

  // Storage operations - fewer retries, shorter delays
  storage: {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
  },

  // Timer operations - immediate retry, then longer delays
  timer: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 10000,
    backoffMultiplier: 3,
  },

  // User actions - minimal retries, quick feedback
  userAction: {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
  },
} as const;
