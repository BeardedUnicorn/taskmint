import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getBackend, setBackend, useBackendEvent } from '..';
import { createFakeBackend, fakeBackend, installFakeBackend } from '../../testing';

describe('the page backend', () => {
  it('is the one set last', () => {
    const backend = createFakeBackend();
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
    const { rerender } = renderHook(({ handler }) => useBackendEvent(['a', 'b'], handler), {
      initialProps: { handler: first },
    });

    rerender({ handler: second });
    fakeBackend().emit('a', 1);
    fakeBackend().emit('b', 2);

    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([[1], [2]]);
    expect(fakeBackend().subscribe).toHaveBeenCalledTimes(2);
  });

  it('takes a single event name, and stops listening on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useBackendEvent('only', handler));
    expect(fakeBackend().listenerCount('only')).toBe(1);

    unmount();
    fakeBackend().emit('only', 'late');

    expect(fakeBackend().listenerCount('only')).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
