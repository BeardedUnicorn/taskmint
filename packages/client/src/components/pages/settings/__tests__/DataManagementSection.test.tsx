import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { DataManagementSection, RESET_CONFIRMATION_WORD } from '../DataManagementSection';
import { useDataBackup } from '../../../../hooks/useDataBackup';
import { useResetAppData } from '../../../../hooks/useResetAppData';
import { reloadApp } from '../../../../utils/appReload';

// Mock the data hooks — this suite covers the section's wiring and the
// typed-confirmation dialog, not the hook internals.
vi.mock('../../../../hooks/useDataBackup');
vi.mock('../../../../hooks/useResetAppData');
const mockShowError = vi.fn();
const mockNotify = vi.fn();
vi.mock('../../../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify, showError: mockShowError }),
}));
vi.mock('../../../../utils/appReload', () => ({ reloadApp: vi.fn() }));

const mockUseDataBackup = vi.mocked(useDataBackup);
const mockUseResetAppData = vi.mocked(useResetAppData);

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={createTheme()}>{children}</ThemeProvider>
);

describe('DataManagementSection', () => {
  const mockResetAllData = vi.fn();

  const exportData = vi.fn();
  const importData = vi.fn();
  const chooseBackupFile = vi.fn();
  const restoreBackup = vi.fn();
  const setupHookMocks = ({ isResetting = false, busy = false } = {}) => {
    mockUseDataBackup.mockReturnValue({
      exportData,
      importData,
      chooseBackupFile,
      restoreBackup,
      isExporting: busy,
      isImporting: busy,
    } as any);
    mockUseResetAppData.mockReturnValue({
      resetAllData: mockResetAllData,
      isResetting,
    } as any);
  };

  const renderSection = () => render(<DataManagementSection />, { wrapper: TestWrapper });

  const openResetDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /reset all data/i }));
    return screen.getByRole('dialog');
  };

  beforeEach(() => {
    mockResetAllData.mockResolvedValue(undefined);
    setupHookMocks();
  });

  it('renders export, import, and reset controls', () => {
    renderSection();

    expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import data/i })).toBeInTheDocument();
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset all data/i })).toBeInTheDocument();
  });

  it('opens the confirmation dialog with the delete action disabled', async () => {
    const user = userEvent.setup();
    renderSection();

    await openResetDialog(user);

    expect(screen.getByText('Reset All App Data?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete everything/i })).toBeDisabled();
    expect(mockResetAllData).not.toHaveBeenCalled();
  });

  it('keeps the delete action disabled until the exact confirmation word is typed', async () => {
    const user = userEvent.setup();
    renderSection();

    await openResetDialog(user);
    const confirmField = screen.getByLabelText(`Type ${RESET_CONFIRMATION_WORD} to confirm`);
    const deleteButton = screen.getByRole('button', { name: /delete everything/i });

    await user.type(confirmField, 'reset');
    expect(deleteButton).toBeDisabled();

    await user.clear(confirmField);
    await user.type(confirmField, RESET_CONFIRMATION_WORD);
    expect(deleteButton).toBeEnabled();
  });

  it('runs the reset and closes the dialog on confirm', async () => {
    const user = userEvent.setup();
    renderSection();

    await openResetDialog(user);
    await user.type(screen.getByLabelText(`Type ${RESET_CONFIRMATION_WORD} to confirm`), RESET_CONFIRMATION_WORD);
    await user.click(screen.getByRole('button', { name: /delete everything/i }));

    expect(mockResetAllData).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('cancel closes the dialog without resetting', async () => {
    const user = userEvent.setup();
    renderSection();

    await openResetDialog(user);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mockResetAllData).not.toHaveBeenCalled();
  });

  it('shows reset errors', () => {
    renderSection();

    const hookProps = mockUseResetAppData.mock.calls[0][0];
    hookProps?.onError?.('Failed to reset app data. Please try again.');

    expect(mockShowError).toHaveBeenCalledWith('Failed to reset app data. Please try again.');
  });

  it('shows the busy state while a reset is in flight', () => {
    setupHookMocks({ isResetting: true });
    renderSection();

    expect(screen.getByRole('button', { name: /resetting/i })).toBeDisabled();
  });

  describe('export and import', () => {
    const callbacks = () => mockUseDataBackup.mock.calls.at(-1)![0];

    it('exports and imports (merging) from the buttons, which show when busy', () => {
      const { rerender } = renderSection();
      fireEvent.click(screen.getByRole('button', { name: 'Export Data' }));
      fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));
      expect(exportData).toHaveBeenCalled();
      expect(importData).toHaveBeenCalledWith();

      setupHookMocks({ busy: true });
      rerender(<DataManagementSection />);
      expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Importing...' })).toBeDisabled();
    });

    it('says where the export went, or just that it went', () => {
      renderSection();
      callbacks().onExportSuccess!('/Users/me/export.json');
      callbacks().onExportSuccess!(undefined);

      expect(mockNotify.mock.calls.map(([notice]) => notice.message)).toEqual([
        'Exported to /Users/me/export.json',
        'Your data was exported',
      ]);
    });

    it('says why an export or import failed', () => {
      renderSection();
      callbacks().onExportError!('Disk full');
      callbacks().onImportError!('Not a TaskMint export');
      expect(mockShowError.mock.calls).toEqual([['Disk full'], ['Not a TaskMint export']]);
    });

    const result = (mode: 'merge' | 'replace') => ({
      mode,
      importedCounts: {
        tasks: 0,
        noteTemplates: 0,
        taskNotes: 0,
        goalAchievements: 0,
        withdrawals: 0,
        sessions: 0,
        workLogEntries: 0,
      },
      recordsSkipped: 0,
    });

    it('reloads once an import or a restore has landed', async () => {
      renderSection();
      callbacks().onImportSuccess!(result('merge'));
      callbacks().onImportSuccess!(result('replace'));

      expect(mockNotify.mock.calls.map(([notice]) => notice.message)).toEqual([
        'Data imported. Reloading…',
        'Backup restored. Reloading…',
      ]);
      await waitFor(() => expect(reloadApp).toHaveBeenCalled());
    });
  });

  describe('restoring a backup exactly', () => {
    const backup = {
      exportDate: '2026-11-01T12:00:00.000Z',
      data: { tasks: [{ id: 't1' }], sessions: [{}, {}], workLogs: { entries: [{}] }, settings: { theme: 'dark' } },
    };

    it('asks for a file, then asks before replacing everything with it', async () => {
      const user = userEvent.setup();
      chooseBackupFile.mockResolvedValue(backup);
      restoreBackup.mockResolvedValue(undefined);
      renderSection();

      await user.click(screen.getByRole('button', { name: 'Restore Exactly' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Restore this backup exactly?');
      expect(dialog).toHaveTextContent("Your current data is replaced with the backup's");
      expect(dialog).toHaveTextContent('1 task');
      expect(dialog).toHaveTextContent('2 sessions');
      expect(dialog).toHaveTextContent('1 imported work-log entry');
      expect(dialog).toHaveTextContent('0 notes');
      expect(dialog).toHaveTextContent("This device's settings");
      expect(restoreBackup).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Replace My Data' }));
      expect(restoreBackup).toHaveBeenCalledWith(backup, 'replace');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('restores nothing when the file is dismissed or the restore cancelled', async () => {
      const user = userEvent.setup();
      chooseBackupFile.mockResolvedValueOnce(null).mockResolvedValueOnce({ data: {} });
      renderSection();

      await user.click(screen.getByRole('button', { name: 'Restore Exactly' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Restore Exactly' }));
      const dialog = await screen.findByRole('dialog');
      // A file without an export time or settings
      expect(dialog).toHaveTextContent('The backup has:');
      expect(dialog).not.toHaveTextContent("This device's settings");
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(restoreBackup).not.toHaveBeenCalled();
    });

    it("can't be closed while the restore runs", async () => {
      const user = userEvent.setup();
      chooseBackupFile.mockResolvedValue(backup);
      const { rerender } = renderSection();
      await user.click(screen.getByRole('button', { name: 'Restore Exactly' }));
      const dialog = await screen.findByRole('dialog');

      setupHookMocks({ busy: true });
      rerender(<DataManagementSection />);
      expect(screen.getByRole('button', { name: 'Restoring...' })).toBeDisabled();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it("can't be closed while the reset runs", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSection();
    const dialog = await openResetDialog(user);

    setupHookMocks({ isResetting: true });
    rerender(<DataManagementSection />);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
