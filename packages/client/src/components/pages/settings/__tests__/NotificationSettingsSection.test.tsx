/**
 * The Notifications settings: what reaches the system's notification
 * centre, saved as each switch changes, and a test notification.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationSettingsSection } from '../NotificationSettingsSection';
import { NOTIFICATION_PREFERENCES_KEY } from '../../../../notifications/preferences';
import { installFakeBackendForTest } from '../../../../testing';

const mockNotify = vi.fn();
vi.mock('../../../../contexts/NotificationContext', () => ({ useNotification: () => ({ notify: mockNotify }) }));

const saved = () => JSON.parse(localStorage.getItem(NOTIFICATION_PREFERENCES_KEY)!).data;
const toggle = (name: string) => screen.getByRole('switch', { name });

beforeEach(() => {
  localStorage.clear();
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

  it("lists every kind on a desktop, in the desktop's words", () => {
    render(<NotificationSettingsSection />);
    for (const name of [
      'Long-run reminder',
      'Timer paused while you were away',
      'Work logs from the browser',
      'Automatic backup failed',
      'Automatic backup saved',
    ]) {
      expect(toggle(name)).toBeInTheDocument();
    }
    expect(screen.getByText(/hidden in the tray/)).toBeInTheDocument();
    expect(screen.getByText('Nothing appeared? Check System Settings → Notifications → TaskMint.')).toBeInTheDocument();
  });

  it("leaves out what a phone can't send, and says where Android keeps notifications", () => {
    installFakeBackendForTest({
      capabilities: { runtime: 'mobile' },
      without: ['idle', 'folderBackups', 'tray', 'reveal', 'captureStatus', 'openFolder'],
    });
    render(<NotificationSettingsSection />);

    for (const name of [
      'Long-run reminder',
      'Timer paused while you were away',
      'Work logs from the browser',
      'Automatic backup failed',
      'Automatic backup saved',
    ]) {
      expect(screen.queryByRole('switch', { name })).not.toBeInTheDocument();
    }
    for (const name of ['Daily goal milestones', 'End-of-day summary', 'Errors while TaskMint is in the background']) {
      expect(toggle(name)).toBeInTheDocument();
    }
    expect(screen.queryByText(/tray|window/)).not.toBeInTheDocument();
    expect(screen.getByText(/messages appear at the bottom of the screen/)).toBeInTheDocument();
    expect(
      screen.getByText("Nothing appeared? Check your phone's Settings → Apps → TaskMint → Notifications.")
    ).toBeInTheDocument();
  });

  it('speaks of the page and the browser on the web', () => {
    installFakeBackendForTest({
      capabilities: { runtime: 'web', dataLocation: 'cloud' },
      without: ['idle', 'folderBackups', 'tray', 'reveal', 'captureStatus', 'openFolder'],
    });
    render(<NotificationSettingsSection />);
    expect(screen.getByText(/in the corner of the page/)).toBeInTheDocument();
    expect(screen.getByText('Turn off to keep every message inside the page.')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing appeared? Check that your browser lets this site show notifications.')
    ).toBeInTheDocument();
  });
});
