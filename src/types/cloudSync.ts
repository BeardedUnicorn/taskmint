/**
 * Cloud Sync Type Definitions
 * 
 * Types and interfaces for Google Drive cloud synchronization functionality.
 */

import { z } from 'zod';

// Google Drive authentication status
export type AuthStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Sync status for operations
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// Conflict resolution strategies
export type ConflictResolution = 'local' | 'remote' | 'merge' | 'prompt';

// Google Drive authentication result
export interface GoogleDriveAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  error?: string;
}

// Google Drive file metadata
export interface GoogleDriveFileMetadata {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
  mimeType: string;
}

// Cloud sync configuration
export interface CloudSyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncOnStartup: boolean;
  syncOnExit: boolean;
  syncInterval: number; // minutes
  conflictResolution: ConflictResolution;
  lastSyncTime?: string;
  googleDriveFileId?: string;
}

// Cloud sync status
export interface CloudSyncStatus {
  authStatus: AuthStatus;
  syncStatus: SyncStatus;
  lastSyncTime?: string;
  lastSyncSuccess?: boolean;
  lastSyncError?: string;
  nextScheduledSync?: string;
  isAutoSyncEnabled: boolean;
  remoteFileExists: boolean;
  remoteFileModified?: string;
  localDataModified?: string;
}

// Sync operation result
export interface SyncResult {
  success: boolean;
  operation: 'upload' | 'download' | 'conflict';
  timestamp: string;
  error?: string;
  conflictResolution?: ConflictResolution;
  dataChanged: boolean;
}

// Conflict information
export interface SyncConflict {
  localModified: string;
  remoteModified: string;
  hasLocalChanges: boolean;
  hasRemoteChanges: boolean;
}

// Default cloud sync configuration
export const DEFAULT_CLOUD_SYNC_CONFIG: CloudSyncConfig = {
  enabled: false,
  autoSync: false,
  syncOnStartup: false,
  syncOnExit: false,
  syncInterval: 30, // 30 minutes
  conflictResolution: 'prompt',
};

// Zod schemas for validation
export const GoogleDriveAuthResultSchema = z.object({
  success: z.boolean(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  error: z.string().optional(),
});

export const GoogleDriveFileMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  modifiedTime: z.string(),
  size: z.number(),
  mimeType: z.string(),
});

export const CloudSyncConfigSchema = z.object({
  enabled: z.boolean(),
  autoSync: z.boolean(),
  syncOnStartup: z.boolean(),
  syncOnExit: z.boolean(),
  syncInterval: z.number().min(5).max(1440), // 5 minutes to 24 hours
  conflictResolution: z.enum(['local', 'remote', 'merge', 'prompt']),
  lastSyncTime: z.string().optional(),
  googleDriveFileId: z.string().optional(),
});

export const SyncResultSchema = z.object({
  success: z.boolean(),
  operation: z.enum(['upload', 'download', 'conflict']),
  timestamp: z.string(),
  error: z.string().optional(),
  conflictResolution: z.enum(['local', 'remote', 'merge', 'prompt']).optional(),
  dataChanged: z.boolean(),
});

// Type guards
export function isValidCloudSyncConfig(config: unknown): config is CloudSyncConfig {
  try {
    CloudSyncConfigSchema.parse(config);
    return true;
  } catch {
    return false;
  }
}

export function isValidSyncResult(result: unknown): result is SyncResult {
  try {
    SyncResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
}

// Utility functions
export function getNextSyncTime(config: CloudSyncConfig, lastSync?: string): Date | null {
  if (!config.enabled || !config.autoSync) {
    return null;
  }

  const lastSyncTime = lastSync ? new Date(lastSync) : new Date();
  const nextSync = new Date(lastSyncTime.getTime() + config.syncInterval * 60 * 1000);
  
  return nextSync;
}

export function isSyncDue(config: CloudSyncConfig, lastSync?: string): boolean {
  const nextSync = getNextSyncTime(config, lastSync);
  if (!nextSync) return false;
  
  return new Date() >= nextSync;
}

export function formatSyncStatus(status: CloudSyncStatus): string {
  if (status.authStatus === 'disconnected') {
    return 'Not connected to Google Drive';
  }
  
  if (status.authStatus === 'connecting') {
    return 'Connecting to Google Drive...';
  }
  
  if (status.authStatus === 'error') {
    return 'Authentication error';
  }
  
  if (status.syncStatus === 'syncing') {
    return 'Syncing data...';
  }
  
  if (status.syncStatus === 'error') {
    return `Sync error: ${status.lastSyncError || 'Unknown error'}`;
  }
  
  if (status.lastSyncTime) {
    const lastSync = new Date(status.lastSyncTime);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) {
      return 'Synced just now';
    } else if (diffMinutes < 60) {
      return `Synced ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      return `Synced ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }
  }
  
  return 'Ready to sync';
}
