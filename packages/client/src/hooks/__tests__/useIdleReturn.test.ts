import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useIdleReturn } from '../useIdleReturn';
import { IdlePause } from '../../types/timer';
import { STORAGE_KEYS } from '../../constants';
import { fakeBackend, installFakeBackendForTest } from '../../testing';

const idle = () => fakeBackend().platform.idle;

const away: IdlePause = {
  instanceId: 'i-1',
  taskName: 'Annotation',
  idleSince: '2026-10-12T20:15:00.000Z',
  returned: true,
  awayMs: 25 * 60_000,
};

describe('useIdleReturn', () => {
  beforeEach(() => {
    window.localStorage.clear();
    idle().getPending.mockResolvedValue(null);
    idle().resolve.mockResolvedValue(undefined);
  });

  it('sends the saved detection settings to the platform at startup', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.INACTIVITY_SETTINGS,
      JSON.stringify({ version: 1, data: { enabled: true, thresholdMinutes: 10 } })
    );

    renderHook(() => useIdleReturn());

    await waitFor(() =>
      expect(idle().setSettings).toHaveBeenCalledWith({ enabled: true, thresholdMinutes: 10, longRunHours: 4 })
    );
  });

  it('picks up a question raised before it was listening', async () => {
    idle().getPending.mockResolvedValue(away);

    const { result } = renderHook(() => useIdleReturn());

    await waitFor(() => expect(result.current.pending).toEqual(away));
  });

  it('ignores a pending pause while the user is still away', async () => {
    idle().getPending.mockResolvedValue({ ...away, returned: false });

    const { result } = renderHook(() => useIdleReturn());

    await waitFor(() => expect(idle().getPending).toHaveBeenCalled());
    expect(result.current.pending).toBeNull();
  });

  it('logs a pending question it could not read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    idle().getPending.mockRejectedValue('no monitor');

    const { result } = renderHook(() => useIdleReturn());

    await waitFor(() => expect(warn).toHaveBeenCalledWith('Failed to read a pending idle pause:', 'no monitor'));
    expect(result.current.pending).toBeNull();
    warn.mockRestore();
  });

  it('ignores a question that arrives after unmounting', async () => {
    let answer: (pause: IdlePause) => void = () => {};
    idle().getPending.mockReturnValue(new Promise(resolve => (answer = resolve)));

    const { result, unmount } = renderHook(() => useIdleReturn());
    unmount();
    await act(async () => answer(away));

    expect(result.current.pending).toBeNull();
  });

  it('opens on idle-returned and closes on idle-resolved', () => {
    const { result, unmount } = renderHook(() => useIdleReturn());

    act(() => fakeBackend().emit('idle-returned', away));
    expect(result.current.pending).toEqual(away);

    act(() => fakeBackend().emit('idle-resolved'));
    expect(result.current.pending).toBeNull();

    unmount();
    expect(fakeBackend().listenerCount('idle-returned')).toBe(0);
    expect(fakeBackend().listenerCount('idle-resolved')).toBe(0);
  });

  it('sends the choice and clears the question', async () => {
    const { result } = renderHook(() => useIdleReturn());
    act(() => fakeBackend().emit('idle-returned', away));

    await act(async () => {
      await result.current.resolve('keepResume');
    });

    expect(idle().resolve).toHaveBeenCalledWith('keepResume');
    expect(result.current.pending).toBeNull();
  });

  it('keeps the question open with the reason when the choice fails', async () => {
    idle().resolve.mockRejectedValue('Another timer instance is already running');
    const { result } = renderHook(() => useIdleReturn());
    act(() => fakeBackend().emit('idle-returned', away));

    await act(async () => {
      await result.current.resolve('discardResume');
    });

    expect(result.current.pending).toEqual(away);
    expect(result.current.error).toBe('Another timer instance is already running');
  });

  it('asks nothing and sends no settings where the platform has no idle detection', () => {
    const desktop = fakeBackend();
    installFakeBackendForTest({ without: ['idle'] });

    const { result } = renderHook(() => useIdleReturn());

    expect(result.current.pending).toBeNull();
    expect(desktop.platform.idle.getPending).not.toHaveBeenCalled();
    expect(desktop.platform.idle.setSettings).not.toHaveBeenCalled();
  });
});
