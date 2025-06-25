/**
 * Tests for useErrorRecovery hook
 */

import { renderHook, act } from '@testing-library/react';
import { useErrorRecovery } from '../useErrorRecovery';
import { ApplicationError } from '../../types/errors';

// Mock the error utilities
jest.mock('../../types/errors', () => ({
  isRetryableError: jest.fn(),
  formatErrorForUser: jest.fn(),
  ApplicationError: class ApplicationError extends Error {
    constructor(message: string, public code?: string, public retryable?: boolean) {
      super(message);
      this.name = 'ApplicationError';
    }
  },
}));

const { isRetryableError, formatErrorForUser } = require('../../types/errors');

describe('useErrorRecovery', () => {
  const mockOperation = jest.fn();
  const mockOnRetry = jest.fn();
  const mockOnMaxRetriesReached = jest.fn();
  const mockOnRecoverySuccess = jest.fn();

  const defaultOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    onRetry: mockOnRetry,
    onMaxRetriesReached: mockOnMaxRetriesReached,
    onRecoverySuccess: mockOnRecoverySuccess,
  };

  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // Makes jitter deterministic
    jest.clearAllMocks();
    jest.useFakeTimers();
    isRetryableError.mockReturnValue(true);
    formatErrorForUser.mockImplementation((error: ApplicationError) => error.message);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useErrorRecovery());

      expect(result.current.recoveryState).toEqual({
        isRecovering: false,
        retryCount: 0,
        lastError: null,
        recoveryAttempts: 0,
        canRetry: false,
      });
    });

    it('should accept custom options', () => {
      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      expect(result.current.getRetryDelay(1)).toBe(1000);
      expect(result.current.getRetryDelay(2)).toBe(2000);
      expect(result.current.getRetryDelay(3)).toBe(4000);
    });
  });

  describe('recoverFromError', () => {
    it('should successfully recover on first retry attempt', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockResolvedValueOnce('success');

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      const recoveryPromise = act(() => result.current.recoverFromError(error, mockOperation));
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      const recoveryResult = await recoveryPromise;

      expect(recoveryResult).toBe(true);
      expect(result.current.recoveryState.isRecovering).toBe(false);
      expect(result.current.recoveryState.retryCount).toBe(0); // Resets on success
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(mockOnRecoverySuccess).toHaveBeenCalledWith(1);
    });

    it('should retry with exponential backoff and succeed', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');
      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // Initial call that fails and schedules first retry
      await act(async () => {
        const promise = result.current.recoverFromError(error, mockOperation);
        jest.advanceTimersByTime(1000);
        await promise;
      });
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result.current.recoveryState.retryCount).toBe(1);
      expect(mockOnRetry).toHaveBeenCalledTimes(1);

      // --- 2nd attempt (fails, triggers second retry) ---
      await act(async () => {
        const promise = result.current.retryLastOperation();
        jest.advanceTimersByTime(2000);
        await promise;
      });
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(result.current.recoveryState.retryCount).toBe(2);
      expect(mockOnRetry).toHaveBeenCalledTimes(2);

      // --- 3rd attempt (succeeds) ---
      await act(async () => {
        const promise = result.current.retryLastOperation();
        // No timer advance, operation succeeds immediately
        await promise;
      });
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(result.current.recoveryState.retryCount).toBe(0); // Resets
      expect(mockOnRecoverySuccess).toHaveBeenCalledWith(3);
    });

    it('should fail after max retries', async () => {
      const error = new ApplicationError('Persistent error', 'PERSISTENT_ERROR', true);
      mockOperation.mockRejectedValue(error);
      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // Initial call
      await act(async () => { const p = result.current.recoverFromError(error, mockOperation); jest.advanceTimersByTime(1000); await p; });
      // Retry 1
      await act(async () => { const p = result.current.retryLastOperation(); jest.advanceTimersByTime(2000); await p; });
      // Retry 2
      await act(async () => { const p = result.current.retryLastOperation(); jest.advanceTimersByTime(4000); await p; });

      // The state is now at max retries (3), next call will fail immediately
      expect(result.current.recoveryState.retryCount).toBe(3);
      expect(result.current.recoveryState.canRetry).toBe(false);
      expect(mockOnMaxRetriesReached).toHaveBeenCalledWith(error);

      let finalResult;
      await act(async () => {
        finalResult = await result.current.retryLastOperation();
      });
      expect(finalResult).toBe(false);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new ApplicationError('Auth error', 'AUTH_ERROR', false);
      isRetryableError.mockReturnValue(false);

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      const recoveryResult = await act(() =>
        result.current.recoverFromError(error, mockOperation)
      );

      expect(recoveryResult).toBe(false);
      expect(result.current.recoveryState.retryCount).toBe(0);
      expect(result.current.recoveryState.canRetry).toBe(false);
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should respect max delay cap', async () => {
      const options = { ...defaultOptions, maxDelay: 5000 };
      const { result } = renderHook(() => useErrorRecovery(options));

      // Test high retry count that would exceed max delay
      expect(result.current.getRetryDelay(10)).toBe(5000);
    });
  });

  describe('retryLastOperation', () => {
    it('should retry the last failed operation', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockRejectedValueOnce(error).mockResolvedValueOnce('success');

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // First attempt fails
      await act(async () => { const p = result.current.recoverFromError(error, mockOperation); jest.advanceTimersByTime(1000); await p; });

      // Retry last operation
      const retryPromise = act(() => result.current.retryLastOperation());

      // The second retry is after 2s
      await act(async () => {
        // The operation succeeds this time, so no timer advance is needed to resolve the promise itself
        // but we can advance it to be safe for any subsequent scheduled actions if it were to fail
        jest.advanceTimersByTime(2000);
      });

      expect(await retryPromise).toBe(true);
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should return false if no operation to retry', async () => {
      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      let retryResult: boolean;
      await act(async () => {
        retryResult = await result.current.retryLastOperation();
      });

      expect(retryResult).toBe(false);
    });
  });

  describe('resetRecovery', () => {
    it('should reset recovery state', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockRejectedValue(error);

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // Trigger an error
      await act(async () => {
        const p = result.current.recoverFromError(error, mockOperation);
        jest.advanceTimersByTime(1000);
        await p;
      });
      expect(result.current.recoveryState.retryCount).toBeGreaterThan(0);

      // Reset recovery
      act(() => {
        result.current.resetRecovery();
      });

      expect(result.current.recoveryState).toEqual({
        isRecovering: false,
        retryCount: 0,
        lastError: null,
        recoveryAttempts: 0,
        canRetry: false,
      });
    });
  });

  describe('shouldShowRetryButton', () => {
    it('should return true when retry is possible', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockRejectedValue(error);

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      await act(async () => {
        const p = result.current.recoverFromError(error, mockOperation);
        jest.advanceTimersByTime(1000); await p;
      });
      expect(result.current.shouldShowRetryButton()).toBe(true);
    });

    it('should return false when max retries reached', async () => {
      const error = new ApplicationError('Persistent error', 'PERSISTENT_ERROR', true);
      mockOperation.mockRejectedValue(error);

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // Simulate all retries failing
      const operations = [
        () => result.current.recoverFromError(error, mockOperation),
        () => result.current.retryLastOperation(),
        () => result.current.retryLastOperation(),
      ];
      for (const op of operations) { await act(async () => { await op(); jest.advanceTimersByTime(5000); }); }

      expect(result.current.shouldShowRetryButton()).toBe(false);
    });

    it('should return false when currently recovering', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      act(() => {
        result.current.recoverFromError(error, mockOperation);
      });

      expect(result.current.shouldShowRetryButton()).toBe(false);
    });
  });

  describe('getRecoveryMessage', () => {
    it('should return empty string when no error', () => {
      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      expect(result.current.getRecoveryMessage()).toBe('');
    });

    it('should return recovery message when recovering', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      act(() => {
        result.current.recoverFromError(error, mockOperation);
      });

      expect(result.current.getRecoveryMessage()).toContain('Retrying...');
      expect(result.current.getRecoveryMessage()).toContain('Attempt 1/3');
    });

    it('should return error message when retry not possible', async () => {
      const error = new ApplicationError('Auth error', 'AUTH_ERROR', false);
      isRetryableError.mockReturnValue(false);

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      await act(async () => {
        const p = result.current.recoverFromError(error, mockOperation);
        jest.advanceTimersByTime(1000); await p;
      });
      expect(result.current.getRecoveryMessage()).toContain('Auth error');
      expect(result.current.getRecoveryMessage()).toContain('Please try again later');
    });

    it('should return error message with remaining retries', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      await act(async () => {
        const p = result.current.recoverFromError(error, mockOperation);
        jest.advanceTimersByTime(1000); await p;
      });
      const message = result.current.getRecoveryMessage();
      expect(message).toContain('Network error');
      expect(message).toContain('2 retries remaining');
    });
  });

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      expect(result.current.getRetryDelay(1)).toBe(1000);
      expect(result.current.getRetryDelay(2)).toBe(2000);
      expect(result.current.getRetryDelay(3)).toBe(4000);
      expect(result.current.getRetryDelay(4)).toBe(8000);
    });

    it('should respect max delay', () => {
      const options = { ...defaultOptions, maxDelay: 5000 };
      const { result } = renderHook(() => useErrorRecovery(options));

      expect(result.current.getRetryDelay(10)).toBe(5000);
    });

    it('should handle custom backoff multiplier', () => {
      const options = { ...defaultOptions, backoffMultiplier: 3 };
      const { result } = renderHook(() => useErrorRecovery(options));

      expect(result.current.getRetryDelay(1)).toBe(1000);
      expect(result.current.getRetryDelay(2)).toBe(3000);
      expect(result.current.getRetryDelay(3)).toBe(9000);
    });
  });

  describe('concurrent recovery attempts', () => {
    it('should handle concurrent recovery attempts gracefully', async () => {
      const error = new ApplicationError('Network error', 'NETWORK_ERROR', true);
      mockOperation.mockResolvedValue('success');

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // Start two concurrent recovery attempts
      const recovery1 = act(async () => {
        return result.current.recoverFromError(error, mockOperation);
      });

      const recovery2 = act(async () => {
        return result.current.recoverFromError(error, mockOperation);
      });

      const [result1, result2] = await Promise.all([recovery1, recovery2]);

      // Both should succeed, but operation should only be called once per attempt
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('error state persistence', () => {
    it('should maintain error state across multiple operations', async () => {
      const error1 = new ApplicationError('First error', 'ERROR_1', true);
      const error2 = new ApplicationError('Second error', 'ERROR_2', true);

      mockOperation.mockRejectedValueOnce(error1).mockResolvedValueOnce('success');

      const { result } = renderHook(() => useErrorRecovery(defaultOptions));

      // First operation fails
      await act(async () => {
        await result.current.recoverFromError(error1, mockOperation);
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.recoveryState.lastError).toBe(error1);

      // Second operation succeeds
      await act(async () => {
        await result.current.recoverFromError(error2, mockOperation);
      });

      expect(result.current.recoveryState.lastError).toBe(error2);
    });
  });

  describe('return values', () => {
    it('should return all expected properties and methods', () => {
      const { result } = renderHook(() => useErrorRecovery());

      // State
      expect(result.current).toHaveProperty('recoveryState');

      // Recovery actions
      expect(result.current).toHaveProperty('recoverFromError');
      expect(result.current).toHaveProperty('retryLastOperation');
      expect(result.current).toHaveProperty('resetRecovery');

      // Utility functions
      expect(result.current).toHaveProperty('shouldShowRetryButton');
      expect(result.current).toHaveProperty('getRecoveryMessage');
      expect(result.current).toHaveProperty('getRetryDelay');

      // Verify all methods are functions
      expect(typeof result.current.recoverFromError).toBe('function');
      expect(typeof result.current.retryLastOperation).toBe('function');
      expect(typeof result.current.resetRecovery).toBe('function');
      expect(typeof result.current.shouldShowRetryButton).toBe('function');
      expect(typeof result.current.getRecoveryMessage).toBe('function');
      expect(typeof result.current.getRetryDelay).toBe('function');
    });
  });
});
