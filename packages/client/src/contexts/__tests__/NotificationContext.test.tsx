import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { NotificationProvider, useNotification, useNotificationState } from '../NotificationContext';
import { NavigationProvider, useNavigation } from '../NavigationContext';
import { deliverDesktop } from '../../notifications/desktop';
import { EXIT_MS } from '../../notifications/store';

let attended = true;
vi.mock('../../notifications/attention', () => ({
  isWindowAttended: () => attended,
  subscribeAttention: () => () => {},
}));
vi.mock('../../notifications/desktop', () => ({ deliverDesktop: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
const mockDeliver = vi.mocked(deliverDesktop);
const mockListen = vi.mocked(listen);

const wrapper = ({ children }: { children: ReactNode }) => (
  <NavigationProvider>
    <NotificationProvider>{children}</NotificationProvider>
  </NavigationProvider>
);

function useBoth() {
  return { api: useNotification(), state: useNotificationState(), navigation: useNavigation() };
}

describe('NotificationProvider', () => {
  let handlers: Record<string, (event: { payload: unknown }) => void>;

  beforeEach(() => {
    attended = true;
    localStorage.clear();
    vi.clearAllMocks();
    mockDeliver.mockResolvedValue(true);
    handlers = {};
    mockListen.mockImplementation(async (event, handler) => {
      handlers[event as string] = handler as (event: { payload: unknown }) => void;
      return () => {};
    });
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

    expect(result.current.state.toasts.map(t => t.message)).toEqual(['Second']);
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
      result.current.api.notify({ category: 'goal', severity: 'success', title: 'Goal Achieved!', message: 'Well done' });
    });
    expect(result.current.state.toasts).toHaveLength(0);
    await waitFor(() => expect(result.current.state.toasts.map(t => t.title)).toEqual(['Goal Achieved!']));
  });

  it("leaves 'history: false' messages out of the history", () => {
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.notify({ message: 'Copied', history: false });
    });
    expect(result.current.state.history).toEqual([]);
    expect(result.current.state.toasts).toHaveLength(1);
  });

  it('adds what the backend showed to the history (and a toast while you are here)', async () => {
    const { result } = renderHook(useBoth, { wrapper });
    await waitFor(() => expect(handlers['notification-posted']).toBeDefined());

    act(() => {
      handlers['notification-posted']({
        payload: { id: 'b1', kind: 'longRun', title: 'Still working?', body: 'Running 4h', at: '2026-10-13T12:00:00Z' },
      });
    });

    expect(result.current.state.history[0]).toMatchObject({
      title: 'Still working?',
      origin: 'backend',
      category: 'longRun',
      read: false,
    });
    expect(result.current.state.toasts.map(t => t.message)).toEqual(['Running 4h']);
  });

  it('keeps the legacy shorthands working (persist keeps a toast)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(useBoth, { wrapper });
    act(() => {
      result.current.api.showInfo('Stays', { persist: true });
    });
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(result.current.state.toasts.map(t => t.message)).toEqual(['Stays']);
    act(() => result.current.api.hideAllNotifications());
    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });
    expect(result.current.state.toasts).toEqual([]);
  });
});

describe('useNotification', () => {
  it('needs the provider', () => {
    expect(() => render(<Probe />)).toThrow(/NotificationProvider/);
  });
});

function Probe() {
  useNotification();
  return null;
}
