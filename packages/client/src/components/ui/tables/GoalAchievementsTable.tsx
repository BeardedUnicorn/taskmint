/**
 * Goal Achievements Table
 *
 * Displays daily goal achievements with status, progress, and earnings data
 * Shows historical performance against daily earnings goals. A phone lists
 * the days as rows instead of a six-column table.
 */

import { ReactElement, useMemo } from 'react';
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
import { CheckCircle, Cancel, TrendingUp, TrendingDown, Schedule } from '@mui/icons-material';
import { DailyGoalAchievement } from '../../../types/goal';
import { formatCurrency } from '../../../utils/formatters';
import { isToday, formatLocalDate, formatLocalDateWithDay } from '../../../utils/dateHelpers';
import { HOVER } from '../../../theme/media';
import { PHONE_TABLE } from './tableStyles';
import { StackedList, StackedRow } from './StackedRows';
import { useCompactLayout } from '../../../hooks/useCompactLayout';
import { formatWeekdayDate } from '../../../utils/locale';
import { parseDateStringLocal } from '../../../utils/dateHelpers';

export interface GoalAchievementsTableProps {
  achievements: DailyGoalAchievement[];
}

/** A day's result: today short of the goal is still in progress. */
type RowKind = 'inProgress' | DailyGoalAchievement['status'];

const KINDS: Record<
  RowKind,
  { label: string; icon: ReactElement; color: 'info' | 'success' | 'error'; filled: boolean; tooltip: string }
> = {
  inProgress: {
    label: 'In Progress',
    icon: <Schedule />,
    color: 'info',
    filled: false,
    tooltip: 'Amount remaining to reach goal today',
  },
  hit: { label: 'Hit', icon: <CheckCircle />, color: 'success', filled: false, tooltip: 'Exact goal achievement' },
  exceeded: { label: 'Exceeded', icon: <TrendingUp />, color: 'success', filled: true, tooltip: 'Amount over goal' },
  missed: { label: 'Missed', icon: <Cancel />, color: 'error', filled: false, tooltip: 'Amount short of goal' },
};

const kindOf = (achievement: DailyGoalAchievement): RowKind =>
  achievement.status === 'missed' && isToday(achievement.date) ? 'inProgress' : achievement.status;

const amountSx = { fontWeight: 600, fontFamily: 'monospace' } as const;

function Difference({ achievement, kind }: { achievement: DailyGoalAchievement; kind: RowKind }) {
  const { difference } = achievement;
  if (kind === 'inProgress') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Schedule color="info" fontSize="small" />
        <Typography variant="body2" sx={{ ...amountSx, color: 'info.main' }}>
          {formatCurrency(Math.abs(difference))} remaining
        </Typography>
      </Box>
    );
  }
  const isPositive = difference >= 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {kind === 'exceeded' && <TrendingUp color="success" fontSize="small" />}
      {kind === 'missed' && <TrendingDown color="error" fontSize="small" />}
      <Typography variant="body2" sx={{ ...amountSx, color: isPositive ? 'success.main' : 'error.main' }}>
        {isPositive ? '+' : ''}
        {formatCurrency(Math.abs(difference))}
      </Typography>
    </Box>
  );
}

/** A phone's day: what it earned, a bar toward its goal, its status and the difference. */
function PhoneDay({ achievement }: { achievement: DailyGoalAchievement }) {
  const kind = kindOf(achievement);
  const look = KINDS[kind];
  return (
    <StackedRow
      title={formatWeekdayDate(parseDateStringLocal(achievement.date))}
      figure={formatCurrency(achievement.earnedAmount)}
      details={
        <>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, achievement.percentageAchieved)}
            color={look.color}
            aria-hidden
            sx={{ flexBasis: '100%', height: 6, borderRadius: 3, my: 0.5 }}
          />
          <span>
            {Math.round(achievement.percentageAchieved)}% of {formatCurrency(achievement.goalAmount)}
          </span>
          <Chip
            icon={look.icon}
            label={look.label}
            color={look.color}
            size="small"
            variant={look.filled ? 'filled' : 'outlined'}
          />
          <Difference achievement={achievement} kind={kind} />
        </>
      }
    />
  );
}

export function GoalAchievementsTable({ achievements }: GoalAchievementsTableProps) {
  const compact = useCompactLayout();
  // Most recent first
  const sortedAchievements = useMemo(
    () => [...achievements].sort((a, b) => b.date.localeCompare(a.date)),
    [achievements]
  );

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

  if (compact) {
    return (
      <StackedList label="Daily goal">
        {sortedAchievements.map(achievement => (
          <PhoneDay key={achievement.id} achievement={achievement} />
        ))}
      </StackedList>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table sx={PHONE_TABLE}>
        <TableHead>
          <TableRow>
            <TableCell>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Date
              </Typography>
            </TableCell>
            <TableCell align="right">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Goal Set
              </Typography>
            </TableCell>
            <TableCell align="right">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Earned
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Progress
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Status
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Difference
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedAchievements.map(achievement => {
            const kind = kindOf(achievement);
            const look = KINDS[kind];
            return (
              <TableRow key={achievement.id} hover sx={{ [HOVER]: { '&:hover': { backgroundColor: 'action.hover' } } }}>
                <TableCell>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 120 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, achievement.percentageAchieved)}
                        color={look.color}
                        sx={{ flex: 1, height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
                        {Math.round(achievement.percentageAchieved)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                </TableCell>

                <TableCell align="center">
                  <Chip
                    icon={look.icon}
                    label={look.label}
                    color={look.color}
                    size="small"
                    variant={look.filled ? 'filled' : 'outlined'}
                  />
                </TableCell>

                <TableCell align="center">
                  <Tooltip title={look.tooltip}>
                    <Box>
                      <Difference achievement={achievement} kind={kind} />
                    </Box>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
