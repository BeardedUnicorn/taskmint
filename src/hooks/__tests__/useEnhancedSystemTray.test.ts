import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEnhancedSystemTray } from '../useEnhancedSystemTray';
import { safeInvoke, safeListen } from '../../utils/tauri';
import { Task } from '../../types/task';

vi.mock('../../utils/tauri', () => ({
  isTauriEnvironment: vi.fn(() => true),
  safeInvoke: vi.fn().mockResolvedValue(undefined),
  safeListen: vi.fn(),
}));

const task = (id: string): Task => ({
  id,
  name: `Task ${id}`,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('useEnhancedSystemTray', () => {
  let trayHandler: (() => void) | undefined;
  const unlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    trayHandler = undefined;
    vi.mocked(safeListen).mockImplementation(async (_event, handler) => {
      trayHandler = () => handler({});
      return unlisten;
    });
  });

  it('mirrors the task list to the backend for the tray menu', async () => {
    const tasks = [task('a'), task('b')];
    const { rerender } = renderHook(props => useEnhancedSystemTray(props), {
      initialProps: { tasks, onShowStartDialog: vi.fn() },
    });

    expect(safeInvoke).toHaveBeenCalledWith('update_tasks', { tasks });

    const updated = [...tasks, task('c')];
    rerender({ tasks: updated, onShowStartDialog: vi.fn() });
    expect(safeInvoke).toHaveBeenLastCalledWith('update_tasks', { tasks: updated });
  });

  it("opens the start dialog when the tray asks, and stops listening on unmount", async () => {
    const onShowStartDialog = vi.fn();
    const { unmount } = renderHook(() =>
      useEnhancedSystemTray({ tasks: [], onShowStartDialog })
    );

    await waitFor(() => expect(trayHandler).toBeDefined());
    expect(safeListen).toHaveBeenCalledWith('show-start-task-dialog', expect.any(Function));
    trayHandler!();
    expect(onShowStartDialog).toHaveBeenCalledTimes(1);

    unmount();
    expect(unlisten).toHaveBeenCalled();
  });

  it('no longer drives timers from the frontend', () => {
    renderHook(() => useEnhancedSystemTray({ tasks: [], onShowStartDialog: vi.fn() }));
    const commands = vi.mocked(safeInvoke).mock.calls.map(([command]) => command);
    expect(commands).toEqual(['update_tasks']);
    const events = vi.mocked(safeListen).mock.calls.map(([event]) => event);
    expect(events).toEqual(['show-start-task-dialog']);
  });
});
