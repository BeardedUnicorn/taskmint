import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { BackupSettingsProvider, BACKUP_CHECK_INTERVAL_MS } from '../BackupSettingsContext';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../utils/tauri', () => ({
  isTauriEnvironment: vi.fn(() => true),
  safeInvoke: vi.fn(),
}));

const CONFIG_KEY = 'automaticBackupConfig';

function storeConfig(config: Record<string, unknown>) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ version: 1, data: config }));
}

function storedConfig() {
  return JSON.parse(localStorage.getItem(CONFIG_KEY)!).data;
}

function mockBackend(backupResult: { success: boolean; error?: string }) {
  vi.mocked(invoke).mockImplementation(async (command: string) => {
    switch (command) {
      case 'validate_backup_path':
        return { isValid: true };
      case 'get_sessions':
        return [];
      case 'get_work_logs':
        return { entries: [], mappings: [], loadWarning: null };
      case 'perform_automatic_backup':
        return { ...backupResult, timestamp: new Date().toISOString() };
      default:
        return undefined;
    }
  });
}

const backupCalls = () =>
  vi.mocked(invoke).mock.calls.filter(([command]) => command === 'perform_automatic_backup');

describe('BackupSettingsProvider scheduling', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a due backup on launch and records it', async () => {
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: true });

    render(<BackupSettingsProvider><div /></BackupSettingsProvider>);

    await waitFor(() => expect(backupCalls()).toHaveLength(1));
    expect(backupCalls()[0][1]).toMatchObject({ backupPath: '/backups', maxBackups: 5 });
    await waitFor(() => expect(storedConfig().lastBackupTime).toBeDefined());
  });

  it('does nothing while automatic backups are off', async () => {
    storeConfig({ enabled: false, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: true });

    render(<BackupSettingsProvider><div /></BackupSettingsProvider>);

    await act(async () => {});
    expect(invoke).not.toHaveBeenCalled();
  });

  it('skips a backup that is not yet due', async () => {
    storeConfig({
      enabled: true,
      frequency: 'daily',
      backupPath: '/backups',
      maxBackups: 5,
      lastBackupTime: new Date().toISOString(),
    });
    mockBackend({ success: true });

    render(<BackupSettingsProvider><div /></BackupSettingsProvider>);

    await act(async () => {});
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps a failed backup due and retries it on the next hourly check', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: false, error: 'disk full' });

    render(<BackupSettingsProvider><div /></BackupSettingsProvider>);

    await waitFor(() => expect(backupCalls()).toHaveLength(1));
    expect(storedConfig().lastBackupTime).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKUP_CHECK_INTERVAL_MS);
    });
    await waitFor(() => expect(backupCalls()).toHaveLength(2));
  });
});
