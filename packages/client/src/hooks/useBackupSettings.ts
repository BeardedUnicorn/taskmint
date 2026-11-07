/**
 * Backup Settings Hook
 *
 * Manages automatic backup configuration including frequency,
 * backup path selection, and backup status monitoring.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useDataBackup } from './useDataBackup';
import {
  BackupConfig,
  BackupStatus,
  BackupResult,
  BackupFrequency,
  DEFAULT_BACKUP_CONFIG,
  isBackupDue,
} from '../types/backup';
import { getBackend } from '../backend';
import type { FolderBackupPlatform } from '../backend';
import { errorMessage } from '../utils/errors';
import { readLocal, writeLocal } from '../utils/localStore';
import { revealAction } from '../utils/reveal';
import { useNotification } from '../contexts/NotificationContext';
import { useNotificationPreferences } from '../notifications/preferences';
import { formatDateTime } from '../utils/locale';

export const BACKUP_CONFIG_KEY = 'automaticBackupConfig';

/** Folder backups, which only some platforms have (the desktop app). */
function folderBackups(): FolderBackupPlatform {
  const folders = getBackend().platform.folderBackups;
  if (!folders) throw new Error('Automatic backups to a folder are only available in the desktop app');
  return folders;
}

/**
 * The last automatic-backup failure announced. A failed backup stays due and
 * is retried every hour, so the same failure is announced again only after a
 * day (a different one, right away).
 */
export const BACKUP_FAILURE_NOTICE_KEY = 'backupFailureNotice';
const FAILURE_REPEAT_MS = 24 * 60 * 60 * 1000;

interface FailureNotice {
  message: string;
  at: number;
}

function shouldAnnounceFailure(message: string, now = Date.now()): boolean {
  const last = readLocal<FailureNotice | null>(BACKUP_FAILURE_NOTICE_KEY, null);
  if (last && last.message === message && now - last.at < FAILURE_REPEAT_MS) return false;
  writeLocal<FailureNotice | null>(BACKUP_FAILURE_NOTICE_KEY, { message, at: now }, null);
  return true;
}

export type BackupTrigger = 'manual' | 'automatic';

/**
 * Automatic backups start on where the platform has folder backups (the
 * desktop app): weekly, the newest 10 kept, in its default folder
 * (Documents/TaskMint Backups). Only when no backup settings were ever saved
 * (a fresh install, or after Reset All Data); a saved choice, including
 * "off", is never touched. Resolves to the config to save, or null.
 */
export async function firstRunBackupConfig(): Promise<BackupConfig | null> {
  const folders = getBackend().platform.folderBackups;
  if (!folders) return null;
  try {
    if (window.localStorage.getItem(BACKUP_CONFIG_KEY) !== null) return null;
  } catch {
    return null;
  }
  const backupPath = await folders.defaultFolder();
  if (!backupPath) return null;
  return { ...DEFAULT_BACKUP_CONFIG, enabled: true, frequency: 'weekly', backupPath, maxBackups: 10 };
}

