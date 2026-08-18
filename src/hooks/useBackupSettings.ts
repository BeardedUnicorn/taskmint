/**
 * Backup Settings Hook
 * 
 * Manages automatic backup configuration including frequency,
 * backup path selection, and backup status monitoring.
 */

import { useCallback, useState, useEffect } from 'react';
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

export function useBackupSettings() {
  const [config, setConfig] = useLocalStorage<BackupConfig>(
    'automaticBackupConfig',
    DEFAULT_BACKUP_CONFIG
  );

  const [status, setStatus] = useState<BackupStatus>({
    isRunning: false,
    lastBackupTime: config.lastBackupTime,
    lastBackupSuccess: undefined,
    lastBackupError: undefined,
  });

  const { createBackupData } = useDataBackup({});

  // Safe notification functions without NotificationProvider dependency
  const showError = useCallback((message: string) => {
    console.error('Backup Settings Error:', message);
  }, []);

  const showSuccess = useCallback((message: string) => {
    console.log('Backup Settings Success:', message);
  }, []);

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
      const errorMessage = error instanceof Error ? error.message : 'Failed to open directory selection dialog';
      console.error('Failed to open directory dialog:', error);
      showError(`Directory selection failed: ${errorMessage}`);
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
      // If the Tauri command doesn't exist or fails, do basic validation
      const errorMessage = error instanceof Error ? error.message : 'Failed to validate backup path';
      return { isValid: false, error: errorMessage };
    }
  }, []);

  // Perform manual backup
  const performManualBackup = useCallback(async (): Promise<BackupResult> => {
    if (!config.backupPath) {
      const errorMessage = 'No backup directory selected';
      showError(errorMessage);
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }

    // Validate backup path before proceeding
    const validation = await validateBackupPath(config.backupPath);
    if (!validation.isValid) {
      const errorMessage = validation.error || 'Invalid backup directory';
      showError(`Backup path validation failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }

    setStatus(prev => ({ ...prev, isRunning: true }));

    try {
      // Create backup data (async — stringifying the pending promise would
      // write "{}" as the backup file)
      const backupData = await createBackupData();
      const backupJson = JSON.stringify(backupData, null, 2);

      // Call Tauri command to perform backup
      const result = await invoke<BackupResult>('perform_automatic_backup', {
        backupPath: config.backupPath,
        currentDataJson: backupJson,
        maxBackups: config.maxBackups,
      });

      // Update config with last backup time
      const now = new Date().toISOString();
      setConfig(prev => ({ ...prev, lastBackupTime: now }));

      // Update status
      setStatus(prev => ({
        ...prev,
        isRunning: false,
        lastBackupTime: now,
        lastBackupSuccess: result.success,
        lastBackupError: result.success ? undefined : result.error,
        nextScheduledBackup: config.enabled
          ? getNextBackupTime(config.frequency, now).toISOString()
          : undefined,
      }));

      // Show user notification based on result
      if (result.success) {
        showSuccess('Backup completed successfully');
      } else {
        // Propagate specific error from Rust backend
        const backendError = result.error || 'Backup failed for unknown reason';
        showError(`Backup failed: ${backendError}`);
      }

      return result;
    } catch (error) {
      // Extract specific error message from Tauri invoke call
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during backup';

      setStatus(prev => ({
        ...prev,
        isRunning: false,
        lastBackupSuccess: false,
        lastBackupError: errorMessage,
      }));

      // Show specific error message to user
      showError(`Backup failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }, [config, createBackupData, setConfig, showError, showSuccess, validateBackupPath]);

  // Check if backup is due
  const checkBackupDue = useCallback((): boolean => {
    return isBackupDue(config);
  }, [config]);

  // Perform automatic backup if due
  const performAutomaticBackupIfDue = useCallback(async (): Promise<BackupResult | null> => {
    if (!checkBackupDue()) {
      return null;
    }

    return await performManualBackup();
  }, [checkBackupDue, performManualBackup]);

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

  return {
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
  };
}
