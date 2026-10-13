/**
 * Automatic backups start on in the desktop app, unless backup settings were
 * ever saved (a saved "off" stays off).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstRunBackupConfig, BACKUP_CONFIG_KEY } from '../useBackupSettings';

let inTauri = true;
vi.mock('../../utils/tauri', () => ({
  isTauriEnvironment: () => inTauri,
}));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/me/Documents',
  join: async (...parts: string[]) => parts.join('/'),
}));

describe('firstRunBackupConfig', () => {
  beforeEach(() => {
    inTauri = true;
    window.localStorage.clear();
  });

  it('turns weekly backups on in Documents/TaskMint Backups', async () => {
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

  it('does nothing outside the desktop app', async () => {
    inTauri = false;
    await expect(firstRunBackupConfig()).resolves.toBeNull();
  });
});
