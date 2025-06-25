/**
 * Daily Goal Progress Widget
 * 
 * Displays current daily earnings progress towards the set goal
 * Shows progress bar, percentage, and earnings information
 */

import { Box, Typography, LinearProgress, Chip, Stack } from '@mui/material';
import { TrendingUp, CheckCircle, Warning, Cancel } from '@mui/icons-material';
import { DailyGoal } from '../../../types/goal';
import { formatCurrency } from '../../../utils/formatters';

export interface DailyGoalProgressWidgetProps {
  currentEarnings: number;
  dailyGoal: DailyGoal | null;
}

export function DailyGoalProgressWidget({
  currentEarnings,
  dailyGoal,
}: DailyGoalProgressWidgetProps) {
  // If no goal is set or goal is disabled
  if (!dailyGoal || !dailyGoal.isEnabled || !dailyGoal.targetAmount) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: 'center',
          color: 'text.secondary',
          backgroundColor: 'background.paper',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <TrendingUp sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="body1" color="text.secondary">
          Daily goal not active
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Set up a daily earnings goal in Settings to track your progress
        </Typography>
      </Box>
    );
  }

  const percentageAchieved = (currentEarnings / dailyGoal.targetAmount) * 100;
  const remainingAmount = Math.max(0, dailyGoal.targetAmount - currentEarnings);
  const progressValue = Math.min(100, percentageAchieved);

  // Determine status and colors
  const getStatusInfo = () => {
    if (percentageAchieved >= 100) {
      return {
        status: percentageAchieved > 100 ? 'exceeded' : 'achieved',
        color: 'success.main',
        icon: <CheckCircle />,
        label: percentageAchieved > 100 ? 'Exceeded!' : 'Achieved!',
        chipColor: 'success' as const,
      };
    } else if (percentageAchieved >= 75) {
      return {
        status: 'on-track',
        color: 'primary.main',
        icon: <TrendingUp />,
        label: 'On Track',
        chipColor: 'primary' as const,
      };
    } else if (percentageAchieved >= 50) {
      return {
        status: 'behind',
        color: 'warning.main',
        icon: <Warning />,
        label: 'Behind',
        chipColor: 'warning' as const,
      };
    } else {
      return {
        status: 'behind',
        color: 'error.main',
        icon: <Cancel />,
        label: 'Behind',
        chipColor: 'error' as const,
      };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Box
      sx={{
        p: 3,
        backgroundColor: 'background.paper',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Header with status */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp color="primary" />
          Daily Goal Progress
        </Typography>
        <Chip
          icon={statusInfo.icon}
          label={statusInfo.label}
          color={statusInfo.chipColor}
          size="small"
          variant="outlined"
        />
      </Stack>

      {/* Earnings display */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Today's Goal
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 600, fontFamily: '"Roboto Mono", monospace' }}>
          {formatCurrency(currentEarnings)} / {formatCurrency(dailyGoal.targetAmount)}
        </Typography>
      </Box>

      {/* Progress bar */}
      <Box sx={{ mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={progressValue}
          sx={{
            height: 12,
            borderRadius: 6,
            backgroundColor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              borderRadius: 6,
              backgroundColor: 'primary.main',
            },
          }}
        />
      </Box>

      {/* Progress details */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" color="text.secondary">
          {Math.round(percentageAchieved)}% Complete
        </Typography>
        
        {percentageAchieved >= 100 ? (
          <Typography variant="body2" sx={{ color: statusInfo.color, fontWeight: 600 }}>
            +{formatCurrency(currentEarnings - dailyGoal.targetAmount)} over goal!
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {formatCurrency(remainingAmount)} remaining
          </Typography>
        )}
      </Stack>

      {/* Additional info for exceeded goals */}
      {percentageAchieved > 100 && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            backgroundColor: 'success.light',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'success.main',
          }}
        >
          <Typography variant="body2" sx={{ color: 'success.dark', fontWeight: 600 }}>
            🎉 Congratulations! You've exceeded your daily goal by {Math.round(percentageAchieved - 100)}%
          </Typography>
        </Box>
      )}

      {/* Motivational message for behind goals */}
      {percentageAchieved < 50 && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            backgroundColor: 'info.light',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'info.main',
          }}
        >
          <Typography variant="body2" sx={{ color: 'info.dark' }}>
            💪 Keep going! You can still reach your goal today.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
