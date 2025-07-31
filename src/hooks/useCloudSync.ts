/**
 * Cloud Sync Hook
 * 
 * Manages Google Drive cloud synchronization functionality including
 * authentication, file operations, and sync status management.
 */

import { useCallback, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useDataBackup } from './useDataBackup';
import { useAsyncError } from './useAsyncError';
import { useNotification } from '../contexts/NotificationContext';
import { getGoogleDriveConfig } from '../utils/environment';
import { safeInvoke, isTauriEnvironment } from '../utils/tauri';
import {
  CloudSyncConfig,
  CloudSyncStatus,
  SyncResult,
  GoogleDriveAuthResult,
  GoogleDriveFileMetadata,
  SyncConflict,
  // AuthStatus, // Commented out unused import
  // SyncStatus, // Commented out unused import
  // ConflictResolution, // Commented out unused import
  DEFAULT_CLOUD_SYNC_CONFIG,
  isSyncDue,
  getNextSyncTime,
  formatSyncStatus,
} from '../types/cloudSync';

// Google OAuth configuration
const { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } = getGoogleDriveConfig();
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

// App-specific file configuration
// const APP_FOLDER_NAME = 'TimeTrackerAppData'; // Commented out unused variable
const BACKUP_FILE_NAME = 'time_tracker_backup.json';

export interface UseCloudSyncOptions {
  onSyncSuccess?: (result: SyncResult) => void;
  onSyncError?: (error: string) => void;
  onAuthSuccess?: () => void;
  onAuthError?: (error: string) => void;
}

/**
 * Hook for managing Google Drive cloud synchronization
 */
