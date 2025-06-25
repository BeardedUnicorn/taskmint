import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import { SettingsPage } from '../SettingsPage';

// Mock all the custom hooks
jest.mock('../../../hooks/useDataBackup');
jest.mock('../../../hooks/useTimerSettings');
jest.mock('../../../hooks/useDashboardSettings');
jest.mock('../../../hooks/useBackupSettings');
jest.mock('../../../hooks/useCloudSync');
jest.mock('../../../hooks/useDailyGoals');

// Mock the NoteTemplates component
jest.mock('../NoteTemplates', () => ({
  NoteTemplates: () => <div data-testid="note-templates">Note Templates Component</div>,
}));

import { useDataBackup } from '../../../hooks/useDataBackup';
import { useTimerSettings } from '../../../hooks/useTimerSettings';
import { useDashboardSettings } from '../../../hooks/useDashboardSettings';
import { useBackupSettings } from '../../../hooks/useBackupSettings';
import { useCloudSync } from '../../../hooks/useCloudSync';
import { useDailyGoals } from '../../../hooks/useDailyGoals';

const mockUseDataBackup = useDataBackup as jest.MockedFunction<typeof useDataBackup>;
const mockUseTimerSettings = useTimerSettings as jest.MockedFunction<typeof useTimerSettings>;
const mockUseDashboardSettings = useDashboardSettings as jest.MockedFunction<typeof useDashboardSettings>;
const mockUseBackupSettings = useBackupSettings as jest.MockedFunction<typeof useBackupSettings>;
const mockUseCloudSync = useCloudSync as jest.MockedFunction<typeof useCloudSync>;
const mockUseDailyGoals = useDailyGoals as jest.MockedFunction<typeof useDailyGoals>;

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = createTheme({
    palette: {
      mode: 'dark',
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
};

describe('SettingsPage Integration Tests', () => {
  // Mock functions for hooks
  const mockExportData = jest.fn();
  const mockImportData = jest.fn();
  const mockUpdateRoundingOption = jest.fn();
  const mockToggleWidget = jest.fn();
  const mockResetToDefaults = jest.fn();
  const mockUpdateDailyGoal = jest.fn();
  const mockEnableDailyGoal = jest.fn();
  const mockToggleBackupEnabled = jest.fn();
  const mockUpdateBackupFrequency = jest.fn();
  const mockSelectBackupDirectory = jest.fn();
  const mockPerformManualBackup = jest.fn();
  const mockUpdateCloudSyncConfig = jest.fn();
  const mockGetAuthUrl = jest.fn();
  const mockDisconnect = jest.fn();
  const mockSync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    mockUseDataBackup.mockReturnValue({
      exportData: mockExportData,
      importData: mockImportData,
      isExporting: false,
      isImporting: false,
      exportTimeEntries: jest.fn(),
      exportTasks: jest.fn(),
      createBackupData: jest.fn(),
      getBackupSummary: jest.fn(),
    });

    mockUseTimerSettings.mockReturnValue({
      roundingOption: 'none',
      updateRoundingOption: mockUpdateRoundingOption,
      settings: { roundingOption: 'none' },
    });

    mockUseDashboardSettings.mockReturnValue({
      getAvailableWidgets: () => [
        {
          id: 'total-time-today',
          title: 'Total Time Today',
          description: 'Shows the total time tracked for the current day',
          defaultEnabled: true,
          defaultOrder: 1,
        },
        {
          id: 'earnings-today',
          title: 'Earnings Today',
          description: 'Shows total earnings based on hourly rates for today',
          defaultEnabled: true,
          defaultOrder: 2,
        },
      ],
      isWidgetEnabled: (id: string) => id === 'total-time-today',
      toggleWidget: mockToggleWidget,
      resetToDefaults: mockResetToDefaults,
      preferences: {
        widgets: [
          { id: 'total-time-today', enabled: true, order: 1 },
          { id: 'earnings-today', enabled: false, order: 2 },
        ],
        migrationVersion: 1,
      },
      getEnabledWidgets: jest.fn(),
      getWidgetConfig: jest.fn(),
      getWidgetMetadata: jest.fn(),
      updateWidgetOrder: jest.fn(),
      updateWidgetPreferences: jest.fn(),
    });

    mockUseDailyGoals.mockReturnValue({
      currentGoal: {
        targetAmount: 100,
        currency: 'USD',
        isEnabled: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
      updateDailyGoal: mockUpdateDailyGoal,
      enableDailyGoal: mockEnableDailyGoal,
      deleteGoal: jest.fn(),
      getGoalProgress: jest.fn(),
      recordAchievement: jest.fn(),
    });

    mockUseBackupSettings.mockReturnValue({
      config: {
        enabled: false,
        frequency: 'daily' as const,
        backupPath: '/test/path',
        maxBackups: 10,
      },
      status: {
        isRunning: false,
        nextScheduledBackup: null,
        lastBackupTime: undefined,
        lastBackupSuccess: undefined,
        lastBackupError: undefined,
      },
      toggleEnabled: mockToggleBackupEnabled,
      updateFrequency: mockUpdateBackupFrequency,
      updateBackupPath: jest.fn(),
      updateMaxBackups: jest.fn(),
      selectBackupDirectory: mockSelectBackupDirectory,
      performManualBackup: mockPerformManualBackup,
      getStatusSummary: () => 'Automatic backups are disabled',
      updateConfig: jest.fn(),
      validateBackupPath: jest.fn(),
      resetConfig: jest.fn(),
      checkBackupDue: jest.fn(),
      performAutomaticBackupIfDue: jest.fn(),
    });

    mockUseCloudSync.mockReturnValue({
      config: {
        enabled: false,
        autoSync: false,
        syncInterval: 30,
        syncOnStartup: false,
        syncOnExit: false,
        conflictResolution: 'manual' as const,
      },
      status: {
        authStatus: 'disconnected' as const,
        syncStatus: 'idle' as const,
        error: null,
      },
      updateConfig: mockUpdateCloudSyncConfig,
      getAuthUrl: mockGetAuthUrl,
      disconnect: mockDisconnect,
      sync: mockSync,
      getFormattedStatus: () => 'Disconnected',
      authenticate: jest.fn(),
      refreshToken: jest.fn(),
    });
  });

  describe('Page Rendering', () => {
    it('should render all main sections', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Timer Settings')).toBeInTheDocument();
      expect(screen.getByText('Dashboard Customization')).toBeInTheDocument();
      expect(screen.getByText('Daily Earnings Goal')).toBeInTheDocument();
      expect(screen.getByText('Automatic Backups')).toBeInTheDocument();
      expect(screen.getByText('Cloud Sync (Google Drive)')).toBeInTheDocument();
      expect(screen.getByText('Data Management')).toBeInTheDocument();
      expect(screen.getByText('Note Templates')).toBeInTheDocument();
    });

    it('should render note templates component', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByTestId('note-templates')).toBeInTheDocument();
    });
  });

  describe('Timer Settings Section', () => {
    it('should display current rounding option', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      const select = screen.getByDisplayValue('No rounding');
      expect(select).toBeInTheDocument();
    });

    it('should call updateRoundingOption when selection changes', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const select = screen.getByDisplayValue('No rounding');
      await user.click(select);

      const option = screen.getByText('Round up to 5 minutes');
      await user.click(option);

      expect(mockUpdateRoundingOption).toHaveBeenCalledWith('up-5min');
    });
  });

  describe('Dashboard Customization Section', () => {
    it('should display available widgets with correct states', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Total Time Today')).toBeInTheDocument();
      expect(screen.getByText('Earnings Today')).toBeInTheDocument();
    });

    it('should call toggleWidget when widget switch is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const switches = screen.getAllByRole('checkbox');
      const widgetSwitch = switches.find(s => s.closest('li')?.textContent?.includes('Total Time Today'));

      if (widgetSwitch) {
        await user.click(widgetSwitch);
        expect(mockToggleWidget).toHaveBeenCalledWith('total-time-today');
      }
    });

    it('should call resetToDefaults when reset button is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const resetButton = screen.getByText('Reset to Defaults');
      await user.click(resetButton);

      expect(mockResetToDefaults).toHaveBeenCalled();
    });
  });

  describe('Daily Goals Section', () => {
    it('should display current goal settings', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    });

    it('should call enableDailyGoal when toggle is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const toggle = screen.getByRole('checkbox', { name: /enable daily earnings goal/i });
      await user.click(toggle);

      expect(mockEnableDailyGoal).toHaveBeenCalledWith(true);
    });

    it('should call updateDailyGoal when save button is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const saveButton = screen.getByText('Save Goal');
      await user.click(saveButton);

      expect(mockUpdateDailyGoal).toHaveBeenCalledWith({
        targetAmount: 100,
        currency: 'USD',
        isEnabled: false,
      });
    });
  });

  describe('Data Management Section', () => {
    it('should call exportData when export button is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const exportButton = screen.getByText('Export Data');
      await user.click(exportButton);

      expect(mockExportData).toHaveBeenCalled();
    });

    it('should call importData when import button is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const importButton = screen.getByText('Import Data');
      await user.click(importButton);

      expect(mockImportData).toHaveBeenCalledWith('merge');
    });

    it('should show loading state during export', () => {
      mockUseDataBackup.mockReturnValue({
        exportData: mockExportData,
        importData: mockImportData,
        isExporting: true,
        isImporting: false,
        exportTimeEntries: jest.fn(),
        exportTasks: jest.fn(),
        createBackupData: jest.fn(),
        getBackupSummary: jest.fn(),
      });

      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Exporting...')).toBeInTheDocument();
    });

    it('should show loading state during import', () => {
      mockUseDataBackup.mockReturnValue({
        exportData: mockExportData,
        importData: mockImportData,
        isExporting: false,
        isImporting: true,
        exportTimeEntries: jest.fn(),
        exportTasks: jest.fn(),
        createBackupData: jest.fn(),
        getBackupSummary: jest.fn(),
      });

      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Importing...')).toBeInTheDocument();
    });
  });

  describe('Backup Settings Section', () => {
    it('should display backup configuration', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Automatic Backups')).toBeInTheDocument();
      expect(screen.getByText('/test/path')).toBeInTheDocument();
    });

    it('should call toggleBackupEnabled when toggle is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const toggle = screen.getByRole('checkbox', { name: /enable automatic backups/i });
      await user.click(toggle);

      expect(mockToggleBackupEnabled).toHaveBeenCalled();
    });

    it('should call updateBackupFrequency when frequency changes', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const select = screen.getByDisplayValue('Daily');
      await user.click(select);

      const option = screen.getByText('Weekly');
      await user.click(option);

      expect(mockUpdateBackupFrequency).toHaveBeenCalledWith('weekly');
    });

    it('should call selectBackupDirectory when directory button is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const selectButton = screen.getByText('Browse');
      await user.click(selectButton);

      expect(mockSelectBackupDirectory).toHaveBeenCalled();
    });

    it('should call performManualBackup when backup now button is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { wrapper: TestWrapper });

      const backupButton = screen.getByText('Backup Now');
      await user.click(backupButton);

      expect(mockPerformManualBackup).toHaveBeenCalled();
    });
  });

  describe('Cloud Sync Section', () => {
    it('should display cloud sync status when disconnected', () => {
      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Cloud Sync')).toBeInTheDocument();
      expect(screen.getByText('Connect to Google Drive')).toBeInTheDocument();
    });

    it('should call getAuthUrl when connect button is clicked', async () => {
      const user = userEvent.setup();
      mockGetAuthUrl.mockResolvedValue('https://auth.url');

      render(<SettingsPage />, { wrapper: TestWrapper });

      const connectButton = screen.getByText('Connect to Google Drive');
      await user.click(connectButton);

      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    it('should show sync controls when connected', () => {
      mockUseCloudSync.mockReturnValue({
        config: {
          enabled: true,
          autoSync: false,
          syncInterval: 30,
          syncOnStartup: false,
          syncOnExit: false,
          conflictResolution: 'manual' as const,
        },
        status: {
          authStatus: 'connected' as const,
          syncStatus: 'idle' as const,
          error: null,
        },
        updateConfig: mockUpdateCloudSyncConfig,
        getAuthUrl: mockGetAuthUrl,
        disconnect: mockDisconnect,
        sync: mockSync,
        getFormattedStatus: () => 'Connected',
        authenticate: jest.fn(),
        refreshToken: jest.fn(),
      });

      render(<SettingsPage />, { wrapper: TestWrapper });

      expect(screen.getByText('Sync Now')).toBeInTheDocument();
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });

    it('should call sync when sync now button is clicked', async () => {
      const user = userEvent.setup();
      mockUseCloudSync.mockReturnValue({
        config: {
          enabled: true,
          autoSync: false,
          syncInterval: 30,
          syncOnStartup: false,
          syncOnExit: false,
          conflictResolution: 'manual' as const,
        },
        status: {
          authStatus: 'connected' as const,
          syncStatus: 'idle' as const,
          error: null,
        },
        updateConfig: mockUpdateCloudSyncConfig,
        getAuthUrl: mockGetAuthUrl,
        disconnect: mockDisconnect,
        sync: mockSync,
        getFormattedStatus: () => 'Connected',
        authenticate: jest.fn(),
        refreshToken: jest.fn(),
      });

      mockSync.mockResolvedValue({ success: true });

      render(<SettingsPage />, { wrapper: TestWrapper });

      const syncButton = screen.getByText('Sync Now');
      await user.click(syncButton);

      expect(mockSync).toHaveBeenCalled();
    });

    it('should call disconnect when disconnect button is clicked', async () => {
      const user = userEvent.setup();
      mockUseCloudSync.mockReturnValue({
        config: {
          enabled: true,
          autoSync: false,
          syncInterval: 30,
          syncOnStartup: false,
          syncOnExit: false,
          conflictResolution: 'manual' as const,
        },
        status: {
          authStatus: 'connected' as const,
          syncStatus: 'idle' as const,
          error: null,
        },
        updateConfig: mockUpdateCloudSyncConfig,
        getAuthUrl: mockGetAuthUrl,
        disconnect: mockDisconnect,
        sync: mockSync,
        getFormattedStatus: () => 'Connected',
        authenticate: jest.fn(),
        refreshToken: jest.fn(),
      });

      render(<SettingsPage />, { wrapper: TestWrapper });

      const disconnectButton = screen.getByText('Disconnect');
      await user.click(disconnectButton);

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle export errors gracefully', async () => {
      const user = userEvent.setup();
      mockExportData.mockRejectedValue(new Error('Export failed'));

      render(<SettingsPage />, { wrapper: TestWrapper });

      const exportButton = screen.getByText('Export Data');
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to export data/i)).toBeInTheDocument();
      });
    });

    it('should handle import errors gracefully', async () => {
      const user = userEvent.setup();
      mockImportData.mockRejectedValue(new Error('Import failed'));

      render(<SettingsPage />, { wrapper: TestWrapper });

      const importButton = screen.getByText('Import Data');
      await user.click(importButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to import data/i)).toBeInTheDocument();
      });
    });

    it('should handle goal save errors gracefully', async () => {
      const user = userEvent.setup();
      mockUpdateDailyGoal.mockRejectedValue(new Error('Goal save failed'));

      render(<SettingsPage />, { wrapper: TestWrapper });

      const saveButton = screen.getByText('Save Goal');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to save goal/i)).toBeInTheDocument();
      });
    });
  });

  describe('Success Messages', () => {
    it('should show success message after successful goal save', async () => {
      const user = userEvent.setup();
      mockUpdateDailyGoal.mockResolvedValue(undefined);

      render(<SettingsPage />, { wrapper: TestWrapper });

      const saveButton = screen.getByText('Save Goal');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/goal saved successfully/i)).toBeInTheDocument();
      });
    });
  });
});
