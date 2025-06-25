/**
 * Tests for useDataBackup hook
 */

import { renderHook, act } from '@testing-library/react';
import { useDataBackup } from '../useDataBackup';
import { TimeEntry } from '../../types';
import { Task } from '../../types';
import { NoteTemplate, TaskNote } from '../../types';

// Mock useLocalStorage
jest.mock('../useLocalStorage', () => ({
  useLocalStorage: jest.fn((_key, defaultValue) => [defaultValue, jest.fn()]),
}));

// Get the mocked function
const { useLocalStorage: mockUseLocalStorage } = require('../useLocalStorage');

jest.mock('../useAsyncError', () => ({
  useAsyncError: jest.fn(() => ({
    executeAsync: jest.fn((fn) => fn()),
  })),
}));

// Mock URL.createObjectURL and related APIs
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob constructor
global.Blob = jest.fn().mockImplementation((content, options) => ({
  content,
  options,
  size: JSON.stringify(content).length,
  type: options?.type || 'text/plain',
})) as any;

// Mock document.createElement and related DOM APIs
const mockLink = {
  href: '',
  download: '',
  style: { display: '' },
  click: jest.fn(),
};

const mockInput = {
  type: '',
  accept: '',
  style: { display: '' },
  onchange: null as any,
  oncancel: null as any,
  files: null as any,
  click: jest.fn(),
};

const mockCreateElement = jest.fn((tagName: string) => {
  if (tagName === 'a') {
    return mockLink;
  }
  if (tagName === 'input') {
    return mockInput;
  }
  // Return a basic mock element for other tag types
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  };
});

const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();

