import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getBackend, setBackend, useBackendEvent } from '..';
import { EVENTS } from '@taskmint/contracts';
import { asBackend, createFakeBackend, fakeBackend, installFakeBackend } from '../../testing';

describe('the page backend', () => {
  it('is the one set last', () => {
    const backend = asBackend(createFakeBackend());
    setBackend(backend);
    expect(getBackend()).toBe(backend);
    installFakeBackend();
  });

  it('must be set before anything asks for it', async () => {
    vi.resetModules();
    const registry = await import('../registry');
    expect(() => registry.getBackend()).toThrow('No backend: startClient sets one before rendering');
  });
});

describe('useBackendEvent', () => {
  it('hands each payload to the latest handler, subscribing once per event list', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handler }) => useBackendEvent([EVENTS.IDLE_RETURNED, EVENTS.IDLE_RESOLVED], handler),
      {
        initialProps: { handler: first },
      }
    );

    rerender({ handler: second });
    fakeBackend().emit(EVENTS.IDLE_RETURNED, 1);
    fakeBackend().emit(EVENTS.IDLE_RESOLVED, 2);

    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([[1], [2]]);
    expect(fakeBackend().subscribe).toHaveBeenCalledTimes(2);
  });

  it('takes a single event name, and stops listening on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useBackendEvent(EVENTS.SESSIONS_CHANGED, handler));
    expect(fakeBackend().listenerCount(EVENTS.SESSIONS_CHANGED)).toBe(1);

    unmount();
    fakeBackend().emit(EVENTS.SESSIONS_CHANGED, 'late');

    expect(fakeBackend().listenerCount(EVENTS.SESSIONS_CHANGED)).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
