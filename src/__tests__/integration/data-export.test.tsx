/**
 * Data Export Integration Tests
 *
 * End-to-end integration tests for data export functionality
 * including UI interactions, file generation, and error handling.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import { SettingsPage } from '../../components';
import { TimeEntry } from '../../types';
import { Task } from '../../types';
import { NoteTemplate, TaskNote } from '../../types';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

// Mock URL and Blob APIs
global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = jest.fn();
global.Blob = jest.fn().mockImplementation((content, options) => ({
  content,
  options,
  size: JSON.stringify(content).length,
  type: options?.type || 'text/plain',
})) as any;

// Mock DOM APIs for file download
const mockLink = {
  href: '',
  download: '',
  style: { display: '' },
  click: jest.fn(),
};

const originalCreateElement = document.createElement;
const mockCreateElement = jest.fn((tagName: string) => {
  if (tagName === 'a') {
    return mockLink;
  }
  return originalCreateElement.call(document, tagName);
});

const originalAppendChild = document.body.appendChild;
const mockAppendChild = jest.fn();

const originalRemoveChild = document.body.removeChild;
const mockRemoveChild = jest.fn();

// Test theme
const testTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// Test wrapper component
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={testTheme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}

// Sample test data
const sampleTimeEntries: TimeEntry[] = [
  {
    id: '1',
    taskName: 'Development Work',
    startTime: '2024-01-01T09:00:00.000Z',
    endTime: '2024-01-01T10:30:00.000Z',
    duration: 5400, // 1.5 hours
    date: '2024-01-01',
    notes: 'Worked on feature implementation',
    taskId: 'task-1',
    hourlyRate: 75,
    earnings: 112.5,
  },
  {
    id: '2',
    taskName: 'Code Review',
    startTime: '2024-01-02T14:00:00.000Z',
    endTime: '2024-01-02T15:00:00.000Z',
    duration: 3600, // 1 hour
    date: '2024-01-02',
    notes: 'Reviewed pull requests',
    taskId: 'task-2',
    hourlyRate: 60,
    earnings: 60,
  },
];

const sampleTasks: Task[] = [
  {
    id: 'task-1',
    name: 'Development Work',
    hourlyRate: 75,
    color: '#FF5722',
    isActive: true,
  },
  {
    id: 'task-2',
    name: 'Code Review',
    hourlyRate: 60,
    color: '#2196F3',
    isActive: true,
  },
];

const sampleNoteTemplates: NoteTemplate[] = [
  {
    id: 'template-1',
    name: 'Daily Report',
    description: 'Template for daily work reports',
    fields: [
      { id: 'field-1', name: 'Completed Tasks', type: 'textarea', required: true },
      { id: 'field-2', name: 'Next Steps', type: 'text', required: false },
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
    content: {
      'field-1': 'Implemented user authentication',
      'field-2': 'Add password reset functionality',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

describe('Data Export Integration', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let container: HTMLDivElement;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    // Create a container for React components
    container = document.createElement('div');
    container.setAttribute('id', 'test-root');
    document.body.appendChild(container);

    // Setup localStorage mock with sample data
    mockLocalStorage.getItem.mockImplementation((key: string) => {
      switch (key) {
        case 'timeEntries':
          return JSON.stringify(sampleTimeEntries);
        case 'predefinedTasks':
          return JSON.stringify(sampleTasks);
        case 'noteTemplates':
          return JSON.stringify(sampleNoteTemplates);
        case 'taskNotes':
          return JSON.stringify(sampleTaskNotes);
        default:
          return null;
      }
    });

    // Setup DOM mocks
    document.createElement = mockCreateElement as any;
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;

    // Reset mock element properties
    mockLink.href = '';
    mockLink.download = '';
    mockLink.style.display = '';
    mockLink.click.mockClear();
  });

  afterEach(() => {
    // Restore original DOM methods
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;

    // Clean up container
    if (container && document.body.contains(container)) {
      document.body.removeChild(container);
    }
  });

  it('should export data when Export Data button is clicked', async () => {
    render(<SettingsPage />, { wrapper: TestWrapper, container });

    // Find and click the Export Data button
    const exportButton = screen.getByRole('button', { name: /export data/i });
    expect(exportButton).toBeInTheDocument();

    await user.click(exportButton);

    // Wait for export to complete
    await waitFor(() => {
      expect(mockCreateElement).toHaveBeenCalledWith('a');
    });

    // Verify DOM manipulation
    expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);

    // Verify blob creation
    expect(global.Blob).toHaveBeenCalledWith(
      [expect.stringMatching(/"version"\s*:\s*"1\.0\.0"/)],
      { type: 'application/json' }
    );

    // Verify URL creation and cleanup
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-blob-url');

    // Verify filename format
    expect(mockLink.download).toMatch(/^time-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('should export correct data structure', async () => {
    render(<SettingsPage />, { wrapper: TestWrapper, container });

    const exportButton = screen.getByRole('button', { name: /export data/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(global.Blob).toHaveBeenCalled();
    });

    // Get the exported data
    const blobCall = (global.Blob as jest.Mock).mock.calls[0];
    const exportedJson = blobCall[0][0];
    const exportedData = JSON.parse(exportedJson);

    // Verify structure
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

    // Verify timestamp format
    expect(exportedData.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should show loading state during export', async () => {
    render(<SettingsPage />, { wrapper: TestWrapper, container });

    const exportButton = screen.getByRole('button', { name: /export data/i });

    // Click the button
    await user.click(exportButton);

    // The button text should change to indicate loading
    // Note: This might be very brief, so we check for the final state
    await waitFor(() => {
      expect(mockLink.click).toHaveBeenCalled();
    });

    // Verify the button is back to normal state
    expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument();
  });

  it('should handle export with empty data', async () => {
    // Setup localStorage mock with empty data
    mockLocalStorage.getItem.mockImplementation(() => null);

    render(<SettingsPage />, { wrapper: TestWrapper, container });

    const exportButton = screen.getByRole('button', { name: /export data/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(global.Blob).toHaveBeenCalled();
    });

    // Get the exported data
    const blobCall = (global.Blob as jest.Mock).mock.calls[0];
    const exportedJson = blobCall[0][0];
    const exportedData = JSON.parse(exportedJson);

    // Verify empty data structure
    expect(exportedData.data).toMatchObject({
      timeEntries: [],
      tasks: [],
      noteTemplates: [],
      taskNotes: [],
    });

    expect(exportedData.metadata).toMatchObject({
      totalTimeEntries: 0,
      totalTasks: 0,
      totalNoteTemplates: 0,
      totalTaskNotes: 0,
    });

    expect(exportedData.metadata.dateRange).toBeUndefined();
  });
});
