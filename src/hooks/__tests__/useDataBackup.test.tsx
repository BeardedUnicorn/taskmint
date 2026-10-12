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
} as unknown as vi.Mocked<StorageService>;

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock the Tauri utilities
vi.mock('../../utils/tauri', () => ({
  safeInvoke: vi.fn(),
  isTauriEnvironment: vi.fn(() => true), // Always return true in tests
}));

const mockSession = {
  id: 'session-1',
  taskId: 'task-1',
  taskName: 'Test Task',
  timerInstances: [],
  totalDuration: 0,
  isActive: false,
  date: '2023-01-01',
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
};
const mockWorkLogEntry = { id: 'wl-1', kind: 'timed', amountCents: 500, status: 'Paid' };
const mockMapping = { projectId: 'proj-1', taskId: 'task-1' };
const mockRestoreSummary = {
  sessionsRestored: 1,
  sessionsAlreadyPresent: 0,
  workLogEntriesRestored: 1,
  workLogMappingsRestored: 1,
  recordsSkipped: 0,
};

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
    vi.mocked(StorageService.getInstance).mockReturnValue(mockStorageService);
    
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

    // Rust-owned data read by createBackupData, and the restore command.
    (invoke as any).mockImplementation(async (command: string) => {
      if (command === 'get_sessions') return [mockSession];
      if (command === 'get_work_logs') {
        return { entries: [mockWorkLogEntry], mappings: [mockMapping], loadWarning: null };
      }
      if (command === 'restore_backup_data') return mockRestoreSummary;
      return undefined;
    });
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

      expect(backupData).toHaveProperty('version', '2');
      expect(backupData).toHaveProperty('exportDate');
      expect(backupData).toHaveProperty('data');
      expect(backupData.data).toHaveProperty('timeEntries');
      expect(backupData.data).toHaveProperty('tasks');
      expect(backupData.data).toHaveProperty('noteTemplates');
      expect(backupData.data).toHaveProperty('taskNotes');
      expect(backupData.data).toHaveProperty('dailyGoal');
      expect(backupData.data).toHaveProperty('goalAchievements');
      expect(backupData.data.sessions).toEqual([mockSession]);
      expect(backupData.data.workLogs).toEqual({
        entries: [mockWorkLogEntry],
        mappings: [mockMapping],
      });
    });

    it('fails instead of writing a backup without tracked time when sessions cannot be read', async () => {
      (invoke as any).mockImplementation(async (command: string) => {
        if (command === 'get_sessions') throw new Error('store locked');
        return { entries: [], mappings: [], loadWarning: null };
      });
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await expect(result.current.createBackupData()).rejects.toThrow('Failed to gather data for export');
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
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(safeInvoke).toHaveBeenCalledWith('export_data_to_file', {
        dataJson: expect.stringContaining('"version": "2"'),
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
      vi.spyOn(global, 'Date').mockImplementation(function () {
        return mockDate;
      } as any);

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

      // Find the export call by command name rather than by position.
      const exportCall = (safeInvoke as any).mock.calls.find(
        (call: any[]) => call[0] === 'export_data_to_file'
      );
      const dataJson = exportCall[1].dataJson;
      const parsedData = JSON.parse(dataJson);

      expect(parsedData.version).toBe('2');
      expect(parsedData.exportDate).toBeDefined();
      expect(parsedData.data.timeEntries).toHaveLength(1);
      expect(parsedData.data.tasks).toHaveLength(1);
      expect(parsedData.data.noteTemplates).toHaveLength(1);
      expect(parsedData.data.taskNotes).toHaveLength(1);
      expect(parsedData.data.dailyGoal).toBeDefined();
      expect(parsedData.data.goalAchievements).toHaveLength(1);
      expect(parsedData.data.sessions).toHaveLength(1);
      expect(parsedData.data.workLogs.entries).toHaveLength(1);
      expect(parsedData.data.workLogs.mappings).toHaveLength(1);
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
          goalAchievements: 0,
          sessions: 1,
          workLogEntries: 1,
        },
        recordsSkipped: 0,
      });
    });

    it('restores sessions and work logs through the backend before local data', async () => {
      const exported = {
        version: '2',
        exportDate: '2023-01-02T00:00:00.000Z',
        data: {
          tasks: [{ id: 'task-2', name: 'Imported', createdAt: '2023-01-01T00:00:00Z', updatedAt: '2023-01-01T00:00:00Z' }],
          sessions: [mockSession],
          workLogs: { entries: [mockWorkLogEntry], mappings: [mockMapping] },
        },
      };
      (safeInvoke as any).mockResolvedValue(JSON.stringify(exported));
      const order: string[] = [];
      (invoke as any).mockImplementation(async (command: string) => {
        order.push(command);
        return mockRestoreSummary;
      });
      mockStorageService.setTasks.mockImplementation(async () => {
        order.push('setTasks');
      });

      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData('merge');
      });

      expect(invoke).toHaveBeenCalledWith('restore_backup_data', {
        payload: {
          mode: 'merge',
          sessions: [mockSession],
          workLogEntries: [mockWorkLogEntry],
          workLogMappings: [mockMapping],
          exportedAt: '2023-01-02T00:00:00.000Z',
        },
      });
      expect(order).toEqual(['restore_backup_data', 'setTasks']);
      expect(mockCallbacks.onImportError).not.toHaveBeenCalled();
    });

    it('round-trips: importing an export restores exactly what was exported', async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      const exported = await result.current.createBackupData();
      (safeInvoke as any).mockResolvedValue(JSON.stringify(exported));

      await act(async () => {
        await result.current.importData('replace');
      });

      expect(invoke).toHaveBeenCalledWith('restore_backup_data', {
        payload: {
          mode: 'replace',
          sessions: exported.data.sessions,
          workLogEntries: exported.data.workLogs.entries,
          workLogMappings: exported.data.workLogs.mappings,
          exportedAt: exported.exportDate,
        },
      });
      // JSON round-trip, as the file would be read back
      const fromFile = JSON.parse(JSON.stringify(exported.data));
      expect(mockStorageService.setTasks).toHaveBeenCalledWith(fromFile.tasks);
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalledWith(fromFile.noteTemplates);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith(fromFile.taskNotes);
      expect(mockStorageService.setDailyGoal).toHaveBeenCalledWith(fromFile.dailyGoal);
      expect(mockStorageService.setGoalAchievements).toHaveBeenCalledWith(fromFile.goalAchievements);
      expect(mockCallbacks.onImportError).not.toHaveBeenCalled();
    });

    it('leaves work logs untouched when importing a v1 export without them', async () => {
      (safeInvoke as any).mockResolvedValue(JSON.stringify({
        version: '1.0',
        exportDate: '2023-01-02T00:00:00.000Z',
        data: { sessions: [mockSession] },
      }));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData('merge');
      });

      expect(invoke).toHaveBeenCalledWith('restore_backup_data', {
        payload: expect.objectContaining({
          sessions: [mockSession],
          workLogEntries: null,
          workLogMappings: null,
        }),
      });
    });

    it('rejects a JSON file that is not a TaskMint export without restoring anything', async () => {
      (safeInvoke as any).mockResolvedValue(JSON.stringify({ hello: 'world' }));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData('merge');
      });

      expect(invoke).not.toHaveBeenCalledWith('restore_backup_data', expect.anything());
      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(
        expect.stringContaining('not a TaskMint export')
      );
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
