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
  // Flush any pending timers within React's act to avoid warnings
  act(() => {
    vi.runOnlyPendingTimers();
  });
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
    act(() => {
      rerender({ isRunning: false, startTime });
    });
    
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
    act(() => {
      rerender({ isRunning: false, startTime: initialStartTime });
    });
    expect(result.current).toBe(0);

    // Start with new start time
    const newStartTime = new Date();
    act(() => {
      rerender({ isRunning: true, startTime: newStartTime });
    });

    // Should start from 0 again
    expect(result.current).toBeLessThan(100);
  });

  it('should reset when startTime changes while running', () => {
    const initialStart = new Date();
    const { result, rerender } = renderHook(
      ({ isRunning, startTime }) => useTimer(isRunning, startTime),
      { initialProps: { isRunning: true, startTime: initialStart } }
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBeGreaterThan(1900);

    const newStart = new Date();
    act(() => {
      rerender({ isRunning: true, startTime: newStart });
    });

    // After changing the start time while running, elapsed should reset
    expect(result.current).toBeLessThan(100);
  });

  it('should subtract the paused offset from the elapsed time', () => {
    // Started 60s ago, but 20s of that was spent paused
    const startTime = new Date(Date.now() - 60_000);
    const { result } = renderHook(() => useTimer(true, startTime, 20_000));

    expect(result.current).toBeGreaterThan(39_900);
    expect(result.current).toBeLessThan(40_100);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBeGreaterThan(44_900);
    expect(result.current).toBeLessThan(45_100);
  });

  it('should recompute immediately when the paused offset grows (resume)', () => {
    const startTime = new Date(Date.now() - 60_000);
    const { result, rerender } = renderHook(
      ({ offset }) => useTimer(true, startTime, offset),
      { initialProps: { offset: 0 } }
    );

    expect(result.current).toBeGreaterThan(59_900);

    // A resume lands: accumulated pause becomes 30s
    act(() => {
      rerender({ offset: 30_000 });
    });

    expect(result.current).toBeGreaterThan(29_900);
    expect(result.current).toBeLessThan(30_100);
  });

  it('should clamp to zero when the offset exceeds wall-clock elapsed', () => {
    const startTime = new Date(Date.now() - 1_000);
    const { result } = renderHook(() => useTimer(true, startTime, 10_000));

    expect(result.current).toBe(0);
  });
});
