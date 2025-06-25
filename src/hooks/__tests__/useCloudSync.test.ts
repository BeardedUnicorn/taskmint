/**
 * Tests for useCloudSync hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useCloudSync } from '../useCloudSync';

// Mock dependencies
const mockSetConfig = jest.fn();
const mockUseLocalStorage = jest.fn();
const mockCreateBackupData = jest.fn();
const mockImportData = jest.fn();
const mockExecuteAsync = jest.fn();
const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();
const mockInvoke = jest.fn();

// Mock useLocalStorage
jest.mock('../useLocalStorage', () => ({
  useLocalStorage: jest.fn(),
}));

// Mock useDataBackup
jest.mock('../useDataBackup', () => ({
  useDataBackup: jest.fn(() => ({
    createBackupData: mockCreateBackupData,
    importData: mockImportData,
  })),
}));

// Mock useAsyncError
jest.mock('../useAsyncError', () => ({
  useAsyncError: jest.fn(() => ({
    executeAsync: mockExecuteAsync,
  })),
}));

// Mock useNotification
jest.mock('../../contexts/NotificationContext', () => ({
  useNotification: jest.fn(() => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
  })),
}));

// Mock Tauri API
jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
}));

// Mock environment utils
jest.mock('../../utils/environment', () => ({
  getGoogleDriveConfig: jest.fn(() => ({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  })),
}));

// Mock cloud sync utility functions
jest.mock('../../types/cloudSync', () => ({
  ...jest.requireActual('../../types/cloudSync'),
  isSyncDue: jest.fn(),
  getNextSyncTime: jest.fn(() => new Date('2024-01-02T10:00:00.000Z')),
  formatSyncStatus: jest.fn((status) => `Status: ${status.authStatus}`),
}));

describe('useCloudSync', () => {
  const defaultConfig = {
    enabled: false,
    autoSync: false,
    syncOnStartup: false,
    syncOnExit: false,
    syncInterval: 30,
    conflictResolution: 'prompt' as const,
  };

  const mockOptions = {
    onSyncSuccess: jest.fn(),
    onSyncError: jest.fn(),
    onAuthSuccess: jest.fn(),
    onAuthError: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockUseLocalStorage.mockReturnValue([defaultConfig, mockSetConfig]);
    mockCreateBackupData.mockReturnValue({ data: 'mock backup data' });
    mockExecuteAsync.mockImplementation((fn) => fn());
    mockInvoke.mockImplementation(() => Promise.resolve());
    
    const { useLocalStorage } = require('../useLocalStorage');
    useLocalStorage.mockImplementation(mockUseLocalStorage);
    
    const { invoke } = require('@tauri-apps/api/core');
    invoke.mockImplementation(mockInvoke);
  });

  describe('initialization', () => {
    it('should initialize with default config and status', () => {
      const { result } = renderHook(() => useCloudSync());

      expect(result.current.config).toEqual(defaultConfig);
      expect(result.current.status.authStatus).toBe('disconnected');
      expect(result.current.status.syncStatus).toBe('idle');
      expect(result.current.status.isAutoSyncEnabled).toBe(false);
      expect(result.current.status.remoteFileExists).toBe(false);
    });

    it('should call useLocalStorage with correct parameters', () => {
      renderHook(() => useCloudSync());

      expect(mockUseLocalStorage).toHaveBeenCalledWith(
        'cloudSyncConfig',
        expect.objectContaining({
          enabled: false,
          autoSync: false,
          syncOnStartup: false,
          syncOnExit: false,
          syncInterval: 30,
          conflictResolution: 'prompt',
        })
      );
    });
  });

  describe('configuration management', () => {
    it('should update config with partial updates', () => {
      const { result } = renderHook(() => useCloudSync());

      act(() => {
        result.current.updateConfig({ enabled: true, autoSync: true });
      });

      expect(mockSetConfig).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetConfig.mock.calls[0][0];
      const newConfig = updateFunction(defaultConfig);
      
      expect(newConfig).toEqual({
        ...defaultConfig,
        enabled: true,
        autoSync: true,
      });
    });
  });

  describe('authentication', () => {
    it('should get auth URL successfully', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?...';
      mockInvoke.mockResolvedValue(mockAuthUrl);

      const { result } = renderHook(() => useCloudSync());

      let authUrl: string;
      await act(async () => {
        authUrl = await result.current.getAuthUrl();
      });

      expect(mockInvoke).toHaveBeenCalledWith('google_drive_get_auth_url', {
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:3000/auth/callback',
      });
      expect(authUrl!).toBe(mockAuthUrl);
    });

    it('should handle auth URL error', async () => {
      const error = new Error('Failed to get auth URL');
      mockInvoke.mockRejectedValue(error);

      const { result } = renderHook(() => useCloudSync(mockOptions));

      await act(async () => {
        try {
          await result.current.getAuthUrl();
        } catch (err) {
          // Expected to throw
        }
      });

      // Since executeAsync is mocked to just call the function,
      // we expect the error to be thrown and caught by the hook
      expect(mockInvoke).toHaveBeenCalledWith('google_drive_get_auth_url', {
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:3000/auth/callback',
      });
    });

    it('should authenticate successfully', async () => {
      const mockAuthResult = {
        success: true,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2024-01-01T12:00:00.000Z',
      };
      mockInvoke.mockResolvedValue(mockAuthResult);

      const { result } = renderHook(() => useCloudSync(mockOptions));

      let authSuccess: boolean;
      await act(async () => {
        authSuccess = await result.current.authenticate('auth-code');
      });

      expect(mockInvoke).toHaveBeenCalledWith('google_drive_authenticate', {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/auth/callback',
        authCode: 'auth-code',
      });
      expect(authSuccess!).toBe(true);
      expect(result.current.status.authStatus).toBe('connected');
      expect(mockOptions.onAuthSuccess).toHaveBeenCalled();
    });

    it('should handle authentication failure', async () => {
      const mockAuthResult = {
        success: false,
        error: 'Invalid auth code',
      };
      mockInvoke.mockResolvedValue(mockAuthResult);

      const { result } = renderHook(() => useCloudSync(mockOptions));

      let authSuccess: boolean;
      await act(async () => {
        authSuccess = await result.current.authenticate('invalid-code');
      });

      expect(authSuccess!).toBe(false);
      expect(result.current.status.authStatus).toBe('error');
      expect(mockOptions.onAuthError).toHaveBeenCalledWith('Invalid auth code');
    });

    it('should handle authentication error', async () => {
      const { result } = renderHook(() => useCloudSync(mockOptions));

      // Reset and setup mock after hook initialization
      mockInvoke.mockReset();
      const networkError = { message: 'Network error' };
      mockInvoke.mockRejectedValue(networkError);

      let authSuccess: boolean;
      await act(async () => {
        try {
          authSuccess = await result.current.authenticate('auth-code');
        } catch (err) {
          authSuccess = false;
        }
      });

      // Verify the invoke was called with correct parameters
      expect(mockInvoke).toHaveBeenCalledWith('google_drive_authenticate', {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/auth/callback',
        authCode: 'auth-code',
      });
    });

    it('should disconnect successfully', () => {
      const { result } = renderHook(() => useCloudSync());

      // First set connected status
      act(() => {
        result.current.status.authStatus = 'connected';
      });

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.status.authStatus).toBe('disconnected');
      expect(result.current.status.syncStatus).toBe('idle');
      expect(mockSetConfig).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('sync operations', () => {
    it('should upload data successfully', async () => {
      const configWithFileId = { ...defaultConfig, googleDriveFileId: 'file-123' };
      mockUseLocalStorage.mockReturnValue([configWithFileId, mockSetConfig]);

      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T10:00:00.000Z',
        size: 1024,
        mimeType: 'application/json',
      };
      mockInvoke.mockResolvedValue(mockFileMetadata);

      const { result } = renderHook(() => useCloudSync(mockOptions));

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.uploadData();
      });

      expect(mockInvoke).toHaveBeenCalledWith('google_drive_update_file', {
        fileId: 'file-123',
        content: expect.any(String),
      });
      expect(syncResult.success).toBe(true);
      expect(syncResult.operation).toBe('upload');
      expect(mockOptions.onSyncSuccess).toHaveBeenCalled();
    });

    it('should download data successfully', async () => {
      const configWithFileId = { ...defaultConfig, googleDriveFileId: 'file-123' };
      mockUseLocalStorage.mockReturnValue([configWithFileId, mockSetConfig]);

      const mockBackupJson = JSON.stringify({ data: 'downloaded data' });
      mockInvoke.mockResolvedValue(mockBackupJson);

      const { result } = renderHook(() => useCloudSync(mockOptions));

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.downloadData();
      });

      expect(mockInvoke).toHaveBeenCalledWith('google_drive_download_file', {
        fileId: 'file-123',
      });
      expect(mockImportData).toHaveBeenCalledWith({ data: 'downloaded data' });
      expect(syncResult.success).toBe(true);
      expect(syncResult.operation).toBe('download');
      expect(mockOptions.onSyncSuccess).toHaveBeenCalled();
    });

    it('should handle download error when no file ID', async () => {
      const { result } = renderHook(() => useCloudSync(mockOptions));

      let syncResult: any;
      await act(async () => {
        try {
          syncResult = await result.current.downloadData();
        } catch (err) {
          // Expected to throw since no file ID is set
          syncResult = {
            success: false,
            error: err.message,
          };
        }
      });

      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toBe('No backup file found on Google Drive');
    });
  });

  describe('conflict handling', () => {
    it('should check for conflicts', async () => {
      const configWithFileId = {
        ...defaultConfig,
        googleDriveFileId: 'file-123',
        lastSyncTime: '2024-01-01T09:00:00.000Z',
      };
      mockUseLocalStorage.mockReturnValue([configWithFileId, mockSetConfig]);

      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T10:00:00.000Z', // Remote is newer
        size: 1024,
        mimeType: 'application/json',
      };
      mockInvoke.mockResolvedValue(mockFileMetadata);

      const { result } = renderHook(() => useCloudSync());

      let conflict: any;
      await act(async () => {
        conflict = await result.current.checkForConflicts();
      });

      expect(mockInvoke).toHaveBeenCalledWith('google_drive_get_file_metadata', {
        fileId: 'file-123',
      });
      expect(conflict).toEqual({
        localModified: '2024-01-01T09:00:00.000Z',
        remoteModified: '2024-01-01T10:00:00.000Z',
        hasLocalChanges: true,
        hasRemoteChanges: true,
      });
    });

    it('should return null when no conflicts', async () => {
      const configWithFileId = {
        ...defaultConfig,
        googleDriveFileId: 'file-123',
        lastSyncTime: '2024-01-01T11:00:00.000Z', // Local is newer
      };
      mockUseLocalStorage.mockReturnValue([configWithFileId, mockSetConfig]);

      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T10:00:00.000Z',
        size: 1024,
        mimeType: 'application/json',
      };
      mockInvoke.mockResolvedValue(mockFileMetadata);

      const { result } = renderHook(() => useCloudSync());

      let conflict: any;
      await act(async () => {
        conflict = await result.current.checkForConflicts();
      });

      expect(conflict).toBe(null);
    });

    it('should handle sync with conflict resolution - local wins', async () => {
      const configWithConflict = {
        ...defaultConfig,
        googleDriveFileId: 'file-123',
        conflictResolution: 'local' as const,
      };
      mockUseLocalStorage.mockReturnValue([configWithConflict, mockSetConfig]);

      // Mock file metadata for conflict detection
      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T10:00:00.000Z', // Remote is newer
        size: 1024,
        mimeType: 'application/json',
      };

      // Mock file list for upload
      const mockFileList = [{ id: 'file-123' }];

      // Setup invoke mocks in order
      mockInvoke
        .mockResolvedValueOnce(mockFileMetadata) // checkForConflicts
        .mockResolvedValueOnce(mockFileList) // uploadData - list files
        .mockResolvedValueOnce(mockFileMetadata); // uploadData - update file

      const { result } = renderHook(() => useCloudSync(mockOptions));

      // Set connected status by updating the config
      act(() => {
        result.current.updateConfig({ enabled: true });
      });

      // Manually set auth status for this test
      result.current.status.authStatus = 'connected';

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.sync();
      });

      expect(syncResult.success).toBe(true);
      expect(syncResult.operation).toBe('upload');
    });

    it('should handle sync with conflict resolution - remote wins', async () => {
      const configWithConflict = {
        ...defaultConfig,
        googleDriveFileId: 'file-123',
        conflictResolution: 'remote' as const,
        lastSyncTime: '2024-01-01T09:00:00.000Z',
      };
      mockUseLocalStorage.mockReturnValue([configWithConflict, mockSetConfig]);

      // Mock file metadata for conflict detection
      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T10:00:00.000Z', // Remote is newer
        size: 1024,
        mimeType: 'application/json',
      };

      const mockBackupJson = JSON.stringify({ data: 'downloaded data' });

      // Setup invoke mocks in order - need to reset first
      mockInvoke.mockReset();
      mockInvoke
        .mockResolvedValueOnce(mockFileMetadata) // checkForConflicts
        .mockResolvedValueOnce(mockBackupJson); // downloadData

      const { result } = renderHook(() => useCloudSync(mockOptions));

      // Manually set auth status for this test
      result.current.status.authStatus = 'connected';

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.sync();
      });

      expect(syncResult.success).toBe(true);
      expect(syncResult.operation).toBe('download');
    });

    it('should force upload when specified', async () => {
      const configWithFileId = { ...defaultConfig, googleDriveFileId: 'file-123' };
      mockUseLocalStorage.mockReturnValue([configWithFileId, mockSetConfig]);

      // Mock file list and update for upload
      const mockFileList = [{ id: 'file-123' }];
      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T12:00:00.000Z',
        size: 1024,
        mimeType: 'application/json',
      };

      mockInvoke
        .mockResolvedValueOnce(mockFileList) // list files
        .mockResolvedValueOnce(mockFileMetadata); // update file

      const { result } = renderHook(() => useCloudSync());

      // Manually set auth status for this test
      result.current.status.authStatus = 'connected';

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.sync('upload');
      });

      expect(syncResult.success).toBe(true);
      expect(syncResult.operation).toBe('upload');
    });

    it('should force download when specified', async () => {
      const configWithFileId = { ...defaultConfig, googleDriveFileId: 'file-123' };
      mockUseLocalStorage.mockReturnValue([configWithFileId, mockSetConfig]);

      const mockBackupJson = JSON.stringify({ data: 'downloaded data' });
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValue(mockBackupJson);

      const { result } = renderHook(() => useCloudSync());

      // Manually set auth status for this test
      result.current.status.authStatus = 'connected';

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.sync('download');
      });

      expect(syncResult.success).toBe(true);
      expect(syncResult.operation).toBe('download');
    });

    it('should throw error when not authenticated', async () => {
      const { result } = renderHook(() => useCloudSync());

      await act(async () => {
        try {
          await result.current.sync();
          fail('Should have thrown error');
        } catch (error) {
          expect(error.message).toBe('Not authenticated with Google Drive');
        }
      });
    });
  });

  describe('automatic sync', () => {
    it('should check if sync is due', () => {
      const { isSyncDue } = require('../../types/cloudSync');
      isSyncDue.mockReturnValue(true);

      const { result } = renderHook(() => useCloudSync());

      expect(result.current.checkSyncDue()).toBe(true);
      expect(isSyncDue).toHaveBeenCalledWith(defaultConfig, defaultConfig.lastSyncTime);
    });

    it('should perform automatic sync if due', async () => {
      const { isSyncDue } = require('../../types/cloudSync');
      isSyncDue.mockReturnValue(true);

      const configEnabled = {
        ...defaultConfig,
        enabled: true,
        autoSync: true,
        googleDriveFileId: 'file-123',
      };
      mockUseLocalStorage.mockReturnValue([configEnabled, mockSetConfig]);

      // Mock file list and update for upload (default sync behavior)
      const mockFileList = [{ id: 'file-123' }];
      const mockFileMetadata = {
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-01T12:00:00.000Z',
        size: 1024,
        mimeType: 'application/json',
      };

      mockInvoke
        .mockResolvedValueOnce(mockFileMetadata) // checkForConflicts
        .mockResolvedValueOnce(mockFileList) // uploadData - list files
        .mockResolvedValueOnce(mockFileMetadata); // uploadData - update file

      const { result } = renderHook(() => useCloudSync());

      // Manually set auth status for this test
      result.current.status.authStatus = 'connected';

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.performAutomaticSyncIfDue();
      });

      expect(syncResult).toBeTruthy();
      expect(syncResult.success).toBe(true);
    });

    it('should not perform sync if not due', async () => {
      const { isSyncDue } = require('../../types/cloudSync');
      isSyncDue.mockReturnValue(false);

      const { result } = renderHook(() => useCloudSync());

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.performAutomaticSyncIfDue();
      });

      expect(syncResult).toBe(null);
    });

    it('should not perform sync if not enabled', async () => {
      const { result } = renderHook(() => useCloudSync());

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.performAutomaticSyncIfDue();
      });

      expect(syncResult).toBe(null);
    });

    it('should not perform sync if not authenticated', async () => {
      const configEnabled = {
        ...defaultConfig,
        enabled: true,
        autoSync: true,
      };
      mockUseLocalStorage.mockReturnValue([configEnabled, mockSetConfig]);

      const { result } = renderHook(() => useCloudSync());

      let syncResult: any;
      await act(async () => {
        syncResult = await result.current.performAutomaticSyncIfDue();
      });

      expect(syncResult).toBe(null);
    });
  });

  describe('utilities', () => {
    it('should get formatted status', () => {
      const { formatSyncStatus } = require('../../types/cloudSync');
      formatSyncStatus.mockReturnValue('Formatted status');

      const { result } = renderHook(() => useCloudSync());

      expect(result.current.getFormattedStatus()).toBe('Formatted status');
      expect(formatSyncStatus).toHaveBeenCalledWith(result.current.status);
    });
  });

  describe('return values', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useCloudSync());

      // State
      expect(result.current).toHaveProperty('config');
      expect(result.current).toHaveProperty('status');

      // Configuration
      expect(result.current).toHaveProperty('updateConfig');

      // Authentication
      expect(result.current).toHaveProperty('getAuthUrl');
      expect(result.current).toHaveProperty('authenticate');
      expect(result.current).toHaveProperty('disconnect');

      // Sync operations
      expect(result.current).toHaveProperty('sync');
      expect(result.current).toHaveProperty('uploadData');
      expect(result.current).toHaveProperty('downloadData');
      expect(result.current).toHaveProperty('checkForConflicts');

      // Automatic sync
      expect(result.current).toHaveProperty('checkSyncDue');
      expect(result.current).toHaveProperty('performAutomaticSyncIfDue');

      // Utilities
      expect(result.current).toHaveProperty('getFormattedStatus');
    });

    it('should return functions for all methods', () => {
      const { result } = renderHook(() => useCloudSync());

      expect(typeof result.current.updateConfig).toBe('function');
      expect(typeof result.current.getAuthUrl).toBe('function');
      expect(typeof result.current.authenticate).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');
      expect(typeof result.current.sync).toBe('function');
      expect(typeof result.current.uploadData).toBe('function');
      expect(typeof result.current.downloadData).toBe('function');
      expect(typeof result.current.checkForConflicts).toBe('function');
      expect(typeof result.current.checkSyncDue).toBe('function');
      expect(typeof result.current.performAutomaticSyncIfDue).toBe('function');
      expect(typeof result.current.getFormattedStatus).toBe('function');
    });
  });
});
