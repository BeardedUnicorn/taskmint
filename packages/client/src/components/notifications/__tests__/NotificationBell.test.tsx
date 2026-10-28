import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import { NotificationProvider, useNotification, NotificationApi } from '../../../contexts/NotificationContext';
import { NavigationProvider, useNavigation } from '../../../contexts/NavigationContext';
import { NOTIFICATION_HISTORY_KEY } from '../../../notifications/history';

let attended = true;
vi.mock('../../../notifications/attention', () => ({
  isWindowAttended: () => attended,
  subscribeAttention: () => () => {},
}));
vi.mock('../../../notifications/desktop', () => ({ deliverDesktop: vi.fn(async () => true) }));

let api: NotificationApi;
let currentView = '';
function Capture() {
  api = useNotification();
  currentView = useNavigation().view;
  return null;
}

function renderBell() {
  return render(
    <NavigationProvider>
      <NotificationProvider>
        <Capture />
        <NotificationBell />
      </NotificationProvider>
    </NavigationProvider>
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    attended = true;
    localStorage.clear();
  });

  it('counts what arrived while you were away and lists it when opened', () => {
    renderBell();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    attended = false;
    act(() => {
      api.notify({
        category: 'workLog',
        severity: 'info',
        message: 'A new project needs a task match.',
        actions: [{ label: 'Review in Payouts', view: 'payouts' }],
      });
    });
    attended = true;

    const bell = screen.getByRole('button', { name: 'Notifications, 1 unread' });
    fireEvent.click(bell);

    const dialog = screen.getByRole('dialog', { name: 'Recent notifications' });
    expect(within(dialog).getByText('A new project needs a task match.')).toBeInTheDocument();
    expect(within(dialog).getByText(/sent while you were away|ago/)).toBeInTheDocument();
    // Opening marks it read (the bell sits behind the open popover)
    expect(screen.getByRole('button', { name: 'Notifications', hidden: true })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Review in Payouts' }));
    expect(currentView).toBe('payouts');
  });

  it('shows each entry with its title, repeats and delivery, from the sidebar when collapsed', () => {
    const at = new Date().toISOString();
    const entry = { at, category: 'general', origin: 'app', read: true, count: 1, delivery: 'toast' };
    localStorage.setItem(
      NOTIFICATION_HISTORY_KEY,
      JSON.stringify([
        { ...entry, id: 'a', severity: 'warning', title: 'Backup', message: 'Backup failed', count: 3, delivery: 'desktop', read: false },
        { ...entry, id: 'b', severity: 'success', message: 'Saved' },
      ])
    );
    render(
      <NavigationProvider>
        <NotificationProvider>
          <NotificationBell collapsed />
        </NotificationProvider>
      </NavigationProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    const dialog = screen.getByRole('dialog', { name: 'Recent notifications' });
    expect(within(dialog).getByText('Backup')).toBeInTheDocument();
    expect(within(dialog).getByText(/×3 · sent while you were away/)).toBeInTheDocument();
    expect(within(dialog).getByText('Saved')).toBeInTheDocument();
  });

  it('clears the history', () => {
    renderBell();
    act(() => {
      api.showInfo('Something happened');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });
});
