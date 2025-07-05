/**
 * Goal Achievements Table
 * 
 * Displays daily goal achievements with status, progress, and earnings data
 * Shows historical performance against daily earnings goals
 */

import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Typography,
  Box,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  CheckCircle,
  Cancel,
  TrendingUp,
  TrendingDown,
  Remove,
  Schedule,
} from '@mui/icons-material';
import { DailyGoalAchievement } from '../../../types/goal';
import { formatCurrency } from '../../../utils/formatters';
import { isToday, formatLocalDate, formatLocalDateWithDay } from '../../../utils/dateHelpers';
import dayjs from 'dayjs';

export interface GoalAchievementsTableProps {
  achievements: DailyGoalAchievement[];
  loading?: boolean;
}

export function GoalAchievementsTable({
  achievements,
  loading = false,
}: GoalAchievementsTableProps) {
  // Sort achievements by date (most recent first)
  const sortedAchievements = useMemo(() => {
    return [...achievements].sort((a, b) => b.date.localeCompare(a.date));
  }, [achievements]);

  const getStatusChip = (achievement: DailyGoalAchievement) => {
    // Check if this achievement is for today
    const isCurrentDay = isToday(achievement.date);

    // If it's today and the status is 'missed', show 'In Progress' instead
    if (isCurrentDay && achievement.status === 'missed') {
      return (
        <Chip
          icon={<Schedule />}
          label="In Progress"
          color="info"
          size="small"
          variant="outlined"
        />
      );
    }

    switch (achievement.status) {
      case 'hit':
        return (
          <Chip
            icon={<CheckCircle />}
            label="Hit"
            color="success"
            size="small"
            variant="outlined"
          />
        );
      case 'exceeded':
        return (
          <Chip
            icon={<TrendingUp />}
            label="Exceeded"
            color="success"
            size="small"
          />
        );
      case 'missed':
        return (
          <Chip
            icon={<Cancel />}
            label="Missed"
            color="error"
            size="small"
            variant="outlined"
          />
        );
      default:
        return (
          <Chip
            icon={<Remove />}
            label="Unknown"
            color="default"
            size="small"
            variant="outlined"
          />
        );
    }
  };

  const getDifferenceDisplay = (achievement: DailyGoalAchievement) => {
    const { difference, status } = achievement;
    const isPositive = difference >= 0;
    const isCurrentDay = isToday(achievement.date);

    // For current day with 'missed' status, show remaining amount instead of negative difference
    if (isCurrentDay && status === 'missed') {
      const remainingAmount = Math.abs(difference);
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Schedule color="info" fontSize="small" />
          <Typography
            variant="body2"
            sx={{
              color: 'info.main',
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            {formatCurrency(remainingAmount)} remaining
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {status === 'exceeded' && <TrendingUp color="success" fontSize="small" />}
        {status === 'missed' && <TrendingDown color="error" fontSize="small" />}
        <Typography
          variant="body2"
          sx={{
            color: isPositive ? 'success.main' : 'error.main',
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          {isPositive ? '+' : ''}{formatCurrency(Math.abs(difference))}
        </Typography>
      </Box>
    );
  };

  const getProgressBar = (achievement: DailyGoalAchievement) => {
    const percentage = Math.min(100, achievement.percentageAchieved);
    const isCurrentDay = isToday(achievement.date);

    // Determine color based on status and whether it's the current day
    let color: 'error' | 'success' | 'info' = 'success';
    if (achievement.status === 'missed') {
      color = isCurrentDay ? 'info' : 'error';
    }

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 120 }}>
        <LinearProgress
          variant="determinate"
          value={percentage}
          color={color}
          sx={{
            flex: 1,
            height: 8,
            borderRadius: 4,
          }}
        />
        <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
          {Math.round(achievement.percentageAchieved)}%
        </Typography>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Loading goal achievements...
        </Typography>
      </Box>
    );
  }

  if (sortedAchievements.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No goal achievements found for the selected date range.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Set up a daily earnings goal and start tracking to see your progress here.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>
              <Typography variant="subtitle2" fontWeight={600}>
                Date
              </Typography>
            </TableCell>
            <TableCell align="right">
              <Typography variant="subtitle2" fontWeight={600}>
                Goal Set
              </Typography>
            </TableCell>
            <TableCell align="right">
              <Typography variant="subtitle2" fontWeight={600}>
                Earned
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle2" fontWeight={600}>
                Progress
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle2" fontWeight={600}>
                Status
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle2" fontWeight={600}>
                Difference
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedAchievements.map((achievement) => (
            <TableRow
              key={achievement.id}
              hover
              sx={{
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <TableCell>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {formatLocalDate(achievement.date)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatLocalDateWithDay(achievement.date)}
                  </Typography>
                </Box>
              </TableCell>
              
              <TableCell align="right">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {formatCurrency(achievement.goalAmount)}
                </Typography>
              </TableCell>
              
              <TableCell align="right">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {formatCurrency(achievement.earnedAmount)}
                </Typography>
              </TableCell>
              
              <TableCell align="center">
                <Tooltip title={`${achievement.percentageAchieved.toFixed(1)}% of goal achieved`}>
                  <Box>{getProgressBar(achievement)}</Box>
                </Tooltip>
              </TableCell>
              
              <TableCell align="center">
                {getStatusChip(achievement)}
              </TableCell>
              
              <TableCell align="center">
                <Tooltip
                  title={
                    isToday(achievement.date) && achievement.status === 'missed'
                      ? 'Amount remaining to reach goal today'
                      : achievement.status === 'exceeded'
                      ? 'Amount over goal'
                      : achievement.status === 'missed'
                      ? 'Amount short of goal'
                      : 'Exact goal achievement'
                  }
                >
                  <Box>{getDifferenceDisplay(achievement)}</Box>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
