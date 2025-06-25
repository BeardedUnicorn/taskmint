/**
 * Tests for useBackupSettings hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useBackupSettings } from '../useBackupSettings';
import { BackupFrequency } from '../../types/backup';

// Mock dependencies
const mockSetConfig = jest.fn();
const mockUseLocalStorage = jest.fn();
const mockCreateBackupData = jest.fn();
const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();
const mockInvoke = jest.fn();
const mockDialogOpen = jest.fn();

// Mock useLocalStorage
jest.mock('../useLocalStorage', () => ({
  useLocalStorage: jest.fn(),
}));

// Mock useDataBackup
jest.mock('../useDataBackup', () => ({
  useDataBackup: jest.fn(() => ({
    createBackupData: mockCreateBackupData,
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

// Mock Tauri dialog plugin
jest.mock('@tauri-apps/plugin-dialog', () => ({
  open: jest.fn(),
}));

// Mock backup utility functions
jest.mock('../../types/backup', () => ({
  ...jest.requireActual('../../types/backup'),
  isBackupDue: jest.fn(),
  getNextBackupTime: jest.fn(() => new Date('2024-01-02T10:00:00.000Z')),
}));

describe('useBackupSettings', () => {
  const defaultConfig = {
    enabled: false,
    frequency: 'daily' as BackupFrequency,
    backupPath: '',
    maxBackups: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockUseLocalStorage.mockReturnValue([defaultConfig, mockSetConfig]);
    mockCreateBackupData.mockReturnValue({ data: 'mock backup data' });
    mockInvoke.mockImplementation(() => Promise.resolve());
    
    const { useLocalStorage } = require('../useLocalStorage');
    useLocalStorage.mockImplementation(mockUseLocalStorage);
    
    const { invoke } = require('@tauri-apps/api/core');
    invoke.mockImplementation(mockInvoke);
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const { result } = renderHook(() => useBackupSettings());

      expect(result.current.config).toEqual(defaultConfig);
      expect(result.current.status.isRunning).toBe(false);
    });

    it('should call useLocalStorage with correct parameters', () => {
      renderHook(() => useBackupSettings());

      expect(mockUseLocalStorage).toHaveBeenCalledWith(
        'automaticBackupConfig',
        expect.objectContaining({
          enabled: false,
          frequency: 'daily',
          backupPath: '',
          maxBackups: 10,
        })
      );
    });

    it('should update status when config changes', async () => {
      const configWithBackup = {
        ...defaultConfig,
        enabled: true,
        lastBackupTime: '2024-01-01T10:00:00.000Z',
      };

      mockUseLocalStorage.mockReturnValue([configWithBackup, mockSetConfig]);

      const { result } = renderHook(() => useBackupSettings());

      await waitFor(() => {
        expect(result.current.status.lastBackupTime).toBe('2024-01-01T10:00:00.000Z');
        expect(result.current.status.nextScheduledBackup).toBe('2024-01-02T10:00:00.000Z');
      });
    });
  });

  describe('configuration management', () => {
    it('should update config with partial updates', () => {
      const { result } = renderHook(() => useBackupSettings());

      act(() => {
        result.current.updateConfig({ enabled: true, maxBackups: 20 });
      });

      expect(mockSetConfig).toHaveBeenCalledWith(expect.any(Function));
      
      const updateFunction = mockSetConfig.mock.calls[0][0];
      const newConfig = updateFunction(defaultConfig);
      
      expect(newConfig).toEqual({
        ...defaultConfig,
        enabled: true,
        maxBackups: 20,
      });
    });

    it('should toggle enabled state', () => {
      const { result } = renderHook(() => useBackupSettings());

      act(() => {
        result.current.toggleEnabled();
      });

      const updateFunction = mockSetConfig.mock.calls[0][0];
      const newConfig = updateFunction(defaultConfig);
      
      expect(newConfig.enabled).toBe(true);
    });

    it('should update frequency', () => {
      const { result } = renderHook(() => useBackupSettings());

      act(() => {
        result.current.updateFrequency('weekly');
      });

      const updateFunction = mockSetConfig.mock.calls[0][0];
      const newConfig = updateFunction(defaultConfig);
      
      expect(newConfig.frequency).toBe('weekly');
    });

    it('should update backup path', () => {
      const { result } = renderHook(() => useBackupSettings());

      act(() => {
        result.current.updateBackupPath('/path/to/backup');
      });

      const updateFunction = mockSetConfig.mock.calls[0][0];
      const newConfig = updateFunction(defaultConfig);
      
      expect(newConfig.backupPath).toBe('/path/to/backup');
    });

    it('should update max backups', () => {
      const { result } = renderHook(() => useBackupSettings());

      act(() => {
        result.current.updateMaxBackups(15);
      });

      const updateFunction = mockSetConfig.mock.calls[0][0];
      const newConfig = updateFunction(defaultConfig);
      
      expect(newConfig.maxBackups).toBe(15);
    });

    it('should reset config to defaults', () => {
      const { result } = renderHook(() => useBackupSettings());

      act(() => {
        result.current.resetConfig();
      });

      expect(mockSetConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          frequency: 'daily',
          backupPath: '',
          maxBackups: 10,
        })
      );
    });
  });

  describe('directory selection', () => {
    it('should select backup directory successfully', async () => {
      mockDialogOpen.mockResolvedValue('/selected/path');
      
      // Mock the dynamic import
      jest.doMock('@tauri-apps/plugin-dialog', () => ({
        open: mockDialogOpen,
      }));

      const { result } = renderHook(() => useBackupSettings());

      let selectedPath: string | null = null;
      await act(async () => {
        selectedPath = await result.current.selectBackupDirectory();
      });

      expect(selectedPath).toBe('/selected/path');
      expect(mockDialogOpen).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: 'Select Backup Directory',
      });
    });

    it('should handle dialog cancellation', async () => {
      mockDialogOpen.mockResolvedValue(null);
      
      jest.doMock('@tauri-apps/plugin-dialog', () => ({
        open: mockDialogOpen,
      }));

      const { result } = renderHook(() => useBackupSettings());

      let selectedPath: string | null = null;
      await act(async () => {
        selectedPath = await result.current.selectBackupDirectory();
      });

      expect(selectedPath).toBe(null);
    });

    it('should handle dialog error', async () => {
      const error = new Error('Dialog failed');
      mockDialogOpen.mockRejectedValue(error);
      
      jest.doMock('@tauri-apps/plugin-dialog', () => ({
        open: mockDialogOpen,
      }));

      const { result } = renderHook(() => useBackupSettings());

      let selectedPath: string | null = null;
      await act(async () => {
        selectedPath = await result.current.selectBackupDirectory();
      });

      expect(selectedPath).toBe(null);
      expect(mockShowError).toHaveBeenCalledWith('Directory selection failed: Dialog failed');
    });
  });

  describe('backup path validation', () => {
    it('should validate empty path', async () => {
      const { result } = renderHook(() => useBackupSettings());

      let validationResult: any;
      await act(async () => {
        validationResult = await result.current.validateBackupPath('');
      });

      expect(validationResult).toEqual({
        isValid: false,
        error: 'Backup path cannot be empty',
      });
    });

    it('should validate path using Tauri command', async () => {
      mockInvoke.mockResolvedValue({ isValid: true });

      const { result } = renderHook(() => useBackupSettings());

      let validationResult: any;
      await act(async () => {
        validationResult = await result.current.validateBackupPath('/valid/path');
      });

      expect(mockInvoke).toHaveBeenCalledWith('validate_backup_path', {
        path: '/valid/path',
      });
      expect(validationResult).toEqual({ isValid: true });
    });

    it('should handle Tauri validation error', async () => {
      const error = new Error('Path validation failed');
      mockInvoke.mockRejectedValue(error);

      const { result } = renderHook(() => useBackupSettings());

      let validationResult: any;
      await act(async () => {
        validationResult = await result.current.validateBackupPath('/invalid/path');
      });

      expect(validationResult).toEqual({
        isValid: false,
        error: 'Path validation failed',
      });
    });
  });

  describe('manual backup', () => {
    it('should fail when no backup path is set', async () => {
      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performManualBackup();
      });

      expect(backupResult.success).toBe(false);
      expect(backupResult.error).toBe('No backup directory selected');
      expect(mockShowError).toHaveBeenCalledWith('No backup directory selected');
    });

    it('should fail when backup path validation fails', async () => {
      const configWithPath = { ...defaultConfig, backupPath: '/invalid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);
      mockInvoke.mockResolvedValueOnce({ isValid: false, error: 'Invalid directory' });

      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performManualBackup();
      });

      expect(backupResult.success).toBe(false);
      expect(backupResult.error).toBe('Invalid directory');
      expect(mockShowError).toHaveBeenCalledWith('Backup path validation failed: Invalid directory');
    });

    it('should perform successful backup', async () => {
      const configWithPath = { ...defaultConfig, backupPath: '/valid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation success
      mockInvoke.mockResolvedValueOnce({ isValid: true });

      // Mock backup success
      const mockBackupResult = {
        success: true,
        filePath: '/valid/path/backup.json',
        timestamp: '2024-01-01T10:00:00.000Z',
      };
      mockInvoke.mockResolvedValueOnce(mockBackupResult);

      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performManualBackup();
      });

      expect(mockInvoke).toHaveBeenCalledWith('perform_automatic_backup', {
        backupPath: '/valid/path',
        currentDataJson: expect.any(String),
        maxBackups: 10,
      });
      expect(backupResult.success).toBe(true);
      expect(mockShowSuccess).toHaveBeenCalledWith('Backup completed successfully');
    });

    it('should handle backup failure from Tauri', async () => {
      const configWithPath = { ...defaultConfig, backupPath: '/valid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation success
      mockInvoke.mockResolvedValueOnce({ isValid: true });

      // Mock backup failure
      const mockBackupResult = {
        success: false,
        error: 'Disk full',
        timestamp: '2024-01-01T10:00:00.000Z',
      };
      mockInvoke.mockResolvedValueOnce(mockBackupResult);

      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performManualBackup();
      });

      expect(backupResult.success).toBe(false);
      expect(backupResult.error).toBe('Disk full');
      expect(mockShowError).toHaveBeenCalledWith('Backup failed: Disk full');
    });

    it('should handle Tauri invoke error', async () => {
      const configWithPath = { ...defaultConfig, backupPath: '/valid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation success
      mockInvoke.mockResolvedValueOnce({ isValid: true });

      // Mock invoke error
      const error = new Error('Network error');
      mockInvoke.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performManualBackup();
      });

      expect(backupResult.success).toBe(false);
      expect(backupResult.error).toBe('Network error');
      expect(mockShowError).toHaveBeenCalledWith('Backup failed: Network error');
    });

    it('should update status during backup process', async () => {
      const configWithPath = { ...defaultConfig, backupPath: '/valid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation success
      mockInvoke.mockResolvedValueOnce({ isValid: true });

      // Mock backup success
      const mockBackupResult = {
        success: true,
        filePath: '/valid/path/backup.json',
        timestamp: '2024-01-01T10:00:00.000Z',
      };
      mockInvoke.mockResolvedValueOnce(mockBackupResult);

      const { result } = renderHook(() => useBackupSettings());

      await act(async () => {
        await result.current.performManualBackup();
      });

      // Should update config with last backup time
      expect(mockSetConfig).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('backup due checking', () => {
    it('should check if backup is due', () => {
      const { isBackupDue } = require('../../types/backup');
      isBackupDue.mockReturnValue(true);

      const { result } = renderHook(() => useBackupSettings());

      expect(result.current.checkBackupDue()).toBe(true);
      expect(isBackupDue).toHaveBeenCalledWith(defaultConfig);
    });

    it('should perform automatic backup if due', async () => {
      const { isBackupDue } = require('../../types/backup');
      isBackupDue.mockReturnValue(true);

      const configWithPath = { ...defaultConfig, backupPath: '/valid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation and backup success
      mockInvoke.mockResolvedValueOnce({ isValid: true });
      mockInvoke.mockResolvedValueOnce({
        success: true,
        timestamp: '2024-01-01T10:00:00.000Z',
      });

      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performAutomaticBackupIfDue();
      });

      expect(backupResult).toBeTruthy();
      expect(backupResult.success).toBe(true);
    });

    it('should not perform backup if not due', async () => {
      const { isBackupDue } = require('../../types/backup');
      isBackupDue.mockReturnValue(false);

      const { result } = renderHook(() => useBackupSettings());

      let backupResult: any;
      await act(async () => {
        backupResult = await result.current.performAutomaticBackupIfDue();
      });

      expect(backupResult).toBe(null);
    });
  });

  describe('status summary', () => {
    it('should return disabled message when backups are disabled', () => {
      const { result } = renderHook(() => useBackupSettings());

      expect(result.current.getStatusSummary()).toBe('Automatic backups are disabled');
    });

    it('should return running message when backup is in progress', async () => {
      const configWithPath = { ...defaultConfig, enabled: true, backupPath: '/valid/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation success but delay the backup to simulate running state
      mockInvoke.mockResolvedValueOnce({ isValid: true });

      let resolveBackup: (value: any) => void;
      const backupPromise = new Promise(resolve => {
        resolveBackup = resolve;
      });
      mockInvoke.mockReturnValueOnce(backupPromise);

      const { result } = renderHook(() => useBackupSettings());

      // Start backup but don't await it
      act(() => {
        result.current.performManualBackup();
      });

      // Check status while backup is running
      await waitFor(() => {
        expect(result.current.status.isRunning).toBe(true);
      });

      expect(result.current.getStatusSummary()).toBe('Backup in progress...');

      // Complete the backup
      resolveBackup!({
        success: true,
        timestamp: '2024-01-01T10:00:00.000Z',
      });
    });

    it('should return no directory message when path is not set', () => {
      const configEnabled = { ...defaultConfig, enabled: true };
      mockUseLocalStorage.mockReturnValue([configEnabled, mockSetConfig]);

      const { result } = renderHook(() => useBackupSettings());

      expect(result.current.getStatusSummary()).toBe('No backup directory selected');
    });

    it('should return no backups message when none performed', () => {
      const configWithPath = { ...defaultConfig, enabled: true, backupPath: '/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      const { result } = renderHook(() => useBackupSettings());

      expect(result.current.getStatusSummary()).toBe('No backups performed yet');
    });

    it('should return failure message when last backup failed', async () => {
      const configWithPath = { ...defaultConfig, enabled: true, backupPath: '/path' };
      mockUseLocalStorage.mockReturnValue([configWithPath, mockSetConfig]);

      // Mock validation success but backup failure
      mockInvoke.mockResolvedValueOnce({ isValid: true });
      mockInvoke.mockResolvedValueOnce({
        success: false,
        error: 'Disk full',
        timestamp: '2024-01-01T10:00:00.000Z',
      });

      const { result } = renderHook(() => useBackupSettings());

      // Perform a failed backup to set the status
      await act(async () => {
        await result.current.performManualBackup();
      });

      expect(result.current.getStatusSummary()).toBe('Last backup failed: Disk full');
    });
  });

  describe('return values', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useBackupSettings());

      // Configuration
      expect(result.current).toHaveProperty('config');
      expect(result.current).toHaveProperty('updateConfig');
      expect(result.current).toHaveProperty('toggleEnabled');
      expect(result.current).toHaveProperty('updateFrequency');
      expect(result.current).toHaveProperty('updateBackupPath');
      expect(result.current).toHaveProperty('updateMaxBackups');
      expect(result.current).toHaveProperty('resetConfig');

      // Status
      expect(result.current).toHaveProperty('status');
      expect(result.current).toHaveProperty('getStatusSummary');

      // Actions
      expect(result.current).toHaveProperty('selectBackupDirectory');
      expect(result.current).toHaveProperty('performManualBackup');
      expect(result.current).toHaveProperty('performAutomaticBackupIfDue');
      expect(result.current).toHaveProperty('checkBackupDue');
      expect(result.current).toHaveProperty('validateBackupPath');
    });

    it('should return functions for all methods', () => {
      const { result } = renderHook(() => useBackupSettings());

      expect(typeof result.current.updateConfig).toBe('function');
      expect(typeof result.current.toggleEnabled).toBe('function');
      expect(typeof result.current.updateFrequency).toBe('function');
      expect(typeof result.current.updateBackupPath).toBe('function');
      expect(typeof result.current.updateMaxBackups).toBe('function');
      expect(typeof result.current.resetConfig).toBe('function');
      expect(typeof result.current.getStatusSummary).toBe('function');
      expect(typeof result.current.selectBackupDirectory).toBe('function');
      expect(typeof result.current.performManualBackup).toBe('function');
      expect(typeof result.current.performAutomaticBackupIfDue).toBe('function');
      expect(typeof result.current.checkBackupDue).toBe('function');
      expect(typeof result.current.validateBackupPath).toBe('function');
    });
  });
});
