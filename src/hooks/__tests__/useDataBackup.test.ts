/**
 * Tests for useDataBackup hook
 */

import { renderHook, act } from '@testing-library/react';
import { useDataBackup } from '../useDataBackup';

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

// Mock document.createElement and related DOM APIs
const mockLink = {
  href: '',
  download: '',
  style: { display: '' },
  click: jest.fn(),
};

const mockCreateElement = jest.fn((tagName: string) => {
  if (tagName === 'a') {
    return mockLink;
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

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset useLocalStorage mock to default behavior
    mockUseLocalStorage.mockImplementation((_key: string, defaultValue: any) => [defaultValue, jest.fn()]);

    // Reset mock link properties
    mockLink.href = '';
    mockLink.download = '';
    mockLink.style.display = '';

    // Create container for renderHook using real DOM methods
    container = document.createElement('div');
    document.body.appendChild(container);

    // Setup DOM mocks after creating container
    document.createElement = mockCreateElement as any;
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;
  });

  afterEach(() => {
    // Restore real DOM methods before cleanup
    jest.restoreAllMocks();

    // Clean up container
    if (container && document.body.contains(container)) {
      document.body.removeChild(container);
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
    expect(backupData.exportedBy).toBe('Time Tracker App');
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

  it('should handle export data correctly', async () => {
    const mockOnExportSuccess = jest.fn();
    const { result } = renderHook(() =>
      useDataBackup({ onExportSuccess: mockOnExportSuccess }),
      { container }
    );

    await act(async () => {
      await result.current.exportData();
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('should handle export time entries correctly', async () => {
    const { result } = renderHook(() => useDataBackup(), { container });

    await act(async () => {
      await result.current.exportTimeEntries('custom-filename.json');
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(mockLink.download).toBe('custom-filename.json');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('should handle export tasks correctly', async () => {
    const { result } = renderHook(() => useDataBackup(), { container });

    await act(async () => {
      await result.current.exportTasks();
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(mockLink.click).toHaveBeenCalled();
  });



  it('should call onExportSuccess callback when provided', async () => {
    const mockOnExportSuccess = jest.fn();
    const { result } = renderHook(() =>
      useDataBackup({ onExportSuccess: mockOnExportSuccess }),
      { container }
    );

    await act(async () => {
      await result.current.exportData('test-file.json');
    });

    expect(mockOnExportSuccess).toHaveBeenCalledWith('test-file.json');
  });

  it('should use default filename when none provided', async () => {
    const { result } = renderHook(() => useDataBackup(), { container });

    await act(async () => {
      await result.current.exportData();
    });

    expect(mockLink.download).toMatch(/^time-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

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
});
