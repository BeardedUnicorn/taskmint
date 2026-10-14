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
  getNextBackupTime
} from '../types/backup';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../utils/tauri';
import { errorMessage } from '../utils/errors';
import { readLocal, writeLocal } from '../utils/localStore';
import { revealAction } from '../utils/reveal';
import { useNotification } from '../contexts/NotificationContext';
import { useNotificationPreferences } from '../notifications/preferences';

export const BACKUP_CONFIG_KEY = 'automaticBackupConfig';
export const DEFAULT_BACKUP_FOLDER_NAME = 'TaskMint Backups';

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
 * Automatic backups start on in the desktop app: weekly, the newest 10 kept,
 * in Documents/TaskMint Backups. Only when no backup settings were ever saved
 * (a fresh install, or after Reset All Data); a saved choice, including
 * "off", is never touched. Resolves to the config to save, or null.
 */
export async function firstRunBackupConfig(): Promise<BackupConfig | null> {
  if (!isTauriEnvironment()) return null;
  try {
    if (window.localStorage.getItem(BACKUP_CONFIG_KEY) !== null) return null;
  } catch {
    return null;
  }
  const { documentDir, join } = await import('@tauri-apps/api/path');
  const documents = await documentDir();
  if (!documents) return null;
  const backupPath = await join(documents, DEFAULT_BACKUP_FOLDER_NAME);
  return { ...DEFAULT_BACKUP_CONFIG, enabled: true, frequency: 'weekly', backupPath, maxBackups: 10 };
}

