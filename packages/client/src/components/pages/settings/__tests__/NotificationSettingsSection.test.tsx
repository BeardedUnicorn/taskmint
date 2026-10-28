/**
 * The Notifications settings: what reaches the system's notification
 * centre, saved as each switch changes, and a test notification.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationSettingsSection } from '../NotificationSettingsSection';
import { NOTIFICATION_PREFERENCES_KEY } from '../../../../notifications/preferences';

const mockNotify = vi.fn();
vi.mock('../../../../contexts/NotificationContext', () => ({ useNotification: () => ({ notify: mockNotify }) }));

const saved = () => JSON.parse(localStorage.getItem(NOTIFICATION_PREFERENCES_KEY)!).data;
const toggle = (name: string) => screen.getByRole('switch', { name });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('NotificationSettingsSection', () => {
  it('saves each switch as it changes', () => {
    render(<NotificationSettingsSection />);

    fireEvent.click(toggle('Play a sound'));
    fireEvent.click(toggle('Long-run reminder'));
    fireEvent.click(toggle('Automatic backup saved'));
    fireEvent.click(toggle('End-of-day summary'));

    expect(saved()).toMatchObject({ sound: true, longRunReminder: false, backupSuccess: true, dailySummary: false });
    // With the summary off, its time is too
    expect(screen.getByLabelText('Send at')).toBeDisabled();
  });

  it('turns every system notification off at once', () => {
    render(<NotificationSettingsSection />);

    fireEvent.click(toggle('System notifications'));

    expect(saved().desktopEnabled).toBe(false);
    for (const name of ['Play a sound', 'Long-run reminder', 'Errors while TaskMint is in the background']) {
      expect(toggle(name)).toBeDisabled();
    }
  });

  it('keeps the summary time only when it is a whole time', () => {
    render(<NotificationSettingsSection />);
    const time = screen.getByLabelText('Send at');

    fireEvent.change(time, { target: { value: '19:30' } });
    expect(saved().dailySummaryTime).toBe('19:30');

    fireEvent.change(time, { target: { value: '' } });
    expect(saved().dailySummaryTime).toBe('19:30');
  });

  it('sends a test notification, kept out of the history', () => {
    render(<NotificationSettingsSection />);

    fireEvent.click(screen.getByRole('button', { name: /test notification/i }));
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'test', history: false }));
  });
});
