import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { TrendingUp as GoalIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { CurrencyInput } from '../../ui/forms/CurrencyInput';
import { useDailyGoals } from '../../../hooks/useDailyGoals';

interface DailyGoalSettingsProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function DailyGoalSettings({ onSuccess, onError }: DailyGoalSettingsProps) {
  // Local state for form management
  const [goalSuccess, setGoalSuccess] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [goalTargetAmount, setGoalTargetAmount] = useState('');
  const [goalCurrency, setGoalCurrency] = useState('USD');
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { currentGoal, updateDailyGoal } = useDailyGoals();

  // Initialize goal form fields when currentGoal changes
  useEffect(() => {
    if (currentGoal) {
      setGoalTargetAmount(currentGoal.targetAmount.toString());
      setGoalCurrency(currentGoal.currency);
      setGoalEnabled(currentGoal.isEnabled);
    } else {
      setGoalTargetAmount('');
      setGoalCurrency('USD');
      setGoalEnabled(false);
    }
    setIsDirty(false); // Reset dirty state on load
  }, [currentGoal]);

  const handleFieldChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setter(value);
    setIsDirty(true);
  };

  const handleSaveGoal = async () => {
    try {
      setGoalError(null);

      const targetAmount = parseFloat(goalTargetAmount);
      if (isNaN(targetAmount) || targetAmount < 0) {
        const error = 'Please enter a valid target amount';
        setGoalError(error);
        onError?.(error);
        return;
      }

      await updateDailyGoal({
        targetAmount,
        currency: goalCurrency,
        isEnabled: goalEnabled,
      });

      setIsDirty(false);
      setGoalSuccess(true);
      setTimeout(() => setGoalSuccess(false), 3000);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to save goal:', error);
      const errorMessage = 'Failed to save goal. Please try again.';
      setGoalError(errorMessage);
      onError?.(errorMessage);
    }
  };

  return (
      <SettingsSection title="Daily Earnings Goal" icon={<GoalIcon color="primary" />}>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set a daily earnings target to track your progress and receive notifications when you reach milestones.
      </Typography>

      <Stack spacing={3}>
        {/* Enable/Disable Toggle */}
        <FormControlLabel
          control={
            <Switch
              checked={goalEnabled}
              onChange={(e) => handleFieldChange(setGoalEnabled, e.target.checked)}
              color="primary"
            />
          }
          label="Enable daily earnings goal"
        />

        {/* Goal Configuration */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <CurrencyInput
            label="Daily Target Amount"
            value={goalTargetAmount}
            onChange={(value) => handleFieldChange(setGoalTargetAmount, value)}
            currency="$"
            placeholder="0.00"
            disabled={!goalEnabled}
            error={!!goalError && goalError.includes('target amount')}
            helperText={goalError && goalError.includes('target amount') ? goalError : 'Set your daily earnings target'}
            sx={{ minWidth: 200 }}
          />

          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="goal-currency-label">Currency</InputLabel>
            <Select
              labelId="goal-currency-label"
              value={goalCurrency}
              label="Currency"
              onChange={(e) => handleFieldChange(setGoalCurrency, e.target.value)}
              disabled={!goalEnabled}
              size="medium"
            >
              <MenuItem value="USD">USD ($)</MenuItem>
              <MenuItem value="EUR">EUR (€)</MenuItem>
              <MenuItem value="GBP">GBP (£)</MenuItem>
              <MenuItem value="CAD">CAD ($)</MenuItem>
              <MenuItem value="AUD">AUD ($)</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Save Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            variant="contained"
            onClick={handleSaveGoal}
            disabled={!isDirty || (goalEnabled && !goalTargetAmount)}
            sx={{ minWidth: 120 }}
          >
            Save Goal
          </Button>
        </Box>
      </Stack>

      {/* Error/Success Messages */}
      {goalError && !goalError.includes('target amount') && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {goalError}
        </Alert>
      )}

      {goalSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Daily earnings goal saved successfully!
        </Alert>
      )}

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Daily Goal Notifications:</strong> You'll receive desktop notifications at 50%, 75%, 100%, and when you exceed your daily target.
          The goal resets automatically each day.
        </Typography>
      </Alert>
    </SettingsSection>
  );
}
