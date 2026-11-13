/**
 * Touch feedback as a timer starts or resumes, pauses or stops, once for
 * events that come together.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EVENTS } from '@taskmint/contracts';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { HAPTIC_GAP_MS, useTimerHaptics } from '../useTimerHaptics';

describe('useTimerHaptics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeBackendForTest({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const emit = (event: string) => act(() => fakeBackend().emit(event, {}));
  const later = () => vi.advanceTimersByTime(HAPTIC_GAP_MS);

  it('buzzes for each kind of timer change', () => {
    renderHook(() => useTimerHaptics());
    const { haptics } = fakeBackend().platform;

    emit(EVENTS.TIMER_INSTANCE_STARTED);
    later();
    emit(EVENTS.TIMER_INSTANCE_PAUSED);
    later();
    emit(EVENTS.TIMER_INSTANCE_RESUMED);
    later();
    emit(EVENTS.TIMER_INSTANCE_STOPPED);

    expect(haptics.mock.calls).toEqual([['start'], ['pause'], ['start'], ['stop']]);
  });

  it('buzzes once for changes that come together', () => {
    renderHook(() => useTimerHaptics());
    // Ending a session stops each of its timers; a hand-off stops one and starts another
    emit(EVENTS.TIMER_INSTANCE_STOPPED);
    emit(EVENTS.TIMER_INSTANCE_STOPPED);
    emit(EVENTS.TIMER_INSTANCE_STARTED);
    expect(fakeBackend().platform.haptics.mock.calls).toEqual([['stop']]);
  });

  it('does nothing where there is no touch feedback', () => {
    installFakeBackendForTest({ without: ['haptics'] });
    renderHook(() => useTimerHaptics());
    expect(() => emit(EVENTS.TIMER_INSTANCE_STARTED)).not.toThrow();
  });
});