export function useBackupSettings() {
  const [config, setConfig] = useLocalStorage<BackupConfig>(
    BACKUP_CONFIG_KEY,
    DEFAULT_BACKUP_CONFIG
  );

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

  const [status, setStatus] = useState<BackupStatus>({
    isRunning: false,
    lastBackupTime: config.lastBackupTime,
    lastBackupSuccess: undefined,
    lastBackupError: undefined,
  });

  const { createBackupData } = useDataBackup({});
  const { notify, showError } = useNotification();
  const [notificationPreferences] = useNotificationPreferences();

  // Update status when config changes
  useEffect(() => {
    setStatus(prev => ({
      ...prev,
      lastBackupTime: config.lastBackupTime,
      nextScheduledBackup: config.enabled && config.lastBackupTime 
        ? getNextBackupTime(config.frequency, config.lastBackupTime).toISOString()
        : undefined,
    }));
  }, [config]);

  // Select backup directory using Tauri dialog
  const selectBackupDirectory = useCallback(async (): Promise<string | null> => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Backup Directory',
      });

      return selected as string | null;
    } catch (error) {
      // Propagate specific error message from Tauri dialog
      const message = errorMessage(error, 'Failed to open directory selection dialog');
      console.error('Failed to open directory dialog:', error);
      showError(`Directory selection failed: ${message}`);
      return null;
    }
  }, [showError]);

  // Update backup configuration
  const updateConfig = useCallback((updates: Partial<BackupConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, [setConfig]);

  // Enable/disable automatic backups
  const toggleEnabled = useCallback(() => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  }, [setConfig]);

  // Update backup frequency
  const updateFrequency = useCallback((frequency: BackupFrequency) => {
    setConfig(prev => ({ ...prev, frequency }));
  }, [setConfig]);

  // Update backup path
  const updateBackupPath = useCallback((backupPath: string) => {
    setConfig(prev => ({ ...prev, backupPath }));
  }, [setConfig]);

  // Update max backups
  const updateMaxBackups = useCallback((maxBackups: number) => {
    setConfig(prev => ({ ...prev, maxBackups }));
  }, [setConfig]);

  // Validate backup path
  const validateBackupPath = useCallback(async (path: string): Promise<{ isValid: boolean; error?: string }> => {
    if (!path || path.trim() === '') {
      return { isValid: false, error: 'Backup path cannot be empty' };
    }

    try {
      // Call Tauri command to validate the path
      const result = await invoke<{ isValid: boolean; error?: string }>('validate_backup_path', {
        path: path.trim(),
      });
      return result;
    } catch (error) {
      return { isValid: false, error: errorMessage(error, 'Failed to validate backup path') };
    }
  }, []);

  const failed = (error: string): BackupResult => ({
    success: false,
    error,
    timestamp: new Date().toISOString(),
  });

  /**
   * Back up now. A manual backup reports either way; an automatic one is
   * quiet when it works (unless "Automatic backup saved" notifications are
   * on) and announces a failure once a day (see shouldAnnounceFailure), with
   * Retry and a way to the settings, also as an OS notification while the
   * app is in the background.
   */
  const performBackup = useCallback(async (trigger: BackupTrigger): Promise<BackupResult> => {
    const report = (result: BackupResult) => {
      if (result.success) {
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
      }

      const reason = result.error || 'Backup failed for an unknown reason';
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
      return result;
    };

    if (!config.backupPath) {
      return report(failed('No backup folder selected'));
    }
    const validation = await validateBackupPath(config.backupPath);
    if (!validation.isValid) {
      const reason = validation.error || 'The backup folder is not usable';
      setStatus(prev => ({ ...prev, lastBackupSuccess: false, lastBackupError: reason }));
      return report(failed(reason));
    }

    setStatus(prev => ({ ...prev, isRunning: true }));

    try {
      // Create backup data (async — stringifying the pending promise would
      // write "{}" as the backup file)
      const backupData = await createBackupData();
      const backupJson = JSON.stringify(backupData, null, 2);

      const result = await invoke<BackupResult>('perform_automatic_backup', {
        backupPath: config.backupPath,
        currentDataJson: backupJson,
        maxBackups: config.maxBackups,
      });

      // Only a successful backup resets the schedule; a failed one stays
      // due and is retried on the next check.
      const now = new Date().toISOString();
      if (result.success) {
        setConfig(prev => ({ ...prev, lastBackupTime: now }));
      }

      setStatus(prev => ({
        ...prev,
        isRunning: false,
        lastBackupTime: result.success ? now : prev.lastBackupTime,
        lastBackupSuccess: result.success,
        lastBackupError: result.success ? undefined : result.error,
        nextScheduledBackup: config.enabled && result.success
          ? getNextBackupTime(config.frequency, now).toISOString()
          : prev.nextScheduledBackup,
      }));

      return report(result);
    } catch (error) {
      const message = errorMessage(error, 'Unknown error occurred during backup');
      setStatus(prev => ({
        ...prev,
        isRunning: false,
        lastBackupSuccess: false,
        lastBackupError: message,
      }));
      return report(failed(message));
    }
  }, [config, createBackupData, setConfig, validateBackupPath, notify, notificationPreferences.backupSuccess]);

  // Retry buttons call the latest version (the config may have changed since)
  const performBackupRef = useRef(performBackup);
  useEffect(() => {
    performBackupRef.current = performBackup;
  }, [performBackup]);

  const performManualBackup = useCallback(() => performBackup('manual'), [performBackup]);

  // Check if backup is due
  const checkBackupDue = useCallback((): boolean => {
    return isBackupDue(config);
  }, [config]);

  // Perform automatic backup if due
  const performAutomaticBackupIfDue = useCallback(async (): Promise<BackupResult | null> => {
    if (!checkBackupDue()) {
      return null;
    }

    return await performBackup('automatic');
  }, [checkBackupDue, performBackup]);

  // Reset backup configuration
  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_BACKUP_CONFIG);
    setStatus({
      isRunning: false,
      lastBackupTime: undefined,
      lastBackupSuccess: undefined,
      lastBackupError: undefined,
      nextScheduledBackup: undefined,
    });
  }, [setConfig]);

  // Get backup status summary
  const getStatusSummary = useCallback((): string => {
    if (!config.enabled) {
      return 'Automatic backups are disabled';
    }

    if (status.isRunning) {
      return 'Backup in progress...';
    }

    if (!config.backupPath) {
      return 'No backup directory selected';
    }

    if (!status.lastBackupTime) {
      return 'No backups performed yet';
    }

    if (status.lastBackupSuccess === false) {
      return `Last backup failed: ${status.lastBackupError || 'Unknown error'}`;
    }

    const lastBackup = new Date(status.lastBackupTime);
    const nextBackup = status.nextScheduledBackup ? new Date(status.nextScheduledBackup) : null;
    
    if (nextBackup && nextBackup <= new Date()) {
      return 'Backup is due';
    }

    return `Last backup: ${lastBackup.toLocaleDateString()} ${lastBackup.toLocaleTimeString()}`;
  }, [config, status]);

  return useMemo(() => ({
    // Configuration
    config,
    updateConfig,
    toggleEnabled,
    updateFrequency,
    updateBackupPath,
    updateMaxBackups,
    resetConfig,

    // Status
    status,
    getStatusSummary,

    // Actions
    selectBackupDirectory,
    performManualBackup,
    performAutomaticBackupIfDue,
    checkBackupDue,
    validateBackupPath,
  }), [
    config, updateConfig, toggleEnabled, updateFrequency, updateBackupPath, updateMaxBackups,
    resetConfig, status, getStatusSummary, selectBackupDirectory, performManualBackup,
    performAutomaticBackupIfDue, checkBackupDue, validateBackupPath,
  ]);
}
