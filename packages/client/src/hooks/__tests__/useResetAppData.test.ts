/**
 * Tests for useResetAppData hook
 *
 * The reset must be ordered: backend stores first, then localStorage, then
 * the reload — and a backend failure must abort before any frontend data is
 * cleared.
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../utils/appReload', () => ({
  reloadApp: vi.fn(),
}));

import { reloadApp } from '../../utils/appReload';
import { useResetAppData } from '../useResetAppData';
import { fakeBackend } from '../../testing';

const mockInvoke = fakeBackend().call;
const mockReloadApp = vi.mocked(reloadApp);

describe('useResetAppData', () => {
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ backupsDeleted: 0, warning: null });
  });

  it('resets backend data, clears localStorage, and reloads the app', async () => {
    const { result } = renderHook(() => useResetAppData({ onError }));

    await act(async () => {
      await result.current.resetAllData();
    });

    expect(mockInvoke).toHaveBeenCalledWith('reset_all_app_data');
    expect(window.localStorage.clear).toHaveBeenCalled();
    expect(mockReloadApp).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    // The page is about to unload, so the busy state must persist.
    expect(result.current.isResetting).toBe(true);
  });

  it('aborts before clearing frontend data when the backend reset fails', async () => {
    mockInvoke.mockRejectedValue(new Error('store locked'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useResetAppData({ onError }));

    await act(async () => {
      await result.current.resetAllData();
    });

    expect(window.localStorage.clear).not.toHaveBeenCalled();
    expect(mockReloadApp).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Failed to reset app data. Please try again.');
    expect(result.current.isResetting).toBe(false);

    consoleSpy.mockRestore();
  });

  it('logs a summary warning without failing the reset', async () => {
    mockInvoke.mockResolvedValue({ backupsDeleted: 2, warning: 'backups not removed' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useResetAppData({ onError }));

    await act(async () => {
      await result.current.resetAllData();
    });

    expect(warnSpy).toHaveBeenCalledWith('backups not removed');
    expect(mockReloadApp).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('ignores calls while a reset is already in flight', async () => {
    const { result } = renderHook(() => useResetAppData({ onError }));

    await act(async () => {
      await result.current.resetAllData();
    });
    // The first reset succeeded and left isResetting true (awaiting reload).
    await act(async () => {
      await result.current.resetAllData();
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockReloadApp).toHaveBeenCalledTimes(1);
  });
});
