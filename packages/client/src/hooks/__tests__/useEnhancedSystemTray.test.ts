import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEnhancedSystemTray } from '../useEnhancedSystemTray';
import { Task } from '../../types/task';
import { fakeBackend } from '../../testing';

const task = (id: string): Task => ({
  id,
  name: `Task ${id}`,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('useEnhancedSystemTray', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeBackend().call.mockResolvedValue(undefined);
  });

  it('mirrors the task list to the backend for the tray menu', () => {
    const tasks = [task('a'), task('b')];
    const { rerender } = renderHook(props => useEnhancedSystemTray(props), {
      initialProps: { tasks, onShowStartDialog: vi.fn() },
    });

    expect(fakeBackend().call).toHaveBeenCalledWith('update_tasks', { tasks });

    const updated = [...tasks, task('c')];
    rerender({ tasks: updated, onShowStartDialog: vi.fn() });
    expect(fakeBackend().call).toHaveBeenLastCalledWith('update_tasks', { tasks: updated });
  });

  it('logs a task list the backend refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeBackend().call.mockRejectedValue('store locked');

    renderHook(() => useEnhancedSystemTray({ tasks: [], onShowStartDialog: vi.fn() }));

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Failed to send the task list to the backend:', 'store locked')
    );
    warn.mockRestore();
  });

  it('opens the start dialog when the tray asks, and stops listening on unmount', () => {
    const onShowStartDialog = vi.fn();
    const { unmount } = renderHook(() => useEnhancedSystemTray({ tasks: [], onShowStartDialog }));

    fakeBackend().emit('show-start-task-dialog');
    expect(onShowStartDialog).toHaveBeenCalledTimes(1);

    unmount();
    expect(fakeBackend().listenerCount('show-start-task-dialog')).toBe(0);
  });

  it('no longer drives timers from the client', () => {
    renderHook(() => useEnhancedSystemTray({ tasks: [], onShowStartDialog: vi.fn() }));
    const commands = fakeBackend().call.mock.calls.map(([command]) => command);
    expect(commands).toEqual(['update_tasks']);
    const events = fakeBackend().subscribe.mock.calls.map(([event]) => event);
    expect(events).toEqual(['show-start-task-dialog']);
  });
});
