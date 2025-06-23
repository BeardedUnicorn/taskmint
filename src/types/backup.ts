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

// Zod schemas for validation
export const BackupFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);

export const BackupConfigSchema = z.object({
  enabled: z.boolean(),
  frequency: BackupFrequencySchema,
  backupPath: z.string(),
  maxBackups: z.number().min(1).max(100),
  lastBackupTime: z.string().optional(),
});

export const BackupStatusSchema = z.object({
  isRunning: z.boolean(),
  lastBackupTime: z.string().optional(),
  lastBackupSuccess: z.boolean().optional(),
  lastBackupError: z.string().optional(),
  nextScheduledBackup: z.string().optional(),
});

export const BackupResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
  fileSize: z.number().optional(),
});

// Default backup configuration
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  frequency: 'daily',
  backupPath: '',
  maxBackups: 10,
};

// Helper functions
export function getBackupFrequencyLabel(frequency: BackupFrequency): string {
  switch (frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    default:
      return 'Unknown';
  }
}

export function getBackupFrequencyDescription(frequency: BackupFrequency): string {
  switch (frequency) {
    case 'daily':
      return 'Create a backup every day';
    case 'weekly':
      return 'Create a backup every week';
    case 'monthly':
      return 'Create a backup every month';
    default:
      return 'Unknown frequency';
  }
}

export function getNextBackupTime(frequency: BackupFrequency, lastBackupTime?: string): Date {
  const now = new Date();
  const lastBackup = lastBackupTime ? new Date(lastBackupTime) : now;
  
  switch (frequency) {
    case 'daily':
      return new Date(lastBackup.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(lastBackup.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      const nextMonth = new Date(lastBackup);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

export function isBackupDue(config: BackupConfig): boolean {
  if (!config.enabled || !config.lastBackupTime) {
    return config.enabled; // If enabled but no last backup, it's due
  }
  
  const nextBackupTime = getNextBackupTime(config.frequency, config.lastBackupTime);
  return new Date() >= nextBackupTime;
}
