/**
 * Automatic backups start on where the platform has folder backups (the
 * desktop app), unless backup settings were ever saved (a saved "off" stays
 * off). A backup reports how it went: a manual one always, an automatic one
 * when it fails (once a day for the same failure) or when asked to.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  firstRunBackupConfig,
  BACKUP_CONFIG_KEY,
  BACKUP_FAILURE_NOTICE_KEY,
  useBackupSettings,
} from '../useBackupSettings';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { NOTIFICATION_PREFERENCES_KEY } from '../../notifications/preferences';
import type { BackupConfig } from '../../types/backup';

const mockNotify = vi.fn();
const mockShowError = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify, showError: mockShowError }),
}));

const folders = () => fakeBackend().platform.folderBackups;
const stored = (key: string, data: unknown) =>
  window.localStorage.setItem(key, JSON.stringify({ version: 1, data }));
const storedConfig = (): BackupConfig => JSON.parse(window.localStorage.getItem(BACKUP_CONFIG_KEY)!).data;

const DAY_MS = 24 * 60 * 60 * 1000;
const config = (overrides: Partial<BackupConfig> = {}): BackupConfig => ({
  enabled: true,
  frequency: 'daily',
  backupPath: '/backups',
  maxBackups: 5,
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  folders().defaultFolder.mockResolvedValue(null);
  folders().validateFolder.mockResolvedValue({ isValid: true });
  folders().write.mockResolvedValue({ success: true, filePath: '/backups/one.json', timestamp: 'now' });
  // What a backup gathers
  fakeBackend().call.mockImplementation(async (command: string) =>
    command === 'get_work_logs' ? { entries: [], mappings: [], loadWarning: null } : []
  );
});

/** The hook on `saved` settings; none saved yet when it's left out. */
const mounted = (saved?: BackupConfig) => {
  if (saved) stored(BACKUP_CONFIG_KEY, saved);
  return renderHook(() => useBackupSettings()).result;
};

/** The notification of the `n`th notify call (0-based). */
const notice = (n = 0) => mockNotify.mock.calls[n][0];

describe('firstRunBackupConfig', () => {
  beforeEach(() => {
    folders().defaultFolder.mockResolvedValue('/Users/me/Documents/TaskMint Backups');
  });

  it("turns weekly backups on in the platform's default folder", async () => {
    await expect(firstRunBackupConfig()).resolves.toEqual({
      enabled: true,
      frequency: 'weekly',
      backupPath: '/Users/me/Documents/TaskMint Backups',
      maxBackups: 10,
    });
  });

  it('leaves saved settings alone, including backups turned off', async () => {
    window.localStorage.setItem(BACKUP_CONFIG_KEY, JSON.stringify({ enabled: false }));
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });

  it("does nothing when it can't tell whether settings were saved", async () => {
    vi.mocked(window.localStorage.getItem).mockImplementationOnce(() => {
      throw new Error('storage blocked');
    });
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });

  it('does nothing without a default folder', async () => {
    folders().defaultFolder.mockResolvedValue(null);
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });

  it('does nothing where the platform has no folder backups', async () => {
    installFakeBackendForTest({ without: ['folderBackups'] });
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });
});

