/**
 * Tests for useDataBackup hook
 * 
 * This test suite covers the data backup and export functionality,
 * ensuring that the export process works correctly and opens the
 * appropriate dialogs and folders.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, type Mocked } from 'vitest';
import { useDataBackup } from '../useDataBackup';
import { StorageService } from '../../services/StorageService';
import { fakeBackend } from '../../testing';

// Mock the StorageService
vi.mock('../../services/StorageService');
const mockStorageService = {
  getTasks: vi.fn(),
  getNoteTemplates: vi.fn(),
  getTaskNotes: vi.fn(),
  getDailyGoal: vi.fn(),
  getGoalAchievements: vi.fn(),
  setTasks: vi.fn(),
  setNoteTemplates: vi.fn(),
  setTaskNotes: vi.fn(),
  setDailyGoal: vi.fn(),
  setGoalAchievements: vi.fn(),
} as unknown as Mocked<StorageService>;

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

// Where the save dialog put the file, per test (null: dismissed)
let exportImpl: () => Promise<string | null>;
const files = () => fakeBackend().platform.files;

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
        fields: [],
        isActive: true,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ]);
    
    mockStorageService.getTaskNotes.mockResolvedValue([
      {
        id: 'note-1',
        taskId: 'task-1',
        templateId: 'template-1',
        templateName: 'Test Template',
        fieldValues: { content: 'Test note' },
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ]);
    
    mockStorageService.getDailyGoal.mockResolvedValue({
      targetAmount: 100,
      currency: 'USD',
      isEnabled: true,
      lastNotifiedPercent: 0,
      lastNotificationDate: '2023-01-01',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    });
    
    mockStorageService.getGoalAchievements.mockResolvedValue([
      {
        id: 'achievement-1',
        date: '2023-01-01',
        goalAmount: 100,
        earnedAmount: 120,
        currency: 'USD',
        percentageAchieved: 120,
        status: 'exceeded',
        difference: 20,
        recordedAt: '2023-01-01T00:00:00Z',
      },
    ]);

    // Imports read the picked file; exports save where the dialog says
    files().openJson.mockResolvedValue('/mock/path/export.json');
    exportImpl = async () => '/mock/path/export.json';
    files().save.mockImplementation(async () => {
      const path = await exportImpl();
      return path === null ? null : { kind: 'path', path };
    });

    // Rust-owned data read by createBackupData, and the restore command.
    fakeBackend().call.mockImplementation(async (command: string) => {
      if (command === 'get_sessions') return [mockSession];
      if (command === 'get_work_logs') {
        return { entries: [mockWorkLogEntry], mappings: [mockMapping], loadWarning: null };
      }
      if (command === 'restore_backup_data') return mockRestoreSummary;
      return undefined;
    });
  });

  const exportCalls = () => files().save.mock.calls;

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
      expect(backupData.data).not.toHaveProperty('timeEntries');
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
      fakeBackend().call.mockImplementation(async (command: string) => {
        if (command === 'get_sessions') throw new Error('store locked');
        return { entries: [], mappings: [], loadWarning: null };
      });
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await expect(result.current.createBackupData()).rejects.toThrow('Failed to gather data for export');
    });

    it('should call all storage service methods', async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await result.current.createBackupData();

      expect(mockStorageService.getTasks).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getNoteTemplates).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getTaskNotes).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getDailyGoal).toHaveBeenCalledTimes(1);
      expect(mockStorageService.getGoalAchievements).toHaveBeenCalledTimes(1);
    });

    it('should handle storage service errors', async () => {
      mockStorageService.getTasks.mockRejectedValue(new Error('Storage error'));
      
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

      expect(files().save).toHaveBeenCalledWith({
        contents: expect.stringContaining('"version": "2"'),
        suggestedName: expect.stringMatching(/^taskmint_export_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/),
        format: 'json',
      });
      expect(mockCallbacks.onExportSuccess).toHaveBeenCalledWith('/mock/path/export.json');
      expect(mockCallbacks.onExportError).not.toHaveBeenCalled();
    });

    it('says nothing when the save dialog is dismissed', async () => {
      exportImpl = async () => null;
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportSuccess).not.toHaveBeenCalled();
      expect(mockCallbacks.onExportError).not.toHaveBeenCalled();
      expect(result.current.isExporting).toBe(false);
    });

    it('should set isExporting to true during export', async () => {
      let resolveExport: (value: string) => void;
      const exportPromise = new Promise<string | null>((resolve) => {
        resolveExport = resolve;
      });
      exportImpl = () => exportPromise;

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
      exportImpl = async () => {
        throw mockError;
      };

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Export failed');
      expect(mockCallbacks.onExportSuccess).not.toHaveBeenCalled();
      expect(result.current.isExporting).toBe(false);
    });

    it('should handle string errors', async () => {
      exportImpl = async () => {
        throw 'Disk full';
      };

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      // The backend's reason, not a generic message
      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Disk full');
    });

    it('should not start export if already exporting', async () => {
      let resolveExport: (value: string) => void;
      const exportPromise = new Promise<string | null>((resolve) => {
        resolveExport = resolve;
      });
      exportImpl = () => exportPromise;

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

      // Should still only have one export call
      expect(exportCalls()).toHaveLength(1);

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

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(files().save).toHaveBeenCalledWith({
        contents: expect.any(String),
        suggestedName: 'taskmint_export_2023-01-01T10-30-45.json',
        format: 'json',
      });
    });

    it('should include all data in export JSON', async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      // Find the export call by command name rather than by position.
      const [exportCall] = exportCalls();
      const dataJson = exportCall[0].contents;
      const parsedData = JSON.parse(dataJson);

      expect(parsedData.version).toBe('2');
      expect(parsedData.exportDate).toBeDefined();
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
      // The picked file holds valid JSON
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
      
      files().openJson.mockResolvedValue(validJsonData);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportSuccess).toHaveBeenCalledWith({
        mode: 'merge',
        importedCounts: {
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
      files().openJson.mockResolvedValue(JSON.stringify(exported));
      const order: string[] = [];
      fakeBackend().call.mockImplementation(async (command: string) => {
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

      expect(fakeBackend().call).toHaveBeenCalledWith('restore_backup_data', {
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
      files().openJson.mockResolvedValue(JSON.stringify(exported));

      await act(async () => {
        await result.current.importData('replace');
      });

      expect(fakeBackend().call).toHaveBeenCalledWith('restore_backup_data', {
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
      files().openJson.mockResolvedValue(JSON.stringify({
        version: '1.0',
        exportDate: '2023-01-02T00:00:00.000Z',
        data: { sessions: [mockSession] },
      }));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData('merge');
      });

      expect(fakeBackend().call).toHaveBeenCalledWith('restore_backup_data', {
        payload: expect.objectContaining({
          sessions: [mockSession],
          workLogEntries: null,
          workLogMappings: null,
        }),
      });
    });

    it('rejects a JSON file that is not a TaskMint export without restoring anything', async () => {
      files().openJson.mockResolvedValue(JSON.stringify({ hello: 'world' }));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData('merge');
      });

      expect(fakeBackend().call).not.toHaveBeenCalledWith('restore_backup_data', expect.anything());
      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(
        expect.stringContaining('not a TaskMint export')
      );
    });

    it('should handle invalid JSON data', async () => {
      // The picked file holds invalid JSON
      files().openJson.mockResolvedValue('invalid json');

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    });
  });

  describe('dialogs and platform reasons', () => {
    it('says nothing when the open dialog is dismissed', async () => {
      files().openJson.mockResolvedValue(null);
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportSuccess).not.toHaveBeenCalled();
      expect(mockCallbacks.onImportError).not.toHaveBeenCalled();
      expect(result.current.isImporting).toBe(false);
    });

    it('explains a file the platform could not parse', async () => {
      files().openJson.mockRejectedValue('Invalid JSON file: expected value at line 1');
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(
        'Invalid file format. Please select a valid TaskMint export file.'
      );
    });

    it("passes on the platform's reason for a file it could not read", async () => {
      files().openJson.mockRejectedValue('Failed to read import file: permission denied');
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData('merge');
      });

      expect(mockCallbacks.onImportError).toHaveBeenCalledWith('Failed to read import file: permission denied');
    });

    it('reports a browser download without a path', async () => {
      files().save.mockResolvedValueOnce({ kind: 'download', name: 'taskmint_export.json' });
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportSuccess).toHaveBeenCalledWith(undefined);
    });
  });

  describe('error handling', () => {
    it('should handle createBackupData errors during export', async () => {
      mockStorageService.getTasks.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Failed to gather data for export');
      expect(result.current.isExporting).toBe(false);
    });

    it('should handle platform errors', async () => {
      exportImpl = async () => {
        throw new Error('Platform call failed');
      };

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportError).toHaveBeenCalledWith('Platform call failed');
      expect(result.current.isExporting).toBe(false);
    });
  });

  describe('callback handling', () => {
    it('should work without callbacks', async () => {
      const { result } = renderHook(() => useDataBackup({}));

      await act(async () => {
        await result.current.exportData();
      });

      // Should not throw errors even without callbacks
      expect(result.current.isExporting).toBe(false);
    });

    it('should handle partial callbacks', async () => {
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
