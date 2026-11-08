/**
 * The Automatic Backups settings on the real backup settings provider, with
 * the platform's folder backups faked.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupSettingsSection } from '../BackupSettingsSection';
import { BackupSettingsProvider } from '../../../../contexts/BackupSettingsContext';
import { fakeBackend } from '../../../../testing';
import { createNotificationMock } from '../../../../__tests__/setup/notificationMock';

const notifications = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof createNotificationMock> }));
vi.mock('../../../../contexts/NotificationContext', () => ({ useNotification: () => notifications.current }));

const CONFIG_KEY = 'automaticBackupConfig';
const store = (config: Record<string, unknown>) =>
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ version: 1, data: config }));
const saved = () => JSON.parse(localStorage.getItem(CONFIG_KEY)!).data;
const folders = () => fakeBackend().platform.folderBackups;

const section = () =>
  render(
    <BackupSettingsProvider>
      <BackupSettingsSection />
    </BackupSettingsProvider>
  );

const maxBackups = () => screen.getByLabelText('Maximum Backups to Keep');
const status = () => screen.getByText('Status').parentElement!.querySelector('.MuiChip-root')!;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  notifications.current = createNotificationMock();
  fakeBackend().call.mockImplementation(async (command: string) =>
    command === 'get_work_logs' ? { entries: [], mappings: [], loadWarning: null } : []
  );
  folders().validateFolder.mockResolvedValue({ isValid: true });
  folders().write.mockResolvedValue({ success: true, filePath: '/backups/one.json', timestamp: 'now' });
  folders().pickFolder.mockResolvedValue(null);
  folders().defaultFolder.mockResolvedValue(null);
});

describe('BackupSettingsSection', () => {
  it('shows the settings once backups are on', async () => {
    store({ enabled: false, frequency: 'daily', backupPath: '', maxBackups: 10 });
    section();
    expect(screen.queryByLabelText('Maximum Backups to Keep')).not.toBeInTheDocument();
    expect(status()).toHaveTextContent('Automatic backups are disabled');

    fireEvent.click(screen.getByRole('switch', { name: 'Enable automatic backups' }));
    expect(await screen.findByLabelText('Maximum Backups to Keep')).toBeInTheDocument();
    expect(saved().enabled).toBe(true);
  });

  it('picks a folder, keeping the current one when the dialog is dismissed', async () => {
    store({
      enabled: true,
      frequency: 'daily',
      backupPath: '/old',
      maxBackups: 10,
      lastBackupTime: new Date().toISOString(),
    });
    section();

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await waitFor(() => expect(folders().pickFolder).toHaveBeenCalledTimes(1));
    expect(saved().backupPath).toBe('/old');

    folders().pickFolder.mockResolvedValueOnce('/new');
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await waitFor(() => expect(saved().backupPath).toBe('/new'));
  });

  it('sets how often to back up', async () => {
    store({
      enabled: true,
      frequency: 'daily',
      backupPath: '/b',
      maxBackups: 10,
      lastBackupTime: new Date().toISOString(),
    });
    section();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Backup Frequency' }));
    fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Weekly' }));
    expect(saved().frequency).toBe('weekly');
  });

  it('keeps 1 to 100 backups, saved when the field is left or Enter is pressed', () => {
    store({
      enabled: true,
      frequency: 'daily',
      backupPath: '/b',
      maxBackups: 10,
      lastBackupTime: new Date().toISOString(),
    });
    section();

    fireEvent.change(maxBackups(), { target: { value: '5' } });
    fireEvent.keyDown(maxBackups(), { key: 'Enter' });
    expect(saved().maxBackups).toBe(5);

    fireEvent.change(maxBackups(), { target: { value: '500' } });
    fireEvent.blur(maxBackups());
    expect(saved().maxBackups).toBe(100);
    expect(maxBackups()).toHaveValue(100);

    // Nothing usable typed: back to what's saved, unchanged
    fireEvent.change(maxBackups(), { target: { value: '' } });
    fireEvent.blur(maxBackups());
    expect(maxBackups()).toHaveValue(100);
    fireEvent.keyDown(maxBackups(), { key: 'a' });
    expect(saved().maxBackups).toBe(100);
  });

  it('backs up now, showing it running, then how it went', async () => {
    store({
      enabled: true,
      frequency: 'daily',
      backupPath: '/b',
      maxBackups: 10,
      lastBackupTime: new Date().toISOString(),
    });
    let finish!: () => void;
    folders().write.mockImplementationOnce(
      () => new Promise(resolve => (finish = () => resolve({ success: false, error: 'Disk full', timestamp: 'now' })))
    );
    section();

    fireEvent.click(screen.getByRole('button', { name: 'Backup Now' }));
    expect(await screen.findByRole('button', { name: 'Creating Backup...' })).toBeDisabled();
    expect(status()).toHaveTextContent('Backup in progress...');

    finish();
    await waitFor(() => expect(status()).toHaveTextContent('Last backup failed: Disk full'));

    fireEvent.click(screen.getByRole('button', { name: 'Backup Now' }));
    await waitFor(() => expect(status()).toHaveTextContent(/^Last backup: /));
  });

  it("can't back up now without a folder", () => {
    store({ enabled: true, frequency: 'daily', backupPath: '', maxBackups: 10 });
    section();
    expect(screen.getByRole('button', { name: 'Backup Now' })).toBeDisabled();
  });
});