describe('useBackupSettings', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('settings', () => {
    it('saves the first-run settings on mount', async () => {
      folders().defaultFolder.mockResolvedValue('/Documents/TaskMint Backups');
      const result = mounted();

      await waitFor(() => expect(result.current.config.backupPath).toBe('/Documents/TaskMint Backups'));
      expect(storedConfig()).toMatchObject({ enabled: true, frequency: 'weekly' });
    });

    it('saves nothing once unmounted before the default folder is known', async () => {
      let answer!: (folder: string) => void;
      folders().defaultFolder.mockImplementation(() => new Promise(resolve => (answer = resolve)));
      const { unmount } = renderHook(() => useBackupSettings());

      unmount();
      await act(async () => answer('/Documents/TaskMint Backups'));
      expect(window.localStorage.getItem(BACKUP_CONFIG_KEY)).toBeNull();
    });

    it('logs a first-run setup that failed', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      folders().defaultFolder.mockRejectedValue(new Error('no Documents'));
      mounted();

      await waitFor(() =>
        expect(error).toHaveBeenCalledWith('Failed to set up automatic backups:', expect.any(Error))
      );
      error.mockRestore();
    });

    it('changes each setting', () => {
      const result = mounted(config({ enabled: false }));

      act(() => result.current.toggleEnabled());
      act(() => result.current.updateFrequency('monthly'));
      act(() => result.current.updateBackupPath('/elsewhere'));
      act(() => result.current.updateMaxBackups(3));

      expect(result.current.config).toEqual(config({ frequency: 'monthly', backupPath: '/elsewhere', maxBackups: 3 }));
      expect(storedConfig()).toEqual(result.current.config);
    });

    it('asks for a folder', async () => {
      folders().pickFolder.mockResolvedValue('/picked');
      const result = mounted();

      await expect(result.current.selectBackupDirectory()).resolves.toBe('/picked');
      expect(mockShowError).not.toHaveBeenCalled();
    });
  });

  describe('a manual backup', () => {
    it('writes the data to the folder, records it, and says where it went', async () => {
      stored(BACKUP_FAILURE_NOTICE_KEY, { message: 'disk full', at: Date.now() });
      const result = mounted(config({ backupPath: '  /backups  ' }));

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.performManualBackup();
      });

      expect(outcome).toMatchObject({ success: true, filePath: '/backups/one.json' });
      const [backup] = folders().write.mock.calls[0];
      expect(backup).toMatchObject({ folder: '/backups', maxBackups: 5 });
      expect(JSON.parse(backup.contents)).toMatchObject({ data: { sessions: [] } });
      expect(folders().validateFolder).toHaveBeenCalledWith('/backups');
      expect(result.current.config.lastBackupTime).toBeDefined();
      expect(result.current.status).toEqual({ isRunning: false, lastBackupSuccess: true });
      expect(notice()).toMatchObject({
        severity: 'success',
        message: 'Backed up to /backups/one.json',
        actions: [expect.objectContaining({ label: expect.any(String) })],
        desktop: 'never',
      });
      // A success clears the failure announced before
      expect(JSON.parse(window.localStorage.getItem(BACKUP_FAILURE_NOTICE_KEY)!).data).toBeNull();
    });

    it("says it's saved when the platform doesn't say where", async () => {
      folders().write.mockResolvedValue({ success: true, timestamp: 'now' });
      const result = mounted(config());

      await act(async () => {
        await result.current.performManualBackup();
      });

      expect(notice()).toMatchObject({ message: 'Backup saved', actions: [] });
    });

    it.each([
      ['no folder is selected', () => mounted(config({ backupPath: '   ' })), 'No backup folder selected'],
      [
        'the folder is unusable',
        () => {
          folders().validateFolder.mockResolvedValue({ isValid: false, error: 'Folder is read-only' });
          return mounted(config());
        },
        'Folder is read-only',
      ],
      [
        "the folder is unusable and the platform doesn't say why",
        () => {
          folders().validateFolder.mockResolvedValue({ isValid: false });
          return mounted(config());
        },
        'The backup folder is not usable',
      ],
      [
        'the write fails',
        () => {
          folders().write.mockResolvedValue({ success: false, error: 'Disk full', timestamp: 'now' });
          return mounted(config());
        },
        'Disk full',
      ],
      [
        "the write fails and the platform doesn't say why",
        () => {
          folders().write.mockResolvedValue({ success: false, timestamp: 'now' });
          return mounted(config());
        },
        'Backup failed for an unknown reason',
      ],
      [
        'the write throws something without a message',
        () => {
          folders().write.mockRejectedValue({});
          return mounted(config());
        },
        'Unknown error occurred during backup',
      ],
    ])('reports a failure when %s', async (_, setUp, reason) => {
      const result = setUp();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.performManualBackup();
      });

      expect(outcome).toMatchObject({ success: false, error: reason });
      expect(notice()).toMatchObject({ severity: 'error', title: 'Backup failed', message: reason, desktop: 'never' });
      expect(result.current.config.lastBackupTime).toBeUndefined();
    });

    it('offers a Retry that runs the backup again', async () => {
      folders().write.mockResolvedValueOnce({ success: false, error: 'Disk full', timestamp: 'now' });
      const result = mounted(config());
      await act(async () => {
        await result.current.performManualBackup();
      });

      await act(async () => notice().actions[0].onClick());

      await waitFor(() => expect(notice(1)).toMatchObject({ severity: 'success' }));
      expect(folders().write).toHaveBeenCalledTimes(2);
    });
  });

  describe('an automatic backup', () => {
    const preferBackupNotices = () => stored(NOTIFICATION_PREFERENCES_KEY, { backupSuccess: true });

    it('runs only when due', async () => {
      const result = mounted(config({ lastBackupTime: new Date().toISOString() }));

      await act(async () => {
        await expect(result.current.performAutomaticBackupIfDue()).resolves.toBeNull();
      });
      expect(folders().write).not.toHaveBeenCalled();
    });

    it('is quiet when it works, unless asked to say so', async () => {
      const result = mounted(config());
      await act(async () => {
        await expect(result.current.performAutomaticBackupIfDue()).resolves.toMatchObject({ success: true });
      });
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('says where it went when asked to', async () => {
      preferBackupNotices();
      const result = mounted(config());
      await act(async () => {
        await result.current.performAutomaticBackupIfDue();
      });
      expect(notice()).toMatchObject({ title: 'Automatic backup saved', message: '/backups/one.json' });
    });

    it("says it's saved when asked to and the platform doesn't say where", async () => {
      preferBackupNotices();
      folders().write.mockResolvedValue({ success: true, timestamp: 'now' });
      const result = mounted(config());
      await act(async () => {
        await result.current.performAutomaticBackupIfDue();
      });
      expect(notice()).toMatchObject({ message: 'Your data was backed up.', actions: [] });
    });

    it('announces a failure once a day, and a different one right away', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      folders().write.mockResolvedValue({ success: false, error: 'Disk full', timestamp: 'now' });
      const result = mounted(config());
      const run = () =>
        act(async () => {
          await result.current.performAutomaticBackupIfDue();
        });

      await run();
      expect(notice()).toMatchObject({
        title: 'Automatic backup failed',
        message: 'Disk full. It will be retried every hour.',
        actions: [
          expect.objectContaining({ label: 'Retry' }),
          { label: 'Backup settings', view: 'settings', section: 'backups' },
        ],
      });

      await run();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('Automatic backup failed again:', 'Disk full');

      folders().write.mockResolvedValue({ success: false, error: 'Folder gone', timestamp: 'now' });
      await run();
      expect(notice(1)).toMatchObject({ message: 'Folder gone. It will be retried every hour.' });

      // A day on, the same failure is announced again
      stored(BACKUP_FAILURE_NOTICE_KEY, { message: 'Folder gone', at: Date.now() - DAY_MS });
      await run();
      expect(mockNotify).toHaveBeenCalledTimes(3);
      warn.mockRestore();
    });

    it("offers a Retry, run as a manual backup", async () => {
      folders().write.mockResolvedValueOnce({ success: false, error: 'Disk full', timestamp: 'now' });
      const result = mounted(config());
      await act(async () => {
        await result.current.performAutomaticBackupIfDue();
      });

      await act(async () => notice().actions[0].onClick());

      await waitFor(() => expect(notice(1)).toMatchObject({ severity: 'success', desktop: 'never' }));
    });
  });

  describe('the status line', () => {
    it('says when backups are off', () => {
      expect(mounted(config({ enabled: false })).current.getStatusSummary()).toBe('Automatic backups are disabled');
    });

    it('says when no folder is selected', () => {
      expect(mounted(config({ backupPath: '' })).current.getStatusSummary()).toBe('No backup directory selected');
    });

    it('says when none ran yet', () => {
      expect(mounted(config()).current.getStatusSummary()).toBe('No backups performed yet');
    });

    it('says when one is due', () => {
      const lastBackupTime = new Date(Date.now() - 2 * DAY_MS).toISOString();
      expect(mounted(config({ lastBackupTime })).current.getStatusSummary()).toBe('Backup is due');
    });

    it('says when the last one ran', () => {
      const lastBackupTime = new Date().toISOString();
      expect(mounted(config({ lastBackupTime })).current.getStatusSummary()).toMatch(/^Last backup: /);
    });

    it('says one is running while it runs', async () => {
      let finish!: (result: { success: boolean; timestamp: string }) => void;
      folders().write.mockImplementation(() => new Promise(resolve => (finish = resolve)));
      const result = mounted(config());

      let backup!: Promise<unknown>;
      act(() => {
        backup = result.current.performManualBackup();
      });
      await waitFor(() => expect(folders().write).toHaveBeenCalled());
      expect(result.current.status.isRunning).toBe(true);
      expect(result.current.getStatusSummary()).toBe('Backup in progress...');

      await act(async () => {
        finish({ success: true, timestamp: 'now' });
        await backup;
      });
      expect(result.current.getStatusSummary()).toMatch(/^Last backup: /);
    });

    it('says why the last one failed, even the first', async () => {
      folders().write.mockResolvedValue({ success: false, error: 'Disk full', timestamp: 'now' });
      const result = mounted(config());

      await act(async () => {
        await result.current.performManualBackup();
      });

      expect(result.current.status).toEqual({ isRunning: false, lastBackupSuccess: false, lastBackupError: 'Disk full' });
      expect(result.current.getStatusSummary()).toBe('Last backup failed: Disk full');
    });
  });

  describe('without folder backups', () => {
    it('says why a folder cannot be picked or backed up to', async () => {
      installFakeBackendForTest({ without: ['folderBackups'] });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = mounted(config());
      const reason = 'Automatic backups to a folder are only available in the desktop app';

      await act(async () => {
        await expect(result.current.selectBackupDirectory()).resolves.toBeNull();
      });
      expect(mockShowError).toHaveBeenCalledWith(`Directory selection failed: ${reason}`);

      await act(async () => {
        await expect(result.current.performManualBackup()).resolves.toMatchObject({ success: false, error: reason });
      });
      error.mockRestore();
    });
  });
});
