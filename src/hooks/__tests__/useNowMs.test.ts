import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNowMs } from '../useNowMs';

describe('useNowMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks only while active', () => {
    const { result, rerender } = renderHook(({ active }) => useNowMs(active, 1000), {
      initialProps: { active: false },
    });
    const start = result.current;

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(start);

    rerender({ active: true });
    expect(result.current).toBe(start + 5000); // catches up when it starts
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(start + 7000);
  });

  it('refreshes once when refreshOn changes', () => {
    const { result, rerender } = renderHook(({ key }) => useNowMs(false, 1000, key), {
      initialProps: { key: 1 },
    });
    const start = result.current;
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    rerender({ key: 2 });

    expect(result.current).toBe(start + 3000);
  });
});
