import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { DataManagementSection, RESET_CONFIRMATION_WORD } from '../DataManagementSection';
import { useDataBackup } from '../../../../hooks/useDataBackup';
import { useResetAppData } from '../../../../hooks/useResetAppData';

// Mock the data hooks — this suite covers the section's wiring and the
// typed-confirmation dialog, not the hook internals.
vi.mock('../../../../hooks/useDataBackup');
vi.mock('../../../../hooks/useResetAppData');

const mockUseDataBackup = vi.mocked(useDataBackup);
const mockUseResetAppData = vi.mocked(useResetAppData);

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={createTheme()}>{children}</ThemeProvider>
);

describe('DataManagementSection', () => {
  const mockResetAllData = vi.fn();
  const mockOnError = vi.fn();

  const setupHookMocks = ({ isResetting = false } = {}) => {
    mockUseDataBackup.mockReturnValue({
      exportData: vi.fn(),
      importData: vi.fn(),
      isExporting: false,
      isImporting: false,
    } as any);
    mockUseResetAppData.mockReturnValue({
      resetAllData: mockResetAllData,
      isResetting,
    } as any);
  };

  const renderSection = () =>
    render(<DataManagementSection onError={mockOnError} />, { wrapper: TestWrapper });

  const openResetDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /reset all data/i }));
    return screen.getByRole('dialog');
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    await user.type(
      screen.getByLabelText(`Type ${RESET_CONFIRMATION_WORD} to confirm`),
      RESET_CONFIRMATION_WORD
    );
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

  it('forwards reset errors to the section error handler', () => {
    renderSection();

    const hookProps = mockUseResetAppData.mock.calls[0][0];
    hookProps?.onError?.('Failed to reset app data. Please try again.');

    expect(mockOnError).toHaveBeenCalledWith('Failed to reset app data. Please try again.');
  });

  it('shows the busy state while a reset is in flight', () => {
    setupHookMocks({ isResetting: true });
    renderSection();

    expect(screen.getByRole('button', { name: /resetting/i })).toBeDisabled();
  });
});
