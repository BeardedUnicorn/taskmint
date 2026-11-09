/**
 * The backups in the backup folder, restored exactly or merged in, on the
 * real restore with the platform and the backend faked.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupFilesList } from '../BackupFilesList';
import { fakeBackend } from '../../../../testing';
import { createNotificationMock } from '../../../../__tests__/setup/notificationMock';
import { reloadApp } from '../../../../utils/appReload';
import type { BackupFileInfo } from '../../../../types/backup';

const notifications = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof createNotificationMock> }));
vi.mock('../../../../contexts/NotificationContext', () => ({ useNotification: () => notifications.current }));
vi.mock('../../../../utils/appReload', () => ({ reloadApp: vi.fn() }));

const folders = () => fakeBackend().platform.folderBackups;
const TAKEN_AT = '2026-11-01T12:00:00+00:00';
const backup = (name: string, overrides: Partial<BackupFileInfo> = {}): BackupFileInfo => ({
  name,
  takenAt: TAKEN_AT,
  size: 2048,
  valid: true,
  problem: null,
  exportedAt: '2026-11-01T12:00:00.000Z',
  ...overrides,
});
const EXPORT = JSON.stringify({
  version: '3',
  exportDate: '2026-11-01T12:00:00.000Z',
  data: { tasks: [], sessions: [], workLogs: { entries: [], mappings: [] } },
});
const SUMMARY = {
  sessionsRestored: 0,
  sessionsAlreadyPresent: 0,
  workLogEntriesRestored: 0,
  workLogMappingsRestored: 0,
  recordsSkipped: 0,
  appRecordsRestored: 1,
};

const list = () => screen.getByRole('list', { name: 'Backups in this folder' });
const restoreCalls = () => fakeBackend().call.mock.calls.filter(([command]) => command === 'restore_backup_data');

beforeEach(() => {
  vi.clearAllMocks();
  notifications.current = createNotificationMock();
  fakeBackend().call.mockImplementation(async (command: string) =>
    command === 'restore_backup_data' ? SUMMARY : undefined
  );
  folders().list.mockResolvedValue([
    backup('time_tracker_backup_20261101_120000.json'),
    backup('time_tracker_backup_20261031_120000.json', {
      takenAt: '2026-10-31T12:00:00+00:00',
      valid: false,
      problem: "It isn't valid JSON",
      size: 8,
    }),
  ]);
  folders().read.mockResolvedValue(EXPORT);
});

describe('BackupFilesList', () => {
  it("lists the folder's backups, and why one can't be restored", async () => {
    render(<BackupFilesList folder="/Backups" />);

    const items = within(await screen.findByRole('list', { name: 'Backups in this folder' })).getAllByRole('listitem');
    expect(folders().list).toHaveBeenCalledWith('/Backups');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('2 KB');
    expect(items[1]).toHaveTextContent("8 B · It isn't valid JSON");
    const [restoreFirst, mergeFirst, restoreSecond, mergeSecond] = within(list()).getAllByRole('button');
    expect(restoreFirst).toBeEnabled();
    expect(mergeFirst).toBeEnabled();
    expect(restoreSecond).toBeDisabled();
    expect(mergeSecond).toBeDisabled();
  });

  it('says when there are none, or the folder could not be read', async () => {
    folders().list.mockResolvedValueOnce([]);
    const { rerender } = render(<BackupFilesList folder="/Empty" />);
    expect(await screen.findByText('No backups here yet.')).toBeInTheDocument();

    folders().list.mockRejectedValueOnce('Permission denied');
    rerender(<BackupFilesList folder="/Locked" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.queryByText('No backups here yet.')).not.toBeInTheDocument();
  });

  it('reads the folder again after a backup, and ignores a list for a folder since changed', async () => {
    let finishOld!: (files: BackupFileInfo[]) => void;
    folders().list.mockImplementationOnce(() => new Promise(resolve => (finishOld = resolve)));
    const { rerender } = render(<BackupFilesList folder="/Old" />);

    rerender(<BackupFilesList folder="/New" />);
    expect(await screen.findByRole('list', { name: 'Backups in this folder' })).toBeInTheDocument();
    await act(async () => finishOld([]));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);

    rerender(<BackupFilesList folder="/New" lastBackupTime="2026-11-02T00:00:00.000Z" />);
    await waitFor(() => expect(folders().list).toHaveBeenCalledTimes(3));
  });

  it('merges one in without asking, then reloads', async () => {
    render(<BackupFilesList folder="/Backups" />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Merge in the backup from/ }))[0]);

    await waitFor(() => expect(reloadApp).toHaveBeenCalled());
    expect(folders().read).toHaveBeenCalledWith('/Backups', 'time_tracker_backup_20261101_120000.json');
    const [[, args]] = restoreCalls();
    expect(args).toMatchObject({ payload: { mode: 'merge' } });
    expect(args?.payload).not.toHaveProperty('records');
    expect(notifications.current.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Data imported. Reloading…' })
    );
  });

  it('asks before restoring one exactly, and can be cancelled', async () => {
    render(<BackupFilesList folder="/Backups" />);
    const restore = (await screen.findAllByRole('button', { name: /^Restore the backup from .* exactly$/ }))[0];

    fireEvent.click(restore);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Restore this backup exactly?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(restoreCalls()).toHaveLength(0);

    fireEvent.click(restore);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Replace My Data' }));
    await waitFor(() => expect(reloadApp).toHaveBeenCalled());
    expect(restoreCalls()[0][1]).toMatchObject({ payload: { mode: 'replace', records: { predefinedTasks: [] } } });
    expect(notifications.current.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Backup restored. Reloading…' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("says why a backup can't be read, and restores nothing", async () => {
    folders().read.mockRejectedValueOnce("Can't read the backup: gone").mockResolvedValueOnce('{"hello":1}');
    render(<BackupFilesList folder="/Backups" />);
    const merge = (await screen.findAllByRole('button', { name: /^Merge in the backup from/ }))[0];

    fireEvent.click(merge);
    await waitFor(() => expect(notifications.current.showError).toHaveBeenCalledWith("Can't read the backup: gone"));
    fireEvent.click(merge);
    await waitFor(() =>
      expect(notifications.current.showError).toHaveBeenCalledWith(
        'Invalid backup file format: this is not a TaskMint export'
      )
    );
    expect(restoreCalls()).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
