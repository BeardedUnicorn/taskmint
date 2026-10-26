import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { listen } from '@tauri-apps/api/event';
import { useTauriEvent } from '../useTauriEvent';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
const mockListen = vi.mocked(listen);

describe('useTauriEvent', () => {
  let handlers: Record<string, (event: unknown) => void>;
  let unlisteners: Record<string, Mock<() => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    unlisteners = {};
    mockListen.mockImplementation(async (event, handler) => {
      handlers[event as string] = handler as (event: unknown) => void;
      unlisteners[event as string] = vi.fn();
      return unlisteners[event as string];
    });
  });

  it('calls the latest handler without re-registering', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useTauriEvent('ping', handler), {
      initialProps: { handler: first },
    });
    await waitFor(() => expect(handlers.ping).toBeDefined());

    rerender({ handler: second });
    handlers.ping({ payload: 1 });

    expect(second).toHaveBeenCalledWith({ payload: 1 });
    expect(first).not.toHaveBeenCalled();
    expect(mockListen).toHaveBeenCalledTimes(1);
  });

  it('listens to each event in a list and unlistens all on unmount', async () => {
    const { unmount } = renderHook(() => useTauriEvent(['a', 'b'], vi.fn()));
    await waitFor(() => expect(Object.keys(handlers)).toEqual(['a', 'b']));

    unmount();

    expect(unlisteners.a).toHaveBeenCalled();
    expect(unlisteners.b).toHaveBeenCalled();
  });

  it('removes a listener that finishes registering after unmount', async () => {
    let resolve!: (unlisten: () => void) => void;
    mockListen.mockImplementation(() => new Promise(r => (resolve = r)));
    const { unmount } = renderHook(() => useTauriEvent('late', vi.fn()));

    unmount();
    const unlisten = vi.fn();
    resolve(unlisten);

    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });

  it('ignores listen failing outside the desktop app', async () => {
    mockListen.mockRejectedValue(new Error('no backend'));
    expect(() => renderHook(() => useTauriEvent('x', vi.fn()))).not.toThrow();
  });
});
