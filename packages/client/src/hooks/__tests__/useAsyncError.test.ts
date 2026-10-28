import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AsyncError, useAsyncError } from '../useAsyncError';

describe('useAsyncError', () => {
  it("wraps a failure in an AsyncError that keeps the cause's code", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAsyncError());
    const errorHandler = vi.fn();
    const failure = await result.current
      .executeAsync(() => Promise.reject({ message: 'quota exceeded', code: 'QUOTA' }), { operation: 'save', errorHandler })
      .catch(error => error);
    expect(failure).toBeInstanceOf(AsyncError);
    expect([failure.message, failure.code, failure.operation]).toEqual(['quota exceeded', 'QUOTA', 'save']);
    expect(errorHandler).toHaveBeenCalledWith(failure);
  });

  it('passes an AsyncError on as it is', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAsyncError());
    const original = new AsyncError('inner', 'load');
    await expect(result.current.executeAsync(() => Promise.reject(original))).rejects.toBe(original);
    expect(original.code).toBeUndefined();
  });
});
