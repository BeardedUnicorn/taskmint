import React from 'react';
import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { NotificationProvider } from '../../../../contexts/NotificationContext'

import { DailyGoalSettings } from '../DailyGoalSettings';
import { useDailyGoals } from '../../../../hooks/useDailyGoals';

// Mock the useDailyGoals hook
vi.mock('../../../../hooks/useDailyGoals');
const mockUseDailyGoals = useDailyGoals as MockedFunction<typeof useDailyGoals>;

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = createTheme({
    palette: {
      mode: 'dark',
    },
  });
  return (
    <ThemeProvider theme={theme}>
      <NotificationProvider>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          {children}
        </LocalizationProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
};

describe('DailyGoalSettings', () => {
  const mockUpdateDailyGoal = vi.fn();
  const mockEnableDailyGoal = vi.fn();

  const setupMocks = (goal: any) => {
    mockUseDailyGoals.mockReturnValue({
      currentGoal: goal,
      updateDailyGoal: mockUpdateDailyGoal,
      enableDailyGoal: mockEnableDailyGoal,
    } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks({
      targetAmount: 100,
      currency: 'USD',
      isEnabled: false,
    });
  });

  it('should initialize form fields from currentGoal', () => {
    render(<DailyGoalSettings />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/daily target amount/i)).toHaveValue('100');
    expect(screen.getByRole('switch', { name: /enable daily earnings goal/i })).not.toBeChecked();
  });

  it('has no currency picker, since every amount in the app is in dollars', () => {
    render(<DailyGoalSettings />, { wrapper: TestWrapper });
    expect(screen.queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument();
  });

  it('saves the switch at once, keeping a stored currency', async () => {
    const user = userEvent.setup();
    mockUpdateDailyGoal.mockResolvedValue(undefined);
    setupMocks({ targetAmount: 150, currency: 'EUR', isEnabled: false });
    render(<DailyGoalSettings />, { wrapper: TestWrapper });

    await user.click(await screen.findByRole('switch', { name: /enable daily earnings goal/i }));

    expect(mockUpdateDailyGoal).toHaveBeenCalledWith({
      targetAmount: 150,
      currency: 'EUR',
      isEnabled: true,
    });
    expect(screen.queryByRole('button', { name: 'Save Goal' })).not.toBeInTheDocument();
  }, 30000);

  it('should handle enabled goal state', () => {
    setupMocks({ targetAmount: 150, currency: 'EUR', isEnabled: true });
    render(<DailyGoalSettings />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/daily target amount/i)).toHaveValue('150');
    expect(screen.getByRole('switch', { name: /enable daily earnings goal/i })).toBeChecked();
  });

  it('should handle null currentGoal', () => {
    setupMocks(null);
    render(<DailyGoalSettings />, { wrapper: TestWrapper });
    expect(screen.getByLabelText(/daily target amount/i)).toHaveValue('');
    expect(screen.getByRole('switch', { name: /enable daily earnings goal/i })).not.toBeChecked();
  });

  it('saves a new amount when typing pauses', async () => {
    const user = userEvent.setup();
    mockUpdateDailyGoal.mockResolvedValue(undefined);
    setupMocks({ targetAmount: 100, currency: 'USD', isEnabled: true });
    render(<DailyGoalSettings />, { wrapper: TestWrapper });

    const amount = screen.getByLabelText(/daily target amount/i);
    await user.clear(amount);
    await user.type(amount, '250');

    await waitFor(() =>
      expect(mockUpdateDailyGoal).toHaveBeenCalledWith({ targetAmount: 250, currency: 'USD', isEnabled: true })
    );
    expect(mockUpdateDailyGoal).toHaveBeenCalledTimes(1);
  }, 30000);

  it('saves on Enter, and asks for an amount above zero', async () => {
    const user = userEvent.setup();
    mockUpdateDailyGoal.mockResolvedValue(undefined);
    setupMocks({ targetAmount: 100, currency: 'USD', isEnabled: true });
    render(<DailyGoalSettings />, { wrapper: TestWrapper });

    const amount = screen.getByLabelText(/daily target amount/i);
    await user.clear(amount);
    await user.type(amount, '0{Enter}');
    expect(await screen.findByText('Enter an amount above zero')).toBeInTheDocument();
    expect(mockUpdateDailyGoal).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, '120{Enter}');
    expect(mockUpdateDailyGoal).toHaveBeenCalledWith({ targetAmount: 120, currency: 'USD', isEnabled: true });
  }, 30000);

  it('should handle updateDailyGoal errors', async () => {
    const user = userEvent.setup();
    mockUpdateDailyGoal.mockRejectedValue(new Error('Save failed'));
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<DailyGoalSettings />, { wrapper: TestWrapper });

    await user.click(await screen.findByRole('switch', { name: /enable daily earnings goal/i }));

    // The reason, as an error toast
    expect(await screen.findByText('Save failed')).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  }, 30000);
});