export function useBackupSettings() {
  const [config, setConfig] = useLocalStorage<BackupConfig>(BACKUP_CONFIG_KEY, DEFAULT_BACKUP_CONFIG);

  // Backups on by default (see firstRunBackupConfig), once on mount.
  useEffect(() => {
    let cancelled = false;
    firstRunBackupConfig()
      .then(initial => {
        if (initial && !cancelled) setConfig(initial);
      })
      .catch(error => console.error('Failed to set up automatic backups:', error));
    return () => {
      cancelled = true;
    };
  }, [setConfig]);

  const [status, setStatus] = useState<BackupStatus>({ isRunning: false });

  const { createBackupData } = useDataBackup({});
  const { notify, showError } = useNotification();
  const [notificationPreferences] = useNotificationPreferences();

  // Ask for the backup folder (null when cancelled)
  const selectBackupDirectory = useCallback(async (): Promise<string | null> => {
    try {
      return await folderBackups().pickFolder();
    } catch (error) {
      // The dialog's own reason
      const message = errorMessage(error, 'Failed to open directory selection dialog');
      console.error('Failed to open directory dialog:', error);
      showError(`Directory selection failed: ${message}`);
      return null;
    }
  }, [showError]);

  const toggleEnabled = useCallback(() => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  }, [setConfig]);

  const updateFrequency = useCallback(
    (frequency: BackupFrequency) => {
      setConfig(prev => ({ ...prev, frequency }));
    },
    [setConfig]
  );

  const updateBackupPath = useCallback(
    (backupPath: string) => {
      setConfig(prev => ({ ...prev, backupPath }));
    },
    [setConfig]
  );

  const updateMaxBackups = useCallback(
    (maxBackups: number) => {
      setConfig(prev => ({ ...prev, maxBackups }));
    },
    [setConfig]
  );

  /**
   * Back up now. A manual backup reports either way; an automatic one is
   * quiet when it works (unless "Automatic backup saved" notifications are
   * on) and announces a failure once a day (see shouldAnnounceFailure), with
   * Retry and a way to the settings, also as an OS notification while the
   * app is in the background.
   */
  const performBackup = useCallback(
    async (trigger: BackupTrigger): Promise<BackupResult> => {
      const succeeded = (result: BackupResult): BackupResult => {
        writeLocal<FailureNotice | null>(BACKUP_FAILURE_NOTICE_KEY, null, null);
        if (trigger === 'manual') {
          notify({
            severity: 'success',
            category: 'backup',
            message: result.filePath ? `Backed up to ${result.filePath}` : 'Backup saved',
            actions: revealAction(result.filePath),
            desktop: 'never',
          });
        } else if (notificationPreferences.backupSuccess) {
          notify({
            severity: 'success',
            category: 'backup',
            title: 'Automatic backup saved',
            message: result.filePath ?? 'Your data was backed up.',
            actions: revealAction(result.filePath),
          });
        }
        return result;
      };

      const failedWith = (reason: string): BackupResult => {
        if (trigger === 'manual') {
          notify({
            severity: 'error',
            category: 'backup',
            title: 'Backup failed',
            message: reason,
            actions: [{ label: 'Retry', onClick: () => void performBackupRef.current('manual') }],
            desktop: 'never',
          });
        } else if (shouldAnnounceFailure(reason)) {
          notify({
            severity: 'error',
            category: 'backup',
            title: 'Automatic backup failed',
            message: `${reason}. It will be retried every hour.`,
            actions: [
              { label: 'Retry', onClick: () => void performBackupRef.current('manual') },
              { label: 'Backup settings', view: 'settings', section: 'backups' },
            ],
          });
        } else {
          console.warn('Automatic backup failed again:', reason);
        }
        return { success: false, error: reason, timestamp: new Date().toISOString() };
      };

      const folder = config.backupPath.trim();
      if (!folder) return failedWith('No backup folder selected');

      setStatus(prev => ({ ...prev, isRunning: true }));
      try {
        const validation = await folderBackups().validateFolder(folder);
        if (!validation.isValid) throw new Error(validation.error || 'The backup folder is not usable');

        // Create backup data (async — stringifying the pending promise would
        // write "{}" as the backup file)
        const backupData = await createBackupData();
        const result = await folderBackups().write({
          folder,
          contents: JSON.stringify(backupData, null, 2),
          maxBackups: config.maxBackups,
        });
        if (!result.success) throw new Error(result.error || 'Backup failed for an unknown reason');

        // Only a successful backup resets the schedule; a failed one stays
        // due and is retried on the next check.
        setConfig(prev => ({ ...prev, lastBackupTime: new Date().toISOString() }));
        setStatus({ isRunning: false, lastBackupSuccess: true });
        return succeeded(result);
      } catch (error) {
        const reason = errorMessage(error, 'Unknown error occurred during backup');
        setStatus({ isRunning: false, lastBackupSuccess: false, lastBackupError: reason });
        return failedWith(reason);
      }
    },
    [config, createBackupData, setConfig, notify, notificationPreferences.backupSuccess]
  );

  // Retry buttons call the latest version (the config may have changed since)
  const performBackupRef = useRef(performBackup);
  useEffect(() => {
    performBackupRef.current = performBackup;
  }, [performBackup]);

  const performManualBackup = useCallback(() => performBackup('manual'), [performBackup]);

  const performAutomaticBackupIfDue = useCallback(async (): Promise<BackupResult | null> => {
    if (!isBackupDue(config)) return null;
    return performBackup('automatic');
  }, [config, performBackup]);

  const getStatusSummary = useCallback((): string => {
    if (!config.enabled) return 'Automatic backups are disabled';
    if (status.isRunning) return 'Backup in progress...';
    if (!config.backupPath) return 'No backup directory selected';
    if (status.lastBackupSuccess === false) return `Last backup failed: ${status.lastBackupError}`;
    if (!config.lastBackupTime) return 'No backups performed yet';
    if (isBackupDue(config)) return 'Backup is due';
    return `Last backup: ${formatDateTime(new Date(config.lastBackupTime))}`;
  }, [config, status]);

  return useMemo(
    () => ({
      // Configuration
      config,
      toggleEnabled,
      updateFrequency,
      updateBackupPath,
      updateMaxBackups,

      // Status
      status,
      getStatusSummary,

      // Actions
      selectBackupDirectory,
      performManualBackup,
      performAutomaticBackupIfDue,
    }),
    [
      config,
      toggleEnabled,
      updateFrequency,
      updateBackupPath,
      updateMaxBackups,
      status,
      getStatusSummary,
      selectBackupDirectory,
      performManualBackup,
      performAutomaticBackupIfDue,
    ]
  );
}
