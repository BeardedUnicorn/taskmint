import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useIdleReturn } from '../useIdleReturn';
import { safeInvoke, safeListen } from '../../utils/tauri';
import { IdlePause } from '../../types/timer';
import { STORAGE_KEYS } from '../../constants';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../utils/tauri', () => ({
  isTauriEnvironment: vi.fn(() => true),
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);
const mockSafeInvoke = vi.mocked(safeInvoke);
const mockSafeListen = vi.mocked(safeListen);

const away: IdlePause = {
  instanceId: 'i-1',
  taskName: 'Annotation',
  idleSince: '2026-10-12T20:15:00.000Z',
  returned: true,
  awayMs: 25 * 60_000,
};

describe('useIdleReturn', () => {
  let handlers: Record<string, (event: { payload?: unknown }) => void>;
  const unlisten = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
    vi.clearAllMocks();
    handlers = {};
    mockSafeListen.mockImplementation(async (event, handler) => {
      handlers[event] = handler;
      return unlisten;
    });
    mockSafeInvoke.mockResolvedValue(null);
  });

  it('sends the saved detection settings to the backend at startup', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.INACTIVITY_SETTINGS,
      JSON.stringify({ version: 1, data: { enabled: true, thresholdMinutes: 10 } })
    );

    renderHook(() => useIdleReturn());

    await waitFor(() =>
      expect(mockSafeInvoke).toHaveBeenCalledWith('set_idle_settings', {
        settings: { enabled: true, thresholdMinutes: 10 },
      })
    );
  });

  it('picks up a question raised before it was listening', async () => {
    mockSafeInvoke.mockImplementation(async (command: string) =>
      command === 'get_idle_pause' ? away : null
    );

    const { result } = renderHook(() => useIdleReturn());

    await waitFor(() => expect(result.current.pending).toEqual(away));
  });

  it('ignores a pending pause while the user is still away', async () => {
    mockSafeInvoke.mockImplementation(async (command: string) =>
      command === 'get_idle_pause' ? { ...away, returned: false } : null
    );

    const { result } = renderHook(() => useIdleReturn());

    await waitFor(() => expect(mockSafeInvoke).toHaveBeenCalledWith('get_idle_pause'));
    expect(result.current.pending).toBeNull();
  });

  it('opens on idle-returned and closes on idle-resolved', async () => {
    const { result, unmount } = renderHook(() => useIdleReturn());
    await waitFor(() => expect(handlers['idle-returned']).toBeDefined());

    act(() => handlers['idle-returned']({ payload: away }));
    expect(result.current.pending).toEqual(away);

    act(() => handlers['idle-resolved']({}));
    expect(result.current.pending).toBeNull();

    unmount();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });

  it('sends the choice and clears the question', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useIdleReturn());
    await waitFor(() => expect(handlers['idle-returned']).toBeDefined());
    act(() => handlers['idle-returned']({ payload: away }));

    await act(async () => {
      await result.current.resolve('keepResume');
    });

    expect(mockInvoke).toHaveBeenCalledWith('resolve_idle_pause', { choice: 'keepResume' });
    expect(result.current.pending).toBeNull();
  });

  it('keeps the question open with the reason when the choice fails', async () => {
    mockInvoke.mockRejectedValue('Another timer instance is already running');
    const { result } = renderHook(() => useIdleReturn());
    await waitFor(() => expect(handlers['idle-returned']).toBeDefined());
    act(() => handlers['idle-returned']({ payload: away }));

    await act(async () => {
      await result.current.resolve('discardResume');
    });

    expect(result.current.pending).toEqual(away);
    expect(result.current.error).toBe('Another timer instance is already running');
  });
});