export function useCloudSync(options: UseCloudSyncOptions = {}) {
  const [config, setConfig] = useLocalStorage<CloudSyncConfig>('cloudSyncConfig', DEFAULT_CLOUD_SYNC_CONFIG);
  const [status, setStatus] = useState<CloudSyncStatus>({
    authStatus: 'disconnected',
    syncStatus: 'idle',
    isAutoSyncEnabled: config.autoSync,
    remoteFileExists: false,
  });

  const { executeAsync } = useAsyncError();
  const { createBackupData, importData } = useDataBackup({});
  const { showError, showSuccess } = useNotification();

  // Update config
  const updateConfig = useCallback((updates: Partial<CloudSyncConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, [setConfig]);

  // Generate Google Drive authentication URL
  const getAuthUrl = useCallback(async (): Promise<string> => {
    return executeAsync(
      async () => {
        if (!isTauriEnvironment()) {
          throw new Error('Google Drive authentication is only available in the desktop app');
        }

        const authUrl = await safeInvoke<string>('google_drive_get_auth_url', {
          clientId: GOOGLE_CLIENT_ID,
          redirectUri: REDIRECT_URI,
        });

        if (!authUrl) {
          throw new Error('Failed to generate authentication URL');
        }

        return authUrl;
      },
      {
        operation: 'get-auth-url',
        errorHandler: (error) => {
          // Propagate specific error from Rust backend
          const errorMessage = `Failed to get authentication URL: ${error.message}`;
          if (options.onAuthError) {
            options.onAuthError(errorMessage);
          } else {
            // Fallback to notification system if no callback provided
            showError(errorMessage);
          }
        },
      }
    );
  }, [executeAsync, options, showError]);

  // Authenticate with Google Drive
  const authenticate = useCallback(async (authCode: string): Promise<boolean> => {
    setStatus(prev => ({ ...prev, authStatus: 'connecting' }));

    return executeAsync(
      async () => {
        if (!isTauriEnvironment()) {
          throw new Error('Google Drive authentication is only available in the desktop app');
        }

        const result = await safeInvoke<GoogleDriveAuthResult>('google_drive_authenticate', {
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          redirectUri: REDIRECT_URI,
          authCode,
        });

        if (!result) {
          throw new Error('Authentication failed');
        }

        if (result.success) {
          setStatus(prev => ({
            ...prev,
            authStatus: 'connected',
          }));

          if (options.onAuthSuccess) {
            options.onAuthSuccess();
          } else {
            // Fallback to notification system
            showSuccess('Successfully connected to Google Drive');
          }

          return true;
        } else {
          setStatus(prev => ({
            ...prev,
            authStatus: 'error',
          }));

          // Propagate specific error from Rust backend
          const errorMessage = result.error || 'Authentication failed';
          if (options.onAuthError) {
            options.onAuthError(errorMessage);
          } else {
            // Fallback to notification system
            showError(`Google Drive authentication failed: ${errorMessage}`);
          }

          return false;
        }
      },
      {
        operation: 'authenticate',
        errorHandler: (error) => {
          setStatus(prev => ({
            ...prev,
            authStatus: 'error',
          }));

          // Propagate specific error from Rust backend
          const errorMessage = `Authentication failed: ${error.message}`;
          if (options.onAuthError) {
            options.onAuthError(errorMessage);
          } else {
            // Fallback to notification system
            showError(errorMessage);
          }
        },
      }
    );
  }, [executeAsync, options, showError, showSuccess]);

  // Disconnect from Google Drive
  const disconnect = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      authStatus: 'disconnected',
      syncStatus: 'idle',
      lastSyncTime: undefined,
      lastSyncSuccess: undefined,
      lastSyncError: undefined,
      remoteFileExists: false,
    }));

    updateConfig({
      enabled: false,
      autoSync: false,
      lastSyncTime: undefined,
      googleDriveFileId: undefined,
    });
  }, [updateConfig]);

  // Find or create app backup file on Google Drive
  const findOrCreateBackupFile = useCallback(async (): Promise<string> => {
    return executeAsync(
      async () => {
        // First, try to find existing backup file
        const query = `name='${BACKUP_FILE_NAME}' and mimeType='application/json'`;
        const files = await safeInvoke<GoogleDriveFileMetadata[]>('google_drive_list_files', {
          query,
        });

        if (!files) {
          throw new Error('Failed to search for backup files');
        }

        if (files.length > 0) {
          // Use existing file
          const fileId = files[0].id;
          updateConfig({ googleDriveFileId: fileId });
          return fileId;
        }

        // Create new backup file
        const backupData = createBackupData();
        const backupJson = JSON.stringify(backupData, null, 2);

        const fileMetadata = await safeInvoke<GoogleDriveFileMetadata>('google_drive_upload_file', {
          filename: BACKUP_FILE_NAME,
          content: backupJson,
          parentFolderId: null, // Root folder
        });

        if (!fileMetadata) {
          throw new Error('Failed to create backup file');
        }

        updateConfig({ googleDriveFileId: fileMetadata.id });
        return fileMetadata.id;
      },
      {
        operation: 'find-or-create-backup-file',
      }
    );
  }, [executeAsync, createBackupData, updateConfig]);

  // Upload data to Google Drive
  const uploadData = useCallback(async (): Promise<SyncResult> => {
    setStatus(prev => ({ ...prev, syncStatus: 'syncing' }));

    return executeAsync(
      async () => {
        const backupData = createBackupData();
        const backupJson = JSON.stringify(backupData, null, 2);

        let fileId = config.googleDriveFileId;
        let operation: 'upload' | 'download' | 'conflict' = 'upload';

        if (fileId) {
          // Update existing file
          const result = await safeInvoke<GoogleDriveFileMetadata>('google_drive_update_file', {
            fileId,
            content: backupJson,
          });

          if (!result) {
            throw new Error('Failed to update backup file');
          }
        } else {
          // Create new file
          fileId = await findOrCreateBackupFile();
        }

        const now = new Date().toISOString();
        updateConfig({ lastSyncTime: now });

        const result: SyncResult = {
          success: true,
          operation,
          timestamp: now,
          dataChanged: true,
        };

        setStatus(prev => ({
          ...prev,
          syncStatus: 'success',
          lastSyncTime: now,
          lastSyncSuccess: true,
          lastSyncError: undefined,
          nextScheduledSync: config.autoSync 
            ? getNextSyncTime(config, now)?.toISOString()
            : undefined,
        }));

        if (options.onSyncSuccess) {
          options.onSyncSuccess(result);
        }

        return result;
      },
      {
        operation: 'upload-data',
        errorHandler: (error) => {
          const result: SyncResult = {
            success: false,
            operation: 'upload',
            timestamp: new Date().toISOString(),
            error: error.message,
            dataChanged: false,
          };

          setStatus(prev => ({
            ...prev,
            syncStatus: 'error',
            lastSyncSuccess: false,
            lastSyncError: error.message,
          }));

          if (options.onSyncError) {
            options.onSyncError(error.message);
          }

          return result;
        },
      }
    ).finally(() => {
      setTimeout(() => {
        setStatus(prev => ({ ...prev, syncStatus: 'idle' }));
      }, 2000);
    });
  }, [executeAsync, createBackupData, config, updateConfig, findOrCreateBackupFile, options]);

  // Download data from Google Drive
  const downloadData = useCallback(async (): Promise<SyncResult> => {
    setStatus(prev => ({ ...prev, syncStatus: 'syncing' }));

    return executeAsync(
      async () => {
        const fileId = config.googleDriveFileId;
        if (!fileId) {
          throw new Error('No backup file found on Google Drive');
        }

        const backupJson = await safeInvoke<string>('google_drive_download_file', {
          fileId,
        });

        if (!backupJson) {
          throw new Error('Failed to download backup file');
        }

        const backupData = JSON.parse(backupJson);
        await importData(backupData);

        const now = new Date().toISOString();
        updateConfig({ lastSyncTime: now });

        const result: SyncResult = {
          success: true,
          operation: 'download',
          timestamp: now,
          dataChanged: true,
        };

        setStatus(prev => ({
          ...prev,
          syncStatus: 'success',
          lastSyncTime: now,
          lastSyncSuccess: true,
          lastSyncError: undefined,
          nextScheduledSync: config.autoSync 
            ? getNextSyncTime(config, now)?.toISOString()
            : undefined,
        }));

        if (options.onSyncSuccess) {
          options.onSyncSuccess(result);
        }

        return result;
      },
      {
        operation: 'download-data',
        errorHandler: (error) => {
          const result: SyncResult = {
            success: false,
            operation: 'download',
            timestamp: new Date().toISOString(),
            error: error.message,
            dataChanged: false,
          };

          setStatus(prev => ({
            ...prev,
            syncStatus: 'error',
            lastSyncSuccess: false,
            lastSyncError: error.message,
          }));

          if (options.onSyncError) {
            options.onSyncError(error.message);
          }

          return result;
        },
      }
    ).finally(() => {
      setTimeout(() => {
        setStatus(prev => ({ ...prev, syncStatus: 'idle' }));
      }, 2000);
    });
  }, [executeAsync, config, updateConfig, importData, options]);

  // Check for sync conflicts
  const checkForConflicts = useCallback(async (): Promise<SyncConflict | null> => {
    return executeAsync(
      async () => {
        const fileId = config.googleDriveFileId;
        if (!fileId) {
          return null;
        }

        const fileMetadata = await safeInvoke<GoogleDriveFileMetadata>('google_drive_get_file_metadata', {
          fileId,
        });

        if (!fileMetadata) {
          throw new Error('Failed to get file metadata');
        }

        const remoteModified = new Date(fileMetadata.modifiedTime);
        const localModified = config.lastSyncTime ? new Date(config.lastSyncTime) : new Date(0);

        const hasRemoteChanges = remoteModified > localModified;
        const hasLocalChanges = true; // Assume local changes for now

        if (hasRemoteChanges && hasLocalChanges) {
          return {
            localModified: localModified.toISOString(),
            remoteModified: remoteModified.toISOString(),
            hasLocalChanges,
            hasRemoteChanges,
          };
        }

        return null;
      },
      {
        operation: 'check-conflicts',
      }
    );
  }, [executeAsync, config]);

  // Perform sync operation
  const sync = useCallback(async (forceDirection?: 'upload' | 'download'): Promise<SyncResult> => {
    if (status.authStatus !== 'connected') {
      throw new Error('Not authenticated with Google Drive');
    }

    if (forceDirection === 'upload') {
      return uploadData();
    }

    if (forceDirection === 'download') {
      return downloadData();
    }

    // Check for conflicts
    const conflict = await checkForConflicts();
    if (conflict) {
      // Handle conflict based on configuration
      switch (config.conflictResolution) {
        case 'local':
          return uploadData();
        case 'remote':
          return downloadData();
        case 'prompt':
          // For now, default to upload
          // In a real implementation, you'd show a dialog
          return uploadData();
        default:
          return uploadData();
      }
    }

    // No conflicts, upload local data
    return uploadData();
  }, [status.authStatus, config.conflictResolution, uploadData, downloadData, checkForConflicts]);

  // Check if sync is due
  const checkSyncDue = useCallback((): boolean => {
    return isSyncDue(config, config.lastSyncTime);
  }, [config]);

  // Perform automatic sync if due
  const performAutomaticSyncIfDue = useCallback(async (): Promise<SyncResult | null> => {
    if (!config.enabled || !config.autoSync || status.authStatus !== 'connected') {
      return null;
    }

    if (!checkSyncDue()) {
      return null;
    }

    return sync();
  }, [config.enabled, config.autoSync, status.authStatus, checkSyncDue, sync]);

  // Get formatted status
  const getFormattedStatus = useCallback((): string => {
    return formatSyncStatus(status);
  }, [status]);

  return {
    // State
    config,
    status,

    // Configuration
    updateConfig,

    // Authentication
    getAuthUrl,
    authenticate,
    disconnect,

    // Sync operations
    sync,
    uploadData,
    downloadData,
    checkForConflicts,

    // Automatic sync
    checkSyncDue,
    performAutomaticSyncIfDue,

    // Utilities
    getFormattedStatus,
  };
}
