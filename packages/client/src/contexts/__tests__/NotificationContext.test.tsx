import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { NotificationProvider, useNotification, useNotificationState } from '../NotificationContext';
import { NavigationProvider, useNavigation } from '../NavigationContext';
import { deliverDesktop } from '../../notifications/desktop';
import { EXIT_MS, MAX_QUEUED, MAX_VISIBLE } from '../../notifications/store';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../notifications/preferences';

let attended = true;
vi.mock('../../notifications/attention', () => ({
  isWindowAttended: () => attended,
  subscribeAttention: () => () => {},
}));
vi.mock('../../notifications/desktop', () => ({ deliverDesktop: vi.fn() }));
const mockDeliver = vi.mocked(deliverDesktop);

const wrapper = ({ children }: { children: ReactNode }) => (
  <NavigationProvider>
    <NotificationProvider>{children}</NotificationProvider>
  </NavigationProvider>
);

function useBoth() {
  return { api: useNotification(), state: useNotificationState(), navigation: useNavigation() };
}

/** The toasts on screen, top to bottom: title, message, count and buttons as text. */
const toasts = () =>
  Array.from(document.querySelectorAll('[role="status"], [role="alert"]'), toast => toast.textContent);

describe('NotificationProvider', () => {
  beforeEach(() => {
    attended = true;
    localStorage.clear();
    vi.clearAllMocks();
    mockDeliver.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast with the right role, and click-away does not dismiss it', () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showError('Backup failed: disk full');
      result.current.api.showSuccess('Saved');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Backup failed: disk full');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('dismisses only the focused toast on Escape', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showInfo('First');
      result.current.api.showInfo('Second');
    });
    const [first] = screen.getAllByRole('status');

    fireEvent.keyDown(first, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });

    expect(toasts()).toEqual(['Second']);
  });

  it('runs a button and dismisses the toast; a page button navigates', () => {
    const retry = vi.fn();
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.notify({
        message: 'Backup failed',
        severity: 'error',
        actions: [
          { label: 'Retry', onClick: retry },
          { label: 'Backup settings', view: 'settings', section: 'backups' },
        ],
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    return waitFor(() => expect(retry).toHaveBeenCalled()).then(() => {
      act(() => {
        result.current.api.notify({
          message: 'Captured',
          actions: [{ label: 'Review in Payouts', view: 'payouts' }],
        });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Review in Payouts' }));
      expect(result.current.navigation.view).toBe('payouts');
    });
  });

  it('keeps the API object stable across toasts', () => {
    const { result } = renderHook(useBoth, { wrapper });
    const api = result.current.api;
    act(() => {
      result.current.api.showSuccess('One');
      result.current.api.showWarning('Two');
    });
    expect(result.current.api).toBe(api);
  });

  it('records history: read when seen in the window, unread when sent while away', async () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showSuccess('Seen');
    });
    attended = false;
    act(() => {
      result.current.api.notify({ category: 'workLog', severity: 'success', message: 'Imported 3' });
    });

    const [latest, earlier] = result.current.state.history;
    expect(latest).toMatchObject({ message: 'Imported 3', read: false, delivery: 'both' });
    expect(earlier).toMatchObject({ message: 'Seen', read: true, delivery: 'toast' });
    expect(result.current.state.unread).toBe(1);
    await waitFor(() => expect(mockDeliver).toHaveBeenCalledWith('workLogCapture', 'TaskMint', 'Imported 3'));

    act(() => result.current.state.markAllRead());
    expect(result.current.state.unread).toBe(0);
  });

  it('falls back to a toast when the OS does not show a reminder', async () => {
    attended = false;
    mockDeliver.mockResolvedValue(false);
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.notify({
        category: 'goal',
        severity: 'success',
        title: 'Goal Achieved!',
        message: 'Well done',
      });
    });
    expect(toasts()).toHaveLength(0);
    await waitFor(() => expect(toasts()).toEqual(['Goal Achieved!Well done']));
  });

  it("leaves 'history: false' messages out of the history", () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.notify({ message: 'Copied', history: false });
    });
    expect(result.current.state.history).toEqual([]);
    expect(toasts()).toEqual(['Copied']);
  });

  it('tells the shell the preferences for the notifications it raises itself', async () => {
    renderHook(useBoth, { wrapper });

    await waitFor(() =>
      expect(fakeBackend().platform.notifications.setPreferences).toHaveBeenCalledWith(DEFAULT_NOTIFICATION_PREFERENCES)
    );
  });

  it('logs preferences the shell refused', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeBackend().platform.notifications.setPreferences.mockRejectedValueOnce('store locked');

    renderHook(useBoth, { wrapper });

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to send notification preferences:', 'store locked'));
    error.mockRestore();
  });

  it('sends no preferences where the shell raises no notifications of its own', () => {
    const desktop = fakeBackend();
    const shell = installFakeBackendForTest({});
    delete (shell.platform.notifications as { setPreferences?: unknown }).setPreferences;

    renderHook(useBoth, { wrapper });

    expect(desktop.platform.notifications.setPreferences).not.toHaveBeenCalled();
  });

  it('adds what the backend showed to the history (and a toast while you are here)', async () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      fakeBackend().emit('notification-posted', {
        id: 'b1',
        kind: 'longRun',
        title: 'Still working?',
        body: 'Running 4h',
        // Now: the history drops entries older than 14 days
        at: new Date().toISOString(),
      });
    });

    expect(result.current.state.history[0]).toMatchObject({
      title: 'Still working?',
      origin: 'backend',
      category: 'longRun',
      read: false,
    });
    expect(toasts()).toEqual(['Still working?Running 4h']);
  });

  it('keeps a toast with no duration until dismissed', () => {
    vi.useFakeTimers();
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showInfo('Stays', { duration: null });
    });
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(toasts()).toEqual(['Stays']);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });
    expect(toasts()).toEqual([]);
  });

  it("holds a toast's time while it's hovered", () => {
    vi.useFakeTimers();
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showInfo('Read me', { duration: 1000 });
    });

    fireEvent.pointerEnter(screen.getByRole('status'), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(toasts()).toEqual(['Read me']);

    fireEvent.pointerLeave(screen.getByRole('status'), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(toasts()).toEqual([]);
  });

  it('merges a repeat within a minute into one history entry', () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showInfo('Saved');
      result.current.api.showInfo('Saved');
    });

    expect(result.current.state.history).toEqual([expect.objectContaining({ message: 'Saved', count: 2 })]);
    expect(toasts()).toEqual(['Saved×2']);
  });

  it('starts the history over when cleared, so a repeat is new again', () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => result.current.api.showInfo('Saved'));
    act(() => result.current.state.clearHistory());
    expect(result.current.state.history).toEqual([]);

    act(() => result.current.api.showInfo('Saved'));
    expect(result.current.state.history).toEqual([expect.objectContaining({ count: 1 })]);
  });

  it('keeps unread a toast dropped from the queue unseen', () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      for (let i = 0; i < MAX_VISIBLE; i++) result.current.api.showInfo(`sticky ${i}`, { duration: null });
      for (let i = 0; i <= MAX_QUEUED; i++) result.current.api.showInfo(`waiting ${i}`);
    });

    const dropped = result.current.state.history.find(entry => entry.message === 'waiting 0');
    expect(dropped?.read).toBe(false);
    expect(result.current.state.unread).toBe(1);
  });

  it('drops a queued toast kept out of the history without a trace', () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      for (let i = 0; i < MAX_VISIBLE; i++) result.current.api.showInfo(`sticky ${i}`, { duration: null });
      result.current.api.showInfo('Copied', { history: false });
      for (let i = 0; i < MAX_QUEUED; i++) result.current.api.showInfo(`waiting ${i}`);
    });

    expect(result.current.state.history.some(entry => entry.message === 'Copied')).toBe(false);
    expect(result.current.state.unread).toBe(0);
  });

  it('sends the same error to the OS only as often as the throttle allows', async () => {
    attended = false;
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showError('Sync failed');
      result.current.api.showError('Sync failed');
    });

    await waitFor(() => expect(mockDeliver).toHaveBeenCalledTimes(1));
    expect(mockDeliver).toHaveBeenCalledWith('error', 'TaskMint', 'Sync failed');
  });

  it('sends nothing, nor keeps it, when its category is off and you are away', () => {
    localStorage.setItem('notificationPreferences', JSON.stringify({ version: 1, data: { dailySummary: false } }));
    attended = false;
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.notify({ category: 'dailySummary', message: 'Today: 3h' });
    });

    expect(toasts()).toEqual([]);
    expect(result.current.state.history).toEqual([]);
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('keeps what the backend showed while you were away, as a warning for an idle pause', () => {
    attended = false;
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      fakeBackend().emit('notification-posted', {
        id: 'b2',
        kind: 'idlePause',
        title: 'Paused',
        body: 'Away 10m',
        at: new Date().toISOString(),
      });
      fakeBackend().emit('notification-posted', {
        id: 'b3',
        kind: 'general',
        title: 'Note',
        body: 'Something else',
        at: new Date().toISOString(),
      });
    });

    expect(toasts()).toEqual([]);
    expect(result.current.state.history.map(entry => [entry.category, entry.severity, entry.delivery])).toEqual(
      expect.arrayContaining([
        ['idle', 'warning', 'desktop'],
        ['general', 'info', 'desktop'],
      ])
    );
  });

  it("opens a page button's section, dismissing its toast", () => {
    vi.useFakeTimers();
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.notify({
        message: 'Backup failed',
        actions: [{ label: 'Backup settings', view: 'settings', section: 'backups' }],
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Backup settings' }));
    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });

    expect(result.current.navigation).toMatchObject({ view: 'settings', params: { section: 'backups' } });
    expect(toasts()).toEqual([]);
  });

  it("runs the history's buttons, logging one that fails", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(useBoth, { wrapper });

    act(() => result.current.state.runAction({ label: 'Payouts', view: 'payouts' }));
    expect(result.current.navigation.view).toBe('payouts');

    act(() =>
      result.current.state.runAction({
        label: 'Retry',
        onClick: () => {
          throw new Error('offline');
        },
      })
    );
    await waitFor(() => expect(error).toHaveBeenCalledWith('Notification action "Retry" failed:', expect.any(Error)));
    error.mockRestore();
  });
});

describe('useNotification', () => {
  it('needs the provider', () => {
    expect(() => render(<Probe />)).toThrow(/NotificationProvider/);
  });
});

describe('useNotificationState', () => {
  it('needs the provider', () => {
    expect(() => renderHook(() => useNotificationState())).toThrow(/NotificationProvider/);
  });
});

function Probe() {
  useNotification();
  return null;
}
