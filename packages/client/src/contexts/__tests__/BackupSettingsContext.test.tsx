import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import { BackupSettingsProvider, BACKUP_CHECK_INTERVAL_MS, useBackupSettingsContext } from '../BackupSettingsContext';
import { fakeBackend, installFakeBackendForTest } from '../../testing';

const mockNotify = vi.fn();
vi.mock('../NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify, showError: vi.fn() }),
}));

const CONFIG_KEY = 'automaticBackupConfig';

function storeConfig(config: Record<string, unknown>) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ version: 1, data: config }));
}

function storedConfig() {
  return JSON.parse(localStorage.getItem(CONFIG_KEY)!).data;
}

function mockBackend(backupResult: { success: boolean; error?: string }) {
  fakeBackend().call.mockImplementation(async (command: string) => {
    switch (command) {
      case 'get_sessions':
        return [];
      case 'get_work_logs':
        return { entries: [], mappings: [], loadWarning: null };
      default:
        return undefined;
    }
  });
  const folders = fakeBackend().platform.folderBackups;
  folders.validateFolder.mockResolvedValue({ isValid: true });
  folders.write.mockImplementation(async () => ({ ...backupResult, timestamp: new Date().toISOString() }));
}

const backupCalls = () => fakeBackend().platform.folderBackups.write.mock.calls;

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

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await waitFor(() => expect(backupCalls()).toHaveLength(1));
    expect(backupCalls()[0][0]).toMatchObject({ folder: '/backups', maxBackups: 5 });
    await waitFor(() => expect(storedConfig().lastBackupTime).toBeDefined());
  });

  it('does nothing while automatic backups are off', async () => {
    storeConfig({ enabled: false, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: true });

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await act(async () => {});
    expect(fakeBackend().call).not.toHaveBeenCalled();
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

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await act(async () => {});
    expect(fakeBackend().call).not.toHaveBeenCalled();
  });

  it('schedules nothing where the platform has no folder backups', async () => {
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    const desktop = fakeBackend();
    installFakeBackendForTest({ without: ['folderBackups'] });

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await act(async () => {});
    expect(fakeBackend().call).not.toHaveBeenCalled();
    expect(desktop.platform.folderBackups.write).not.toHaveBeenCalled();
  });

  it('keeps a failed backup due and retries it on the next hourly check', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: false, error: 'disk full' });

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await waitFor(() => expect(backupCalls()).toHaveLength(1));
    expect(storedConfig().lastBackupTime).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKUP_CHECK_INTERVAL_MS);
    });
    await waitFor(() => expect(backupCalls()).toHaveLength(2));
  });

  it('announces a failure once (with Retry and a way to the settings), not every hour', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: false, error: 'disk full' });

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await waitFor(() => expect(mockNotify).toHaveBeenCalledTimes(1));
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        category: 'backup',
        title: 'Automatic backup failed',
        actions: [
          expect.objectContaining({ label: 'Retry' }),
          { label: 'Backup settings', view: 'settings', section: 'backups' },
        ],
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKUP_CHECK_INTERVAL_MS);
    });
    await waitFor(() => expect(backupCalls()).toHaveLength(2));
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when an automatic backup works', async () => {
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: true });

    render(
      <BackupSettingsProvider>
        <div />
      </BackupSettingsProvider>
    );

    await waitFor(() => expect(storedConfig().lastBackupTime).toBeDefined());
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('starts no second backup while one is still running', async () => {
    storeConfig({ enabled: true, frequency: 'daily', backupPath: '/backups', maxBackups: 5 });
    mockBackend({ success: true });
    let finish!: () => void;
    fakeBackend().platform.folderBackups.write.mockImplementationOnce(
      () => new Promise(resolve => (finish = () => resolve({ success: true, timestamp: new Date().toISOString() })))
    );
    const { result } = renderHook(() => useBackupSettingsContext(), { wrapper: BackupSettingsProvider });
    await waitFor(() => expect(backupCalls()).toHaveLength(1));

    // Pointed elsewhere mid-backup: the check it triggers waits its turn
    act(() => result.current.updateBackupPath('/elsewhere'));
    await act(async () => {});
    expect(backupCalls()).toHaveLength(1);

    await act(async () => finish());
    await waitFor(() => expect(storedConfig().lastBackupTime).toBeDefined());
  });
});

describe('useBackupSettingsContext', () => {
  it('needs the provider', () => {
    expect(() => renderHook(() => useBackupSettingsContext())).toThrow(/BackupSettingsProvider/);
  });
});
