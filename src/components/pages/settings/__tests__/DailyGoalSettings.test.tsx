import React from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import { DailyGoalSettings } from '../DailyGoalSettings';
import { useDailyGoals } from '../../../../hooks/useDailyGoals';

// Mock the useDailyGoals hook
jest.mock('../../../../hooks/useDailyGoals');
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

describe('DailyGoalSettings', () => {
  const mockUpdateDailyGoal = jest.fn();
  const mockEnableDailyGoal = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockOnError = jest.fn();

  const setupMocks = (goal: any) => {
    mockUseDailyGoals.mockReturnValue({
      currentGoal: goal,
      updateDailyGoal: mockUpdateDailyGoal,
      enableDailyGoal: mockEnableDailyGoal,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks({
      targetAmount: 100,
      currency: 'USD',
      isEnabled: false,
    });
  });

  it('should initialize form fields from currentGoal', () => {
    render(<DailyGoalSettings onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/daily target amount/i)).toHaveValue('100');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('USD ($)');
    expect(screen.getByRole('checkbox', { name: /enable daily earnings goal/i })).not.toBeChecked();
  });

  it('should handle enabled goal state', () => {
    setupMocks({ targetAmount: 150, currency: 'EUR', isEnabled: true });
    render(<DailyGoalSettings onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/daily target amount/i)).toHaveValue('150');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('EUR (€)');
    expect(screen.getByRole('checkbox', { name: /enable daily earnings goal/i })).toBeChecked();
  });

  it('should handle null currentGoal', () => {
    setupMocks(null);
    render(<DailyGoalSettings onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/daily target amount/i)).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('USD ($)');
    expect(screen.getByRole('checkbox', { name: /enable daily earnings goal/i })).not.toBeChecked();
  });

  it('should call updateDailyGoal when save button is clicked', async () => {
    const user = userEvent.setup();
    mockUpdateDailyGoal.mockResolvedValue(undefined);
    render(<DailyGoalSettings onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    // Enable the goal to make changes and save
    const toggle = screen.getByRole('checkbox', { name: /enable daily earnings goal/i });
    await user.click(toggle);

    const saveButton = screen.getByRole('button', { name: 'Save Goal' });
    await user.click(saveButton);

    expect(mockUpdateDailyGoal).toHaveBeenCalledWith({
      targetAmount: 100,
      currency: 'USD',
      isEnabled: true, // Should be true now
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('should handle updateDailyGoal errors', async () => {
    const user = userEvent.setup();
    mockUpdateDailyGoal.mockRejectedValue(new Error('Save failed'));
    render(<DailyGoalSettings onSuccess={mockOnSuccess} onError={mockOnError} />, { wrapper: TestWrapper });

    await act(async () => {
      await user.click(screen.getByRole('checkbox', { name: /enable daily earnings goal/i }));
      await user.click(screen.getByRole('button', { name: 'Save Goal' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to save goal. Please try again.')).toBeInTheDocument();
      expect(mockOnError).toHaveBeenCalledWith('Failed to save goal. Please try again.');
    });
  });
});
