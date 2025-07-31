/**
 * Tests for useTimer hook
 */

import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../../hooks/useTimer';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// Mock timers
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useTimer', () => {
  it('should return 0 when timer is not running', () => {
    const { result } = renderHook(() => useTimer(false, new Date()));
    
    expect(result.current).toBe(0);
  });

  it('should return 0 when timer is not running even with a start time', () => {
    const startTime = new Date(Date.now() - 5000); // 5 seconds ago
    const { result } = renderHook(() => useTimer(false, startTime));
    
    expect(result.current).toBe(0);
  });

  it('should calculate elapsed time when timer is running', () => {
    const startTime = new Date();
    const { result } = renderHook(() => useTimer(true, startTime));

    // Initially should be close to 0
    expect(result.current).toBeLessThan(100);

    // Advance time by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should be approximately 5000ms
    expect(result.current).toBeGreaterThan(4900);
    expect(result.current).toBeLessThan(5100);
  });

  it('should update elapsed time when timer is running', () => {
    const startTime = new Date();
    const { result } = renderHook(() => useTimer(true, startTime));
    
    // Initially should be close to 0
    expect(result.current).toBeLessThan(100);
    
    // Advance time by 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    
    // Should be approximately 2000ms
    expect(result.current).toBeGreaterThan(1900);
    expect(result.current).toBeLessThan(2100);
  });

  it('should reset to 0 when timer stops', () => {
    const startTime = new Date();
    const { result, rerender } = renderHook(
      ({ isRunning, startTime }) => useTimer(isRunning, startTime),
      { initialProps: { isRunning: true, startTime } }
    );
    
    // Advance time while running
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    
    // Should have elapsed time
    expect(result.current).toBeGreaterThan(2900);
    
    // Stop the timer
    rerender({ isRunning: false, startTime });
    
    // Should reset to 0
    expect(result.current).toBe(0);
  });

  it('should handle undefined start time', () => {
    const { result } = renderHook(() => useTimer(true, undefined));

    expect(result.current).toBe(0);
  });

  it('should handle invalid Date objects', () => {
    const invalidDate = new Date('invalid');
    const { result } = renderHook(() => useTimer(true, invalidDate));

    expect(result.current).toBe(0);
  });

  it('should handle non-Date objects passed as startTime', () => {
    const { result } = renderHook(() => useTimer(true, 'not-a-date' as any));

    expect(result.current).toBe(0);
  });

  it('should handle timer restart with new start time', () => {
    const initialStartTime = new Date();
    const { result, rerender } = renderHook(
      ({ isRunning, startTime }) => useTimer(isRunning, startTime),
      { initialProps: { isRunning: true, startTime: initialStartTime } }
    );
    
    // Advance time
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    
    expect(result.current).toBeGreaterThan(1900);
    
    // Stop timer
    rerender({ isRunning: false, startTime: initialStartTime });
    expect(result.current).toBe(0);
    
    // Start with new start time
    const newStartTime = new Date();
    rerender({ isRunning: true, startTime: newStartTime });
    
    // Should start from 0 again
    expect(result.current).toBeLessThan(100);
  });
});
