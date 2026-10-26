/**
 * Automatic backups start on where the platform has folder backups (the
 * desktop app), unless backup settings were ever saved (a saved "off" stays
 * off).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { firstRunBackupConfig, BACKUP_CONFIG_KEY, useBackupSettings } from '../useBackupSettings';
import { fakeBackend, installFakeBackendForTest } from '../../testing';

const mockShowError = vi.fn();
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: vi.fn(), showError: mockShowError }),
}));

const folders = () => fakeBackend().platform.folderBackups;

describe('firstRunBackupConfig', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it('does nothing without a default folder', async () => {
    folders().defaultFolder.mockResolvedValue(null);
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });

  it('does nothing where the platform has no folder backups', async () => {
    installFakeBackendForTest({ without: ['folderBackups'] });
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });
});

describe('useBackupSettings without folder backups', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('says why a folder cannot be picked, validated or backed up to', async () => {
    installFakeBackendForTest({ without: ['folderBackups'] });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useBackupSettings());
    const reason = 'Automatic backups to a folder are only available in the desktop app';

    await act(async () => {
      await expect(result.current.selectBackupDirectory()).resolves.toBeNull();
    });
    expect(mockShowError).toHaveBeenCalledWith(`Directory selection failed: ${reason}`);
    await expect(result.current.validateBackupPath('/backups')).resolves.toEqual({ isValid: false, error: reason });
    error.mockRestore();
  });
});
