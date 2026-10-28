/**
 * Backup Configuration Types
 * 
 * Types for automatic periodic backup functionality including
 * configuration settings and backup management.
 */

import { z } from 'zod';

// Backup frequency options
export type BackupFrequency = 'daily' | 'weekly' | 'monthly';

// Backup configuration interface
export interface BackupConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  backupPath: string;
  maxBackups: number;
  lastBackupTime?: string;
}

// Backup status interface
export interface BackupStatus {
  isRunning: boolean;
  lastBackupTime?: string;
  lastBackupSuccess?: boolean;
  lastBackupError?: string;
  nextScheduledBackup?: string;
}

// Backup result interface
export interface BackupResult {
  success: boolean;
  filePath?: string;
  error?: string;
  timestamp: string;
  fileSize?: number;
}

// Default backup configuration
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  frequency: 'daily',
  backupPath: '',
  maxBackups: 10,
};

const FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export function getBackupFrequencyLabel(frequency: BackupFrequency): string {
  return FREQUENCY_LABELS[frequency];
}

/** When the next backup is due: a day, a week or a month after the last (or now). */
export function getNextBackupTime(frequency: BackupFrequency, lastBackupTime?: string): Date {
  const lastBackup = lastBackupTime ? new Date(lastBackupTime) : new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  switch (frequency) {
    case 'weekly':
      return new Date(lastBackup.getTime() + 7 * DAY_MS);
    case 'monthly': {
      const nextMonth = new Date(lastBackup);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    }
    default:
      // Daily, and anything a stored setting may hold instead
      return new Date(lastBackup.getTime() + DAY_MS);
  }
}

export function isBackupDue(config: BackupConfig): boolean {
  if (!config.enabled || !config.lastBackupTime) {
    return config.enabled; // If enabled but no last backup, it's due
  }
  
  const nextBackupTime = getNextBackupTime(config.frequency, config.lastBackupTime);
  return new Date() >= nextBackupTime;
}

// ============================================================================
// Export / backup file format
// ============================================================================

/**
 * "2": adds `data.workLogs`, and import restores `data.sessions` (v1 files
 * carried sessions that import ignored). v1 files still import.
 */
export const BACKUP_FORMAT_VERSION = '2';

// Records stay untyped here; see the schema comment for where they are checked.
const recordList = z.array(z.any());

/**
 * Structural check only. Records are validated where they are stored: zod
 * schemas in StorageService for localStorage data, and the Rust restore
 * command (per-record, skipping unreadable ones) for sessions and work logs.
 */
export const BackupFileSchema = z.object({
  version: z.string().optional(),
  exportDate: z.string().optional(),
  data: z.object({
    // Older files only; ignored on import (tracked time is in `sessions`)
    timeEntries: recordList.optional(),
    tasks: recordList.optional(),
    noteTemplates: recordList.optional(),
    taskNotes: recordList.optional(),
    dailyGoal: z.any().optional(),
    goalAchievements: recordList.optional(),
    sessions: recordList.optional(),
    workLogs: z
      .object({
        entries: recordList.optional(),
        mappings: recordList.optional(),
      })
      .optional(),
  }),
});

/** restore_backup_data's reply. */
export type { RestoreSummary } from '@taskmint/contracts';