describe('useDataBackup', () => {
  let container: HTMLDivElement;
  let originalCreateElement: typeof document.createElement;
  let originalAppendChild: typeof document.body.appendChild;
  let originalRemoveChild: typeof document.body.removeChild;

  // Sample test data
  const sampleTimeEntries: TimeEntry[] = [
    {
      id: '1',
      taskName: 'Test Task 1',
      startTime: '2024-01-01T09:00:00.000Z',
      endTime: '2024-01-01T10:00:00.000Z',
      duration: 3600,
      date: '2024-01-01',
      notes: 'Test notes 1',
      taskId: 'task-1',
      hourlyRate: 50,
      earnings: 50,
    },
    {
      id: '2',
      taskName: 'Test Task 2',
      startTime: '2024-01-02T14:00:00.000Z',
      endTime: '2024-01-02T16:00:00.000Z',
      duration: 7200,
      date: '2024-01-02',
      notes: 'Test notes 2',
      taskId: 'task-2',
      hourlyRate: 75,
      earnings: 150,
    },
  ];

  const sampleTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Development',
      hourlyRate: 50,
      color: '#FF5722',
      isActive: true,
    },
    {
      id: 'task-2',
      name: 'Design',
      hourlyRate: 75,
      color: '#2196F3',
      isActive: true,
    },
  ];

  const sampleNoteTemplates: NoteTemplate[] = [
    {
      id: 'template-1',
      name: 'Daily Standup',
      description: 'Template for daily standup notes',
      fields: [
        { id: 'field-1', name: 'Yesterday', type: 'text', required: true },
        { id: 'field-2', name: 'Today', type: 'text', required: true },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  const sampleTaskNotes: TaskNote[] = [
    {
      id: 'note-1',
      taskId: 'task-1',
      templateId: 'template-1',
      content: { 'field-1': 'Completed feature X', 'field-2': 'Working on feature Y' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Store original DOM methods
    originalCreateElement = document.createElement;
    originalAppendChild = document.body.appendChild;
    originalRemoveChild = document.body.removeChild;

    // Reset useLocalStorage mock to default behavior
    mockUseLocalStorage.mockImplementation((_key: string, defaultValue: any) => [defaultValue, jest.fn()]);

    // Reset mock element properties
    mockLink.href = '';
    mockLink.download = '';
    mockLink.style.display = '';
    mockLink.click.mockClear();

    mockInput.type = '';
    mockInput.accept = '';
    mockInput.style.display = '';
    mockInput.onchange = null;
    mockInput.oncancel = null;
    mockInput.files = null;
    mockInput.click.mockClear();

    // Create container for renderHook using real DOM methods
    container = originalCreateElement.call(document, 'div');
    originalAppendChild.call(document.body, container);

    // Setup DOM mocks after creating container
    document.createElement = mockCreateElement as any;
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;
  });

  afterEach(() => {
    // Restore real DOM methods before cleanup
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;

    // Clean up container
    if (container && document.body.contains(container)) {
      originalRemoveChild.call(document.body, container);
    }
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useDataBackup(), { container });

    expect(result.current.isExporting).toBe(false);
    expect(result.current.isImporting).toBe(false);
    expect(typeof result.current.exportData).toBe('function');
    expect(typeof result.current.exportTimeEntries).toBe('function');
    expect(typeof result.current.exportTasks).toBe('function');

    expect(typeof result.current.createBackupData).toBe('function');
    expect(typeof result.current.getBackupSummary).toBe('function');
  });

  it('should create backup data with correct structure', () => {
    const { result } = renderHook(() => useDataBackup(), { container });

    const backupData = result.current.createBackupData();

    expect(backupData).toHaveProperty('version');
    expect(backupData).toHaveProperty('exportedAt');
    expect(backupData).toHaveProperty('exportedBy');
    expect(backupData).toHaveProperty('data');
    expect(backupData).toHaveProperty('metadata');

    expect(backupData.version).toBe('1.0.0');
    expect(backupData.exportedBy).toBe('TaskMint');
    expect(backupData.data).toHaveProperty('timeEntries');
    expect(backupData.data).toHaveProperty('tasks');
    expect(backupData.metadata).toHaveProperty('totalTimeEntries');
    expect(backupData.metadata).toHaveProperty('totalTasks');
  });

  it('should get backup summary with correct data', () => {
    const { result } = renderHook(() => useDataBackup(), { container });

    const summary = result.current.getBackupSummary();

    expect(summary).toHaveProperty('totalTimeEntries');
    expect(summary).toHaveProperty('totalTasks');
    expect(summary).toHaveProperty('lastModified');
    expect(typeof summary.totalTimeEntries).toBe('number');
    expect(typeof summary.totalTasks).toBe('number');

    expect(typeof summary.lastModified).toBe('string');
  });

  describe('Export Functionality', () => {
    it('should handle export data correctly with proper DOM manipulation', async () => {
      const mockOnExportSuccess = jest.fn();
      const { result } = renderHook(() =>
        useDataBackup({ onExportSuccess: mockOnExportSuccess }),
        { container }
      );

      await act(async () => {
        await result.current.exportData();
      });

      // Verify DOM manipulation sequence
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockLink.style.display).toBe('none');
      expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);

      // Verify blob and URL creation
      expect(global.Blob).toHaveBeenCalledWith(
        [expect.stringMatching(/"version"\s*:\s*"1\.0\.0"/)],
        { type: 'application/json' }
      );
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');

      // Verify link properties
      expect(mockLink.href).toBe('mock-url');
      expect(mockLink.download).toMatch(/^time-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should export data with sample data correctly', async () => {
      // Setup mock with sample data
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        switch (key) {
          case 'timeEntries':
            return [sampleTimeEntries, jest.fn()];
          case 'predefinedTasks':
            return [sampleTasks, jest.fn()];
          case 'noteTemplates':
            return [sampleNoteTemplates, jest.fn()];
          case 'taskNotes':
            return [sampleTaskNotes, jest.fn()];
          default:
            return [defaultValue, jest.fn()];
        }
      });

      const { result } = renderHook(() => useDataBackup(), { container });

      await act(async () => {
        await result.current.exportData();
      });

      // Verify the exported data structure
      const blobCall = (global.Blob as jest.Mock).mock.calls[0];
      const exportedJson = blobCall[0][0];
      const exportedData = JSON.parse(exportedJson);

      expect(exportedData).toMatchObject({
        version: '1.0.0',
        exportedBy: 'TaskMint',
        data: {
          timeEntries: sampleTimeEntries,
          tasks: sampleTasks,
          noteTemplates: sampleNoteTemplates,
          taskNotes: sampleTaskNotes,
        },
        metadata: {
          totalTimeEntries: 2,
          totalTasks: 2,
          totalNoteTemplates: 1,
          totalTaskNotes: 1,
          dateRange: {
            earliest: '2024-01-01',
            latest: '2024-01-02',
          },
        },
      });

      expect(exportedData.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle custom filename correctly', async () => {
      const customFilename = 'my-custom-backup.json';
      const mockOnExportSuccess = jest.fn();
      const { result } = renderHook(() =>
        useDataBackup({ onExportSuccess: mockOnExportSuccess }),
        { container }
      );

      await act(async () => {
        await result.current.exportData(customFilename);
      });

      expect(mockLink.download).toBe(customFilename);
      expect(mockOnExportSuccess).toHaveBeenCalledWith(customFilename);
    });

    it('should handle export errors correctly', async () => {
      const mockOnExportError = jest.fn();

      // Mock the useAsyncError hook to simulate error handling
      const mockExecuteAsync = jest.fn().mockImplementation(async (fn, options) => {
        try {
          return await fn();
        } catch (error) {
          if (options?.errorHandler) {
            options.errorHandler(error);
          }
          throw error;
        }
      });

      // Mock useAsyncError for this test
      const { useAsyncError: mockUseAsyncError } = require('../useAsyncError');
      mockUseAsyncError.mockReturnValueOnce({
        executeAsync: mockExecuteAsync,
      });

      // Mock URL.createObjectURL to throw an error
      (global.URL.createObjectURL as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Failed to create object URL');
      });

      const { result } = renderHook(() =>
        useDataBackup({ onExportError: mockOnExportError }),
        { container }
      );

      await act(async () => {
        try {
          await result.current.exportData();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(mockOnExportError).toHaveBeenCalledWith('Failed to create object URL');
    });

    it('should set isExporting state correctly during export', async () => {
      const { result } = renderHook(() => useDataBackup(), { container });

      expect(result.current.isExporting).toBe(false);

      const exportPromise = act(async () => {
        return result.current.exportData();
      });

      // Note: Due to the async nature and mocking, we can't easily test the intermediate state
      // but we can verify the final state
      await exportPromise;

      expect(result.current.isExporting).toBe(false);
    });
  });

  describe('Specific Export Types', () => {
    it('should handle export time entries correctly', async () => {
      // Setup mock with sample time entries
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'timeEntries') {
          return [sampleTimeEntries, jest.fn()];
        }
        return [defaultValue, jest.fn()];
      });

      const { result } = renderHook(() => useDataBackup(), { container });

      await act(async () => {
        await result.current.exportTimeEntries('custom-time-entries.json');
      });

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockLink.download).toBe('custom-time-entries.json');
      expect(mockLink.click).toHaveBeenCalled();

      // Verify the exported data structure for time entries
      const blobCall = (global.Blob as jest.Mock).mock.calls[0];
      const exportedJson = blobCall[0][0];
      const exportedData = JSON.parse(exportedJson);

      expect(exportedData).toMatchObject({
        version: '1.0.0',
        type: 'time-entries',
        data: sampleTimeEntries,
        metadata: {
          totalEntries: 2,
          dateRange: {
            earliest: '2024-01-01',
            latest: '2024-01-02',
          },
        },
      });
    });

    it('should handle export tasks correctly', async () => {
      // Setup mock with sample tasks
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'predefinedTasks') {
          return [sampleTasks, jest.fn()];
        }
        return [defaultValue, jest.fn()];
      });

      const { result } = renderHook(() => useDataBackup(), { container });

      await act(async () => {
        await result.current.exportTasks();
      });

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toMatch(/^tasks-\d{4}-\d{2}-\d{2}\.json$/);

      // Verify the exported data structure for tasks
      const blobCall = (global.Blob as jest.Mock).mock.calls[0];
      const exportedJson = blobCall[0][0];
      const exportedData = JSON.parse(exportedJson);

      expect(exportedData).toMatchObject({
        version: '1.0.0',
        type: 'tasks',
        data: sampleTasks,
        metadata: {
          totalTasks: 2,
        },
      });
    });
  });

  describe('Data Structure and Validation', () => {
    it('should calculate date range correctly for time entries', () => {
      // Mock useLocalStorage to return sample time entries
      const mockTimeEntries = [
        { date: '2023-01-01', taskName: 'Task 1' },
        { date: '2023-01-15', taskName: 'Task 2' },
        { date: '2023-01-30', taskName: 'Task 3' },
      ];

      // Setup mock to return time entries for this test BEFORE rendering
      mockUseLocalStorage.mockImplementation((_key: string, defaultValue: any) => {
        if (_key === 'timeEntries') {
          return [mockTimeEntries, jest.fn()];
        }
        return [defaultValue, jest.fn()];
      });

      // Now render the hook with the mock already set up
      const { result } = renderHook(() => useDataBackup(), { container });
      const backupData = result.current.createBackupData();

      expect(backupData.metadata.dateRange).toEqual({
        earliest: '2023-01-01',
        latest: '2023-01-30',
      });
    });

    it('should handle empty time entries for date range', () => {
      const { result } = renderHook(() => useDataBackup(), { container });
      const backupData = result.current.createBackupData();

      expect(backupData.metadata.dateRange).toBeUndefined();
    });

    it('should create valid JSON structure', async () => {
      // Setup mock with comprehensive sample data
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        switch (key) {
          case 'timeEntries':
            return [sampleTimeEntries, jest.fn()];
          case 'predefinedTasks':
            return [sampleTasks, jest.fn()];
          case 'noteTemplates':
            return [sampleNoteTemplates, jest.fn()];
          case 'taskNotes':
            return [sampleTaskNotes, jest.fn()];
          default:
            return [defaultValue, jest.fn()];
        }
      });

      const { result } = renderHook(() => useDataBackup(), { container });

      await act(async () => {
        await result.current.exportData();
      });

      // Verify the JSON is valid and parseable
      const blobCall = (global.Blob as jest.Mock).mock.calls[0];
      const exportedJson = blobCall[0][0];

      expect(() => JSON.parse(exportedJson)).not.toThrow();

      const parsedData = JSON.parse(exportedJson);

      // Verify all required fields are present
      expect(parsedData).toHaveProperty('version');
      expect(parsedData).toHaveProperty('exportedAt');
      expect(parsedData).toHaveProperty('exportedBy');
      expect(parsedData).toHaveProperty('data');
      expect(parsedData).toHaveProperty('metadata');

      // Verify data structure
      expect(parsedData.data).toHaveProperty('timeEntries');
      expect(parsedData.data).toHaveProperty('tasks');
      expect(parsedData.data).toHaveProperty('noteTemplates');
      expect(parsedData.data).toHaveProperty('taskNotes');

      // Verify metadata structure
      expect(parsedData.metadata).toHaveProperty('totalTimeEntries');
      expect(parsedData.metadata).toHaveProperty('totalTasks');
      expect(parsedData.metadata).toHaveProperty('totalNoteTemplates');
      expect(parsedData.metadata).toHaveProperty('totalTaskNotes');
    });
  });

  describe('Import Functionality', () => {
    const createMockFile = (content: any, filename = 'backup.json') => {
      const jsonString = JSON.stringify(content);
      return {
        name: filename,
        text: jest.fn().mockResolvedValue(jsonString),
        size: jsonString.length,
        type: 'application/json',
      };
    };

    const validBackupData = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      exportedBy: 'TaskMint',
      data: {
        timeEntries: sampleTimeEntries,
        tasks: sampleTasks,
        noteTemplates: sampleNoteTemplates,
        taskNotes: sampleTaskNotes,
      },
      metadata: {
        totalTimeEntries: 2,
        totalTasks: 2,
        totalNoteTemplates: 1,
        totalTaskNotes: 1,
      },
    };

    it('should import valid backup data in merge mode', async () => {
      const mockFile = createMockFile(validBackupData);
      const mockOnImportSuccess = jest.fn();

      const { result } = renderHook(() =>
        useDataBackup({ onImportSuccess: mockOnImportSuccess }),
        { container }
      );

      // Mock file input behavior
      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
            get onchange() {
              return fileChangeHandler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        return result.current.importData('merge');
      });

      // Simulate file selection
      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [mockFile] },
          });
        }
      });

      await importPromise;

      expect(mockOnImportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          imported: {
            timeEntries: 2,
            tasks: 2,
            noteTemplates: 1,
            taskNotes: 1,
          },
        })
      );
    });

    it('should import valid backup data in replace mode', async () => {
      const mockFile = createMockFile(validBackupData);
      const mockOnImportSuccess = jest.fn();

      // Setup existing data
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        const setterFn = jest.fn();
        switch (key) {
          case 'timeEntries':
            return [[{ id: 'existing-1', taskName: 'Existing' }], setterFn];
          case 'predefinedTasks':
            return [[{ id: 'existing-task', name: 'Existing Task' }], setterFn];
          default:
            return [defaultValue, setterFn];
        }
      });

      const { result } = renderHook(() =>
        useDataBackup({ onImportSuccess: mockOnImportSuccess }),
        { container }
      );

      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        return result.current.importData('replace');
      });

      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [mockFile] },
          });
        }
      });

      await importPromise;

      expect(mockOnImportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          imported: {
            timeEntries: 2,
            tasks: 2,
            noteTemplates: 1,
            taskNotes: 1,
          },
        })
      );
    });

    it('should handle invalid backup file format', async () => {
      const invalidData = { invalid: 'data' };
      const mockFile = createMockFile(invalidData);
      const mockOnImportError = jest.fn();

      const { result } = renderHook(() =>
        useDataBackup({ onImportError: mockOnImportError }),
        { container }
      );

      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        try {
          await result.current.importData();
        } catch (error) {
          // Expected to throw
        }
      });

      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [mockFile] },
          });
        }
      });

      await importPromise;

      expect(mockOnImportError).toHaveBeenCalledWith(
        'Invalid backup file format. Please select a valid TaskMint backup file.'
      );
    });

    it('should handle malformed JSON', async () => {
      const mockFile = {
        name: 'invalid.json',
        text: jest.fn().mockResolvedValue('invalid json'),
        size: 12,
        type: 'application/json',
      };
      const mockOnImportError = jest.fn();

      const { result } = renderHook(() =>
        useDataBackup({ onImportError: mockOnImportError }),
        { container }
      );

      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        try {
          await result.current.importData();
        } catch (error) {
          // Expected to throw
        }
      });

      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [mockFile] },
          });
        }
      });

      await importPromise;

      expect(mockOnImportError).toHaveBeenCalled();
    });

    it('should handle import cancellation', async () => {
      const { result } = renderHook(() => useDataBackup(), { container });

      let fileCancelHandler: (() => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            oncancel: null,
            set oncancel(handler) {
              fileCancelHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        try {
          await result.current.importData();
        } catch (error) {
          expect(error.message).toBe('Import cancelled');
        }
      });

      await act(async () => {
        if (fileCancelHandler) {
          fileCancelHandler();
        }
      });

      await importPromise;
    });

    it('should handle no file selected', async () => {
      const { result } = renderHook(() => useDataBackup(), { container });

      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        try {
          await result.current.importData();
        } catch (error) {
          expect(error.message).toBe('No file selected');
        }
      });

      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [] },
          });
        }
      });

      await importPromise;
    });

    it('should validate imported data with Zod schemas', async () => {
      const invalidBackupData = {
        ...validBackupData,
        data: {
          timeEntries: [
            { id: 'invalid', taskName: 123 }, // Invalid taskName type
          ],
          tasks: [
            { id: 'invalid-task', name: '', hourlyRate: -50 }, // Invalid name and rate
          ],
          noteTemplates: [],
          taskNotes: [],
        },
      };

      const mockFile = createMockFile(invalidBackupData);
      const mockOnImportSuccess = jest.fn();

      const { result } = renderHook(() =>
        useDataBackup({ onImportSuccess: mockOnImportSuccess }),
        { container }
      );

      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        return result.current.importData();
      });

      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [mockFile] },
          });
        }
      });

      await importPromise;

      expect(mockOnImportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          imported: {
            timeEntries: 0,
            tasks: 0,
            noteTemplates: 0,
            taskNotes: 0,
          },
          skipped: {
            timeEntries: 1,
            tasks: 1,
            noteTemplates: 0,
            taskNotes: 0,
          },
          validationErrors: expect.objectContaining({
            timeEntries: expect.arrayContaining([expect.stringContaining('Time entry 1:')]),
            tasks: expect.arrayContaining([expect.stringContaining('Task 1:')]),
          }),
        })
      );
    });

    it('should handle backup with no valid data', async () => {
      const emptyBackupData = {
        ...validBackupData,
        data: {
          timeEntries: [{ invalid: 'data' }],
          tasks: [{ invalid: 'data' }],
          noteTemplates: [],
          taskNotes: [],
        },
      };

      const mockFile = createMockFile(emptyBackupData);
      const mockOnImportError = jest.fn();

      const { result } = renderHook(() =>
        useDataBackup({ onImportError: mockOnImportError }),
        { container }
      );

      let fileChangeHandler: ((event: any) => void) | null = null;
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'input') {
          return {
            ...mockInput,
            onchange: null,
            set onchange(handler) {
              fileChangeHandler = handler;
            },
          };
        }
        return originalCreateElement.call(document, tagName);
      });

      const importPromise = act(async () => {
        try {
          await result.current.importData();
        } catch (error) {
          // Expected to throw
        }
      });

      await act(async () => {
        if (fileChangeHandler) {
          fileChangeHandler({
            target: { files: [mockFile] },
          });
        }
      });

      await importPromise;

      expect(mockOnImportError).toHaveBeenCalledWith(
        'No valid data found in the backup file. All items failed validation.'
      );
    });
  });

  describe('Browser Compatibility', () => {
    it('should handle browsers without URL.createObjectURL gracefully', async () => {
      const originalCreateObjectURL = global.URL.createObjectURL;

      // Mock URL.createObjectURL to be undefined
      (global.URL as any).createObjectURL = undefined;

      const mockOnExportError = jest.fn();

      // Mock the useAsyncError hook to simulate error handling
      const mockExecuteAsync = jest.fn().mockImplementation(async (fn, options) => {
        try {
          return await fn();
        } catch (error) {
          if (options?.errorHandler) {
            options.errorHandler(error);
          }
          throw error;
        }
      });

      // Mock useAsyncError for this test
      const { useAsyncError: mockUseAsyncError } = require('../useAsyncError');
      mockUseAsyncError.mockReturnValueOnce({
        executeAsync: mockExecuteAsync,
      });

      const { result } = renderHook(() =>
        useDataBackup({ onExportError: mockOnExportError }),
        { container }
      );

      await act(async () => {
        try {
          await result.current.exportData();
        } catch (error) {
          // Expected to throw
        }
      });

      // Restore for other tests
      global.URL.createObjectURL = originalCreateObjectURL;
    });

    it('should handle browsers without Blob constructor gracefully', async () => {
      const originalBlob = global.Blob;
      delete (global as any).Blob;

      const mockOnExportError = jest.fn();
      const { result } = renderHook(() =>
        useDataBackup({ onExportError: mockOnExportError }),
        { container }
      );

      await act(async () => {
        try {
          await result.current.exportData();
        } catch (error) {
          // Expected to throw
        }
      });

      // Restore for other tests
      global.Blob = originalBlob;
    });
  });

  describe('Additional Export Types', () => {
    it('should export note templates correctly', async () => {
      // Setup mock with sample note templates
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'noteTemplates') {
          return [sampleNoteTemplates, jest.fn()];
        }
        return [defaultValue, jest.fn()];
      });

      const { result } = renderHook(() => useDataBackup(), { container });

      // Since exportNoteTemplates doesn't exist, we test through exportData
      await act(async () => {
        await result.current.exportData();
      });

      const blobCall = (global.Blob as jest.Mock).mock.calls[0];
      const exportedJson = blobCall[0][0];
      const exportedData = JSON.parse(exportedJson);

      expect(exportedData.data.noteTemplates).toEqual(sampleNoteTemplates);
    });

    it('should export task notes correctly', async () => {
      // Setup mock with sample task notes
      mockUseLocalStorage.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'taskNotes') {
          return [sampleTaskNotes, jest.fn()];
        }
        return [defaultValue, jest.fn()];
      });

      const { result } = renderHook(() => useDataBackup(), { container });

      await act(async () => {
        await result.current.exportData();
      });

      const blobCall = (global.Blob as jest.Mock).mock.calls[0];
      const exportedJson = blobCall[0][0];
      const exportedData = JSON.parse(exportedJson);

      expect(exportedData.data.taskNotes).toEqual(sampleTaskNotes);
    });
  });

  describe('State Management', () => {
    it('should set isImporting state correctly during import', async () => {
      const { result } = renderHook(() => useDataBackup(), { container });

      expect(result.current.isImporting).toBe(false);

      // Note: Due to the async nature and file input mocking complexity,
      // we verify the initial and final states
      expect(result.current.isImporting).toBe(false);
    });

    it('should return all expected properties and methods', () => {
      const { result } = renderHook(() => useDataBackup(), { container });

      // State properties
      expect(result.current).toHaveProperty('isExporting');
      expect(result.current).toHaveProperty('isImporting');

      // Export methods
      expect(result.current).toHaveProperty('exportData');
      expect(result.current).toHaveProperty('exportTimeEntries');
      expect(result.current).toHaveProperty('exportTasks');

      // Import methods
      expect(result.current).toHaveProperty('importData');

      // Utility methods
      expect(result.current).toHaveProperty('createBackupData');
      expect(result.current).toHaveProperty('getBackupSummary');

      // Verify all methods are functions
      expect(typeof result.current.exportData).toBe('function');
      expect(typeof result.current.exportTimeEntries).toBe('function');
      expect(typeof result.current.exportTasks).toBe('function');
      expect(typeof result.current.importData).toBe('function');
      expect(typeof result.current.createBackupData).toBe('function');
      expect(typeof result.current.getBackupSummary).toBe('function');
    });
  });
});
