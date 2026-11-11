import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEnhancedSystemTray } from '../useEnhancedSystemTray';
import { fakeBackend } from '../../testing';

describe('useEnhancedSystemTray', () => {
  it('opens the start dialog when the tray asks, and stops listening on unmount', () => {
    const onShowStartDialog = vi.fn();
    const { unmount } = renderHook(() => useEnhancedSystemTray({ onShowStartDialog }));

    fakeBackend().emit('show-start-task-dialog');
    expect(onShowStartDialog).toHaveBeenCalledTimes(1);

    unmount();
    expect(fakeBackend().listenerCount('show-start-task-dialog')).toBe(0);
  });

  it('sends nothing: the backend reads the tasks from their record', () => {
    renderHook(() => useEnhancedSystemTray({ onShowStartDialog: vi.fn() }));
    expect(fakeBackend().call).not.toHaveBeenCalled();
    const events = fakeBackend().subscribe.mock.calls.map(([event]) => event);
    expect(events).toEqual(['show-start-task-dialog']);
  });
});
