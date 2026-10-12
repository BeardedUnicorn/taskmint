/**
 * Goal Progress
 *
 * Today's earnings against the daily goal, at the bottom of the sidebar on
 * every page; live while a timer runs. A bar when the sidebar is expanded, a
 * ring with the percent when it's collapsed. Hidden when no goal is set.
 */

import { Box, CircularProgress, LinearProgress, Tooltip, Typography } from '@mui/material';
import { DailyGoalProgressData } from '../../hooks/useDailyGoalProgressMonitor';
import { formatCurrency } from '../../utils/formatters';

interface GoalProgressProps {
  progress: DailyGoalProgressData;
  collapsed?: boolean;
}

export function GoalProgress({ progress, collapsed = false }: GoalProgressProps) {
  if (!progress.enabled) return null;

  const percent = Math.max(0, progress.percent);
  // Whole percent, like the label (screen readers announce this value)
  const barValue = Math.min(100, Math.floor(percent));
  const reached = percent >= 100;
  const color = reached ? 'success' : 'primary';
  const summary = `${formatCurrency(progress.earned)} of ${formatCurrency(progress.target)}`;
  const label = `Today's goal: ${summary} (${Math.floor(percent)}%)`;

  if (collapsed) {
    return (
      <Tooltip title={label} placement="right">
        <Box
          role="img"
          aria-label={label}
          sx={{ position: 'relative', display: 'inline-flex', mx: 'auto' }}
        >
          <CircularProgress
            variant="determinate"
            value={100}
            size={40}
            thickness={4}
            sx={{ color: 'action.hover', position: 'absolute' }}
          />
          <CircularProgress variant="determinate" value={barValue} size={40} thickness={4} color={color} />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
              {Math.floor(percent)}%
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box aria-label={label} role="group">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          Today
        </Typography>
        <Typography variant="caption" color={reached ? 'success.main' : 'text.secondary'}>
          {Math.floor(percent)}%
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
        {summary}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={barValue}
        color={color}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
}
