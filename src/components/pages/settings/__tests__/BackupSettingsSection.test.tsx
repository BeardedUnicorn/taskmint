import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { BackupSettingsSection } from '../BackupSettingsSection';
import { useBackupSettings } from '../../../../hooks/useBackupSettings';

// Mock the useBackupSettings hook
jest.mock('../../../../hooks/useBackupSettings');
const mockUseBackupSettings = useBackupSettings as jest.MockedFunction<typeof useBackupSettings>;

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = createTheme({
    palette: {
      mode: 'dark',
    },
  });
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

describe('BackupSettingsSection', () => {
  const mockToggleEnabled = jest.fn();
  const mockUpdateFrequency = jest.fn();
  const mockUpdateBackupPath = jest.fn();
  const mockUpdateMaxBackups = jest.fn();
  const mockSelectBackupDirectory = jest.fn();
  const mockPerformManualBackup = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockOnError = jest.fn();

  const setupMocks = (configOverrides = {}, statusOverrides = {}) => {
    mockUseBackupSettings.mockReturnValue({
      config: {
        enabled: false,
        frequency: 'daily',
        backupPath: '/test/path',
        maxBackups: 10,
        ...configOverrides,
      },
      status: {
        isRunning: false,
        nextScheduledBackup: null,
        lastBackupTime: undefined,
        lastBackupSuccess: undefined,
        lastBackupError: undefined,
        ...statusOverrides,
      },
      toggleEnabled: mockToggleEnabled,
      updateFrequency: mockUpdateFrequency,
      updateBackupPath: mockUpdateBackupPath,
      updateMaxBackups: mockUpdateMaxBackups,
      selectBackupDirectory: mockSelectBackupDirectory,
      performManualBackup: mockPerformManualBackup,
      getStatusSummary: () => 'Automatic backups are disabled',
      // ... other functions
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should show configuration when enabled', () => {
    setupMocks({ enabled: true, frequency: 'weekly', maxBackups: 15, backupPath: '/enabled/path' });
    render(<BackupSettingsSection onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    expect(screen.getByText('Backup Directory')).toBeInTheDocument();
    expect(screen.getByDisplayValue('/enabled/path')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Backup Frequency' })).toHaveTextContent('Weekly');
    expect(screen.getByLabelText('Maximum Backups to Keep')).toHaveValue(15);
    expect(screen.getByRole('button', { name: 'Backup Now' })).toBeInTheDocument();
  });

  it('should call toggleEnabled when toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<BackupSettingsSection onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });
    const toggle = screen.getByRole('checkbox', { name: /enable automatic backups/i });
    await user.click(toggle);
    expect(mockToggleEnabled).toHaveBeenCalled();
  });

  it('should call selectBackupDirectory when browse button is clicked', async () => {
    const user = userEvent.setup();
    setupMocks({ enabled: true });
    mockSelectBackupDirectory.mockResolvedValue('/new/path');
    render(<BackupSettingsSection onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    const browseButton = screen.getByRole('button', { name: 'Browse' });
    await user.click(browseButton);

    await waitFor(() => {
      expect(mockSelectBackupDirectory).toHaveBeenCalled();
      expect(mockUpdateBackupPath).toHaveBeenCalledWith('/new/path');
    });
  });

  it('should call updateBackupFrequency when frequency changes', async () => {
    const user = userEvent.setup();
    setupMocks({ enabled: true });
    render(<BackupSettingsSection onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    const frequencySelect = screen.getByRole('combobox', { name: 'Backup Frequency' });
    await user.click(frequencySelect);

    const weeklyOption = await screen.findByRole('option', { name: 'Weekly' });
    await user.click(weeklyOption);

    expect(mockUpdateFrequency).toHaveBeenCalledWith('weekly');
  });

  it('should call updateMaxBackups when max backups changes', async () => {
    const user = userEvent.setup();
    setupMocks({ enabled: true });
    render(<BackupSettingsSection onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    const maxBackupsInput = screen.getByLabelText('Maximum Backups to Keep');
    await user.clear(maxBackupsInput);
    await user.type(maxBackupsInput, '20');

    expect(mockUpdateMaxBackups).toHaveBeenCalledWith(20);
  });

  it('should call performManualBackup when backup now button is clicked', async () => {
    const user = userEvent.setup();
    setupMocks({ enabled: true });
    mockPerformManualBackup.mockResolvedValue({ success: true, timestamp: '' });
    render(<BackupSettingsSection onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    const backupButton = screen.getByRole('button', { name: 'Backup Now' });
    await user.click(backupButton);

    await waitFor(() => {
      expect(mockPerformManualBackup).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});
