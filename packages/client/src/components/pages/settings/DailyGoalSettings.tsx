import { useEffect, useRef, useState } from 'react';
import { Typography, Stack, Switch, FormControlLabel } from '@mui/material';
import { TrendingUp as GoalIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { CurrencyInput } from '../../ui/forms/CurrencyInput';
import { useDailyGoals } from '../../../hooks/useDailyGoals';
import { useNotification } from '../../../contexts/NotificationContext';
import { errorMessage } from '../../../utils/errors';

/** How long typing pauses before the amount saves. */
export const GOAL_SAVE_DELAY_MS = 800;

/**
 * The daily earnings goal. Changes save as you make them: the switch at
 * once, the amount when you pause, leave the field or press Enter (if it's
 * a number above zero).
 */
export function DailyGoalSettings() {
  const { showError } = useNotification();
  const { currentGoal, updateDailyGoal } = useDailyGoals();
  const enabled = currentGoal?.isEnabled ?? false;
  const savedAmount = currentGoal?.targetAmount;

  const [amountText, setAmountText] = useState(savedAmount !== undefined ? String(savedAmount) : '');
  const [amountError, setAmountError] = useState<string | null>(null);

  // Follow the saved amount (another window, a reset)
  useEffect(() => {
    setAmountText(savedAmount !== undefined ? String(savedAmount) : '');
    setAmountError(null);
  }, [savedAmount]);

  const save = async (changes: { isEnabled?: boolean; targetAmount?: number }) => {
    try {
      await updateDailyGoal({
        targetAmount: changes.targetAmount ?? savedAmount ?? 0,
        // Every amount in the app is shown in dollars, so there's no currency
        // picker; a stored currency is carried through unchanged
        currency: currentGoal?.currency ?? 'USD',
        isEnabled: changes.isEnabled ?? enabled,
      });
    } catch (error) {
      console.error('Failed to save goal:', error);
      showError(errorMessage(error, "Couldn't save the goal"), { category: 'settings' });
    }
  };

  const commitAmount = (text = amountText) => {
    const trimmed = text.trim();
    const amount = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(amount) || amount <= 0) {
      setAmountError('Enter an amount above zero');
      return;
    }
    setAmountError(null);
    if (amount !== savedAmount) void save({ targetAmount: amount });
  };
  const commitRef = useRef(commitAmount);
  useEffect(() => {
    commitRef.current = commitAmount;
  });

  // Saves when typing pauses
  useEffect(() => {
    // (An enabled goal has an amount saved)
    if (!enabled || amountText.trim() === String(savedAmount)) return;
    const timeout = setTimeout(() => commitRef.current(amountText), GOAL_SAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [amountText, enabled, savedAmount]);

  return (
    <SettingsSection title="Daily Earnings Goal" icon={<GoalIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        A daily earnings target, with notifications at 50%, 75%, when you reach it, and when you're
        well past it (choose which reach your desktop under Notifications). It starts over each day.
      </Typography>

      <Stack spacing={3}>
        <FormControlLabel
          control={
            <Switch checked={enabled} onChange={event => void save({ isEnabled: event.target.checked })} color="primary" />
          }
          label="Enable daily earnings goal"
        />

        <CurrencyInput
          label="Daily Target Amount"
          value={amountText}
          onChange={value => {
            setAmountText(value);
            setAmountError(null);
          }}
          onBlur={() => enabled && commitAmount()}
          onKeyDown={event => {
            if (event.key === 'Enter') commitAmount();
          }}
          disabled={!enabled}
          error={!!amountError}
          helperText={amountError ?? 'Saved as you type'}
          sx={{ minWidth: 200, maxWidth: 280 }}
        />
      </Stack>
    </SettingsSection>
  );
}
