/**
 * Tests for useDataBackup hook
 * 
 * This test suite covers the data backup and export functionality,
 * ensuring that the export process works correctly and opens the
 * appropriate dialogs and folders.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDataBackup } from '../useDataBackup';
import { StorageService } from '../../services/StorageService';
import { invoke } from '@tauri-apps/api/core';
import { safeInvoke } from '../../utils/tauri';

// Mock the StorageService
vi.mock('../../services/StorageService');
const mockStorageService = {
  getTimeEntries: vi.fn(),
  getTasks: vi.fn(),
  getNoteTemplates: vi.fn(),
  getTaskNotes: vi.fn(),
  getDailyGoal: vi.fn(),
  getGoalAchievements: vi.fn(),
  setTimeEntries: vi.fn(),
  setTasks: vi.fn(),
  setNoteTemplates: vi.fn(),
  setTaskNotes: vi.fn(),
  setDailyGoal: vi.fn(),
  setGoalAchievements: vi.fn(),
};

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock the Tauri utilities
vi.mock('../../utils/tauri', () => ({
  safeInvoke: vi.fn(),
  isTauriEnvironment: vi.fn(() => true), // Always return true in tests
}));

describe('useDataBackup', () => {
  const mockCallbacks = {
    onExportSuccess: vi.fn(),
    onExportError: vi.fn(),
    onImportSuccess: vi.fn(),
    onImportError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock StorageService.getInstance to return our mock
    (StorageService.getInstance as any).mockReturnValue(mockStorageService);
    
    // Set up default mock data
    mockStorageService.getTimeEntries.mockResolvedValue([
      {
        id: 'entry-1',
        taskName: 'Test Task',
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T11:00:00Z'),
        duration: 3600000,
        isRunning: false,
        date: '2023-01-01',
      },
    ]);
    
    mockStorageService.getTasks.mockResolvedValue([
      {
        id: 'task-1',
        name: 'Test Task',
        hourlyRate: 50,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ]);
    
    mockStorageService.getNoteTemplates.mockResolvedValue([
      {
        id: 'template-1',
        name: 'Test Template',
        content: 'Test content',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ]);
    
    mockStorageService.getTaskNotes.mockResolvedValue([
      {
        id: 'note-1',
        taskId: 'task-1',
        content: 'Test note',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ]);
    
    mockStorageService.getDailyGoal.mockResolvedValue({
      id: 'goal-1',
      targetAmount: 100,
      isEnabled: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    });
    
    mockStorageService.getGoalAchievements.mockResolvedValue([
      {
        id: 'achievement-1',
        date: '2023-01-01',
        targetAmount: 100,
        actualAmount: 120,
        achieved: true,
        createdAt: '2023-01-01T00:00:00Z',
      },
    ]);

    // Mock safeInvoke to resolve successfully by default
    (safeInvoke as any).mockResolvedValue('/mock/path/export.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      expect(result.current.isExporting).toBe(false);
      expect(result.current.isImporting).toBe(false);
      expect(typeof result.current.exportData).toBe('function');
      expect(typeof result.current.importData).toBe('function');
      expect(typeof result.current.createBackupData).toBe('function');
    });
  });

  describe('createBackupData', () => {
    it('should create backup data with all required fields', async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      const backupData = await result.current.createBackupData();

      expect(backupData).toHaveProperty('version', '1.0');
      expect(backupData).toHaveProperty('exportDate');
      expect(backupData).toHaveProperty('data');
      expect(backupData.data).toHaveProperty('timeEntries');
      expect(backupData.data).toHaveProperty('tasks');
      expect(backupData.data).toHaveProperty('noteTemplates');
      expect(backupData.data).toHaveProperty('taskNotes');
      expect(backupData.data).toHaveProperty('dailyGoal');
      expect(backupData.data).toHaveProperty('goalAchievements');
    });

    it('should call all storage service methods', async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await result.current.createBackupData();

      expect(mockStorageService.getTimeEntries).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getTasks).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getNoteTemplates).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getTaskNotes).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getDailyGoal).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getGoalAchievements).toHaveBeenCalledTimes(1);
    });

    it('should handle storage service errors', async () => {
      mockStorageService.getTimeEntries.mockRejectedValue(new Error('Storage error'));
      
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await expect(result.current.createBackupData()).rejects.toThrow('Failed to gather data for export');
    });
  });

  describe('exportData', () => {
    it('should successfully export data and call success callback', async () => {
      const mockExportPath = '/mock/path/taskmint_export_2023-01-01T10-00-00.json';
      (invoke as any).mockResolvedValue(mockExportPath);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(safeInvoke).toHaveBeenCalledWith('export_data_to_file', {
        dataJson: expect.stringContaining('"version": "1.0"'),
        suggestedFilename: expect.stringMatching(/^taskmint_export_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/),
      });
      expect(mockCallbacks.onExportSuccess).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onExportError).not.toHaveBeenCalled();
    });

    it('should set isExporting to true during export', async () => {
      let resolveExport: (value: string) => void;
      const exportPromise = new Promise<string>((resolve) => {
        resolveExport = resolve;
      });
      (invoke as any).mockReturnValue(exportPromise);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      // Start export
      act(() => {
        result.current.exportData();
      });

      // Should be exporting
      expect(result.current.isExporting).toBe(true);

      // Resolve the export
      act(() => {
        resolveExport!('/mock/path/export.json');
      });

      await waitFor(() => {
        expect(result.current.isExporting).toBe(false);
      });
    });

    it('should handle export errors and call error callback', async () => {
      const mockError = new Error('Export failed');
      (safeInvoke as any).mockRejectedValue(mockError);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Export failed');
      expect(mockCallbacks.onExportSuccess).not.toHaveBeenCalled();
      expect(result.current.isExporting).toBe(false);
    });

    it('should handle string errors', async () => {
      (safeInvoke as any).mockRejectedValue('String error');

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Failed to export data');
    });

    it('should not start export if already exporting', async () => {
      let resolveExport: (value: string) => void;
      const exportPromise = new Promise<string>((resolve) => {
        resolveExport = resolve;
      });
      (safeInvoke as any).mockReturnValue(exportPromise);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      // Start first export
      await act(async () => {
        result.current.exportData();
      });

      expect(result.current.isExporting).toBe(true);

      // Try to start second export - should be ignored
      await act(async () => {
        result.current.exportData();
      });

      // Should still only have one invoke call
      expect(safeInvoke).toHaveBeenCalledTimes(1);

      // Resolve the export
      act(() => {
        resolveExport!('/mock/path/export.json');
      });

      await waitFor(() => {
        expect(result.current.isExporting).toBe(false);
      });
    });

    it('should generate correct filename format', async () => {
      const mockDate = new Date('2023-01-01T10:30:45.123Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      (invoke as any).mockResolvedValue('/mock/path/export.json');

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(safeInvoke).toHaveBeenCalledWith('export_data_to_file', {
        dataJson: expect.any(String),
        suggestedFilename: 'taskmint_export_2023-01-01T10-30-45.json',
      });
    });

    it('should include all data in export JSON', async () => {
      (safeInvoke as any).mockResolvedValue('/mock/path/export.json');

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      const exportCall = (safeInvoke as any).mock.calls[0];
      const dataJson = exportCall[1].dataJson;
      const parsedData = JSON.parse(dataJson);

      expect(parsedData.version).toBe('1.0');
      expect(parsedData.exportDate).toBeDefined();
      expect(parsedData.data.timeEntries).toHaveLength(1);
      expect(parsedData.data.tasks).toHaveLength(1);
      expect(parsedData.data.noteTemplates).toHaveLength(1);
      expect(parsedData.data.taskNotes).toHaveLength(1);
      expect(parsedData.data.dailyGoal).toBeDefined();
      expect(parsedData.data.goalAchievements).toHaveLength(1);
    });
  });

  describe('importData', () => {
    it('should set isImporting state correctly', async () => {
      // Mock the Tauri invoke to return valid JSON data
      const validJsonData = JSON.stringify({
        version: '1.0',
        exportDate: '2023-01-01T10:00:00.000Z',
        data: {
          timeEntries: [],
          tasks: [],
          noteTemplates: [],
          taskNotes: [],
          dailyGoal: null,
          goalAchievements: []
        }
      });
      
      (safeInvoke as any).mockResolvedValue(validJsonData);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportSuccess).toHaveBeenCalledWith({
        mode: 'merge',
        importedCounts: {
          timeEntries: 0,
          tasks: 0,
          noteTemplates: 0,
          taskNotes: 0,
          goalAchievements: 0
        }
      });
    });

    it('should handle invalid JSON data', async () => {
      // Mock the Tauri invoke to return invalid JSON
      (invoke as any).mockResolvedValue('invalid json');

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    });
  });

  describe('error handling', () => {
    it('should handle createBackupData errors during export', async () => {
      mockStorageService.getTimeEntries.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Failed to gather data for export');
      expect(result.current.isExporting).toBe(false);
    });

    it('should handle Tauri command errors', async () => {
      (safeInvoke as any).mockRejectedValue(new Error('Tauri command failed'));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Tauri command failed');
      expect(result.current.isExporting).toBe(false);
    });
  });

  describe('callback handling', () => {
    it('should work without callbacks', async () => {
      (safeInvoke as any).mockResolvedValue('/mock/path/export.json');

      const { result } = renderHook(() => useDataBackup({}));

      await act(async () => {
        await result.current.exportData();
      });

      // Should not throw errors even without callbacks
      expect(result.current.isExporting).toBe(false);
    });

    it('should handle partial callbacks', async () => {
      (safeInvoke as any).mockResolvedValue('/mock/path/export.json');

      const { result } = renderHook(() => useDataBackup({
        onExportSuccess: mockCallbacks.onExportSuccess,
        // onExportError not provided
      }));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
