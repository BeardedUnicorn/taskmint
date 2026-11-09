/**
 * Tests for useDataBackup hook
 *
 * This test suite covers the data backup and export functionality,
 * ensuring that the export process works correctly and opens the
 * appropriate dialogs and folders.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, type Mocked } from 'vitest';
import { parseBackupFile, useDataBackup } from '../useDataBackup';
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
  getWithdrawals: vi.fn(),
  getAccountSettings: vi.fn(),
  setTasks: vi.fn(),
  setNoteTemplates: vi.fn(),
  setTaskNotes: vi.fn(),
  setDailyGoal: vi.fn(),
  setGoalAchievements: vi.fn(),
  setWithdrawals: vi.fn(),
  setAccountSettings: vi.fn(),
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

  // Failures are logged for diagnosis, and asserted where it matters
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

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

    mockStorageService.getWithdrawals.mockResolvedValue([
      {
        id: 'withdrawal-1',
        takenAt: '2023-01-01T18:25:00.000Z',
        amountCents: 71250,
        createdAt: '2023-01-01T18:30:00.000Z',
        updatedAt: '2023-01-01T18:30:00.000Z',
      },
    ]);

    mockStorageService.getAccountSettings.mockResolvedValue({ fundsReleaseDays: 5, withdrawalIntervalDays: 3 });
    localStorage.clear();

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

      expect(backupData).toHaveProperty('version', '3');
      expect(backupData).toHaveProperty('exportDate');
      expect(backupData).toHaveProperty('data');
      expect(backupData.data).not.toHaveProperty('timeEntries');
      expect(backupData.data).toHaveProperty('tasks');
      expect(backupData.data).toHaveProperty('noteTemplates');
      expect(backupData.data).toHaveProperty('taskNotes');
      expect(backupData.data).toHaveProperty('dailyGoal');
      expect(backupData.data).toHaveProperty('goalAchievements');
      expect(backupData.data.withdrawals).toEqual([
        expect.objectContaining({ id: 'withdrawal-1', amountCents: 71250 }),
      ]);
      expect(backupData.data.sessions).toEqual([mockSession]);
      expect(backupData.data.workLogs).toEqual({
        entries: [mockWorkLogEntry],
        mappings: [mockMapping],
      });
      expect(backupData.data.accountSettings).toEqual({ fundsReleaseDays: 5, withdrawalIntervalDays: 3 });
      // Only the settings this device saved
      expect(backupData.data.settings).toEqual({});
    });

    it("carries this device's saved settings, and the default payout settings when none were saved", async () => {
      mockStorageService.getAccountSettings.mockResolvedValue(null);
      localStorage.setItem('theme-mode', JSON.stringify({ version: 1, data: 'light' }));
      localStorage.setItem(
        'automaticBackupConfig',
        JSON.stringify({
          version: 1,
          data: { enabled: true, frequency: 'weekly', backupPath: '/b', maxBackups: 5, lastBackupTime: 'then' },
        })
      );
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      const backupData = await result.current.createBackupData();

      expect(backupData.data.accountSettings).toEqual({ fundsReleaseDays: 7, withdrawalIntervalDays: 3 });
      // When this device last backed up isn't a setting
      expect(backupData.data.settings).toEqual({
        theme: 'light',
        backups: { enabled: true, frequency: 'weekly', backupPath: '/b', maxBackups: 5 },
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
      expect(mockStorageService.getWithdrawals).toHaveBeenCalledTimes(1);
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
        contents: expect.stringContaining('"version": "3"'),
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
      const exportPromise = new Promise<string | null>(resolve => {
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
      expect(consoleError).toHaveBeenCalledWith('Export failed:', mockError);
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
      const exportPromise = new Promise<string | null>(resolve => {
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

      expect(parsedData.version).toBe('3');
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
          goalAchievements: [],
        },
      });

      files().openJson.mockResolvedValue(validJsonData);

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData();
      });

      expect(mockCallbacks.onImportSuccess).toHaveBeenCalledWith({
        mode: 'merge',
        importedCounts: {
          tasks: 0,
          noteTemplates: 0,
          taskNotes: 0,
          goalAchievements: 0,
          withdrawals: 0,
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
          tasks: [
            { id: 'task-2', name: 'Imported', createdAt: '2023-01-01T00:00:00Z', updatedAt: '2023-01-01T00:00:00Z' },
          ],
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
        await result.current.importData();
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

    it('round-trips: an exact restore of an export puts back exactly what was exported, in one change', async () => {
      localStorage.setItem('theme-mode', JSON.stringify({ version: 1, data: 'system' }));
      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      const exported = await result.current.createBackupData();
      // As the file would be read back
      const backup = parseBackupFile(JSON.stringify(exported));
      const fromFile = JSON.parse(JSON.stringify(exported.data));
      localStorage.setItem('theme-mode', JSON.stringify({ version: 1, data: 'dark' }));

      await act(async () => {
        await result.current.restoreBackup(backup, 'replace');
      });

      expect(fakeBackend().call).toHaveBeenCalledWith('restore_backup_data', {
        payload: {
          mode: 'replace',
          sessions: fromFile.sessions,
          workLogEntries: fromFile.workLogs.entries,
          workLogMappings: fromFile.workLogs.mappings,
          exportedAt: exported.exportDate,
          records: {
            predefinedTasks: fromFile.tasks,
            noteTemplates: fromFile.noteTemplates,
            taskNotes: fromFile.taskNotes,
            dailyGoal: fromFile.dailyGoal,
            dailyGoalAchievements: fromFile.goalAchievements,
            withdrawals: fromFile.withdrawals,
            accountSettings: fromFile.accountSettings,
          },
        },
      });
      // The records went with it; nothing is merged in afterwards
      expect(mockStorageService.setTasks).not.toHaveBeenCalled();
      expect(mockStorageService.setAccountSettings).not.toHaveBeenCalled();
      // The file's device settings take this device's place
      expect(JSON.parse(localStorage.getItem('theme-mode')!).data).toBe('system');
      expect(mockCallbacks.onImportSuccess).toHaveBeenCalledWith(expect.objectContaining({ mode: 'replace' }));
      expect(mockCallbacks.onImportError).not.toHaveBeenCalled();
    });

    it("refuses an exact restore of a file whose records don't read, before anything changes", async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.restoreBackup(
          parseBackupFile(JSON.stringify({ data: { tasks: [{ id: 1 }] } })),
          'replace'
        );
      });

      expect(fakeBackend().call).not.toHaveBeenCalledWith('restore_backup_data', expect.anything());
      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(
        "The backup's tasks can't be read, so nothing was restored"
      );
    });

    it('leaves work logs untouched when importing a v1 export without them', async () => {
      files().openJson.mockResolvedValue(
        JSON.stringify({
          version: '1.0',
          exportDate: '2023-01-02T00:00:00.000Z',
          data: { sessions: [mockSession] },
        })
      );

      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData();
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
        await result.current.importData();
      });

      expect(fakeBackend().call).not.toHaveBeenCalledWith('restore_backup_data', expect.anything());
      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(expect.stringContaining('not a TaskMint export'));
    });

    it('should handle invalid JSON data', async () => {
      // The picked file holds invalid JSON
      files().openJson.mockResolvedValue('invalid json');

      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData();
      });

      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    });
  });

  describe('dialogs and platform reasons', () => {
    it('says nothing when the open dialog is dismissed', async () => {
      files().openJson.mockResolvedValue(null);
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData();
      });

      expect(mockCallbacks.onImportSuccess).not.toHaveBeenCalled();
      expect(mockCallbacks.onImportError).not.toHaveBeenCalled();
      expect(result.current.isImporting).toBe(false);
    });

    it('explains a file the platform could not parse', async () => {
      files().openJson.mockRejectedValue('Invalid JSON file: expected value at line 1');
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData();
      });

      expect(mockCallbacks.onImportError).toHaveBeenCalledWith(
        'Invalid file format. Please select a valid TaskMint export file.'
      );
    });

    it("passes on the platform's reason for a file it could not read", async () => {
      files().openJson.mockRejectedValue('Failed to read import file: permission denied');
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        await result.current.importData();
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
      const { result } = renderHook(() =>
        useDataBackup({
          onExportSuccess: mockCallbacks.onExportSuccess,
          // onExportError not provided
        })
      );

      await act(async () => {
        await result.current.exportData();
      });

      expect(mockCallbacks.onExportSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('merge and replace', () => {
    const importFile = async (file: object) => {
      files().openJson.mockResolvedValue(JSON.stringify(file));
      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.importData();
      });
    };

    it('merges in only the items not stored yet: by id, and achievements by day', async () => {
      const [task] = await mockStorageService.getTasks();
      const [template] = await mockStorageService.getNoteTemplates();
      const [note] = await mockStorageService.getTaskNotes();
      const [achievement] = await mockStorageService.getGoalAchievements();
      const [withdrawal] = await mockStorageService.getWithdrawals();

      await importFile({
        data: {
          tasks: [
            { ...task, name: 'Renamed in the file' },
            { ...task, id: 'task-2' },
          ],
          noteTemplates: [template, { ...template, id: 'template-2' }],
          taskNotes: [note, { ...note, id: 'note-2' }],
          goalAchievements: [
            { ...achievement, id: 'other-id' },
            { ...achievement, date: '2023-01-02' },
          ],
          withdrawals: [
            { ...withdrawal, amountCents: 1 },
            { ...withdrawal, id: 'withdrawal-2' },
          ],
        },
      });

      // What's stored wins over the file's copy of the same item
      expect(mockStorageService.setTasks).toHaveBeenCalledWith([task, { ...task, id: 'task-2' }]);
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalledWith([template, { ...template, id: 'template-2' }]);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalledWith([note, { ...note, id: 'note-2' }]);
      expect(mockStorageService.setGoalAchievements).toHaveBeenCalledWith([
        achievement,
        { ...achievement, date: '2023-01-02' },
      ]);
      expect(mockStorageService.setWithdrawals).toHaveBeenCalledWith([
        withdrawal,
        { ...withdrawal, id: 'withdrawal-2' },
      ]);
      expect(mockStorageService.setDailyGoal).not.toHaveBeenCalled();
    });

    it("takes a merged file's goal", async () => {
      const goal = await mockStorageService.getDailyGoal();
      await importFile({ data: { dailyGoal: goal } });
      expect(mockStorageService.setDailyGoal).toHaveBeenCalledWith(goal);
    });

    it('leaves what a merged file lacks alone', async () => {
      await importFile({ data: {} });

      expect(mockStorageService.setTasks).not.toHaveBeenCalled();
      expect(mockStorageService.setNoteTemplates).not.toHaveBeenCalled();
      expect(mockStorageService.setTaskNotes).not.toHaveBeenCalled();
      expect(mockStorageService.setGoalAchievements).not.toHaveBeenCalled();
    });

    it('leaves what an exactly restored file lacks as it is (an older format), and counts none of it', async () => {
      localStorage.setItem('theme-mode', JSON.stringify({ version: 1, data: 'dark' }));
      const { result } = renderHook(() => useDataBackup(mockCallbacks));
      await act(async () => {
        await result.current.restoreBackup(parseBackupFile(JSON.stringify({ data: { dailyGoal: null } })), 'replace');
      });

      // A goal of null removes it; the rest isn't sent
      expect(fakeBackend().call).toHaveBeenCalledWith('restore_backup_data', {
        payload: {
          mode: 'replace',
          sessions: null,
          workLogEntries: null,
          workLogMappings: null,
          exportedAt: null,
          records: { dailyGoal: null },
        },
      });
      expect(JSON.parse(localStorage.getItem('theme-mode')!).data).toBe('dark');
      expect(mockCallbacks.onImportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          importedCounts: expect.objectContaining({ tasks: 0, noteTemplates: 0, taskNotes: 0, goalAchievements: 0 }),
        })
      );
    });

    it('takes the payout settings in a merge only where none are set', async () => {
      const settings = { fundsReleaseDays: 2, withdrawalIntervalDays: 1 };
      await importFile({ data: { accountSettings: settings } });
      expect(mockStorageService.setAccountSettings).not.toHaveBeenCalled();

      mockStorageService.getAccountSettings.mockResolvedValue(null);
      await importFile({ data: { accountSettings: settings } });
      expect(mockStorageService.setAccountSettings).toHaveBeenCalledWith(settings);
    });

    it("leaves this device's settings alone in a merge", async () => {
      localStorage.setItem('theme-mode', JSON.stringify({ version: 1, data: 'dark' }));
      await importFile({ data: { settings: { theme: 'light' } } });
      expect(JSON.parse(localStorage.getItem('theme-mode')!).data).toBe('dark');
    });

    it('lets a backup file be chosen to confirm first, then restored', async () => {
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      files().openJson.mockResolvedValueOnce(null);
      await act(async () => {
        await expect(result.current.chooseBackupFile()).resolves.toBeNull();
      });

      files().openJson.mockResolvedValueOnce('not json');
      await act(async () => {
        await expect(result.current.chooseBackupFile()).resolves.toBeNull();
      });
      expect(mockCallbacks.onImportError).toHaveBeenCalledWith('This file is not valid JSON');

      files().openJson.mockResolvedValueOnce(JSON.stringify({ exportDate: 'then', data: { tasks: [] } }));
      let chosen: unknown;
      await act(async () => {
        chosen = await result.current.chooseBackupFile();
      });
      expect(chosen).toEqual({ exportDate: 'then', data: { tasks: [] } });
      expect(result.current.isImporting).toBe(false);
      expect(fakeBackend().call).not.toHaveBeenCalledWith('restore_backup_data', expect.anything());
    });

    it('chooses and restores one file at a time', async () => {
      let pick!: (contents: string | null) => void;
      files().openJson.mockImplementation(() => new Promise(resolve => (pick = resolve)));
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        void result.current.chooseBackupFile();
      });
      await act(async () => {
        await expect(result.current.chooseBackupFile()).resolves.toBeNull();
        await result.current.restoreBackup(parseBackupFile('{"data":{}}'), 'merge');
      });
      expect(files().openJson).toHaveBeenCalledTimes(1);
      expect(fakeBackend().call).not.toHaveBeenCalledWith('restore_backup_data', expect.anything());

      await act(async () => pick(null));
      expect(result.current.isImporting).toBe(false);
    });

    it('imports one file at a time', async () => {
      let pick!: (contents: string | null) => void;
      files().openJson.mockImplementation(() => new Promise(resolve => (pick = resolve)));
      const { result } = renderHook(() => useDataBackup(mockCallbacks));

      await act(async () => {
        void result.current.importData();
      });
      expect(result.current.isImporting).toBe(true);
      await act(async () => {
        await result.current.importData();
      });
      expect(files().openJson).toHaveBeenCalledTimes(1);

      await act(async () => pick(null));
      expect(result.current.isImporting).toBe(false);
    });
  });
});
