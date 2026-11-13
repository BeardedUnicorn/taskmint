/**
 * One day on the Calendar's month grid: its date, what was earned and
 * tracked, a bar toward the daily goal, and badges for money released,
 * withdrawals, and the next withdrawal's opening (its time; the legend says
 * what it is). A button that opens the day's breakdown.
 *
 * Narrow grids show whole dollars and coloured dots; wider ones (a container
 * query on the grid, see MonthGrid) show cents, time and labelled badges. A
 * phone shows the month as an agenda instead (MonthAgenda).
 */

import { Box, ButtonBase, LinearProgress, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { formatCents, formatWholeCents } from '../../../utils/payoutCalculator';
import { formatDurationCompact } from '../../../utils/formatters';
import { CalendarDay, dayGoalPercent, dayWorked } from './calendarMonth';
import { describeDay } from './calendarText';
import { DayBadges } from './DayBadges';
import { focusColor } from '../../../theme/components';
import { HOVER } from '../../../theme/media';

/** The grid is wide enough for cents, time and labelled badges. */
export const WIDE = '@container calendar (min-width: 640px)';

function Dot({ tone, hollow = false }: { tone: 'info' | 'success'; hollow?: boolean }) {
  return (
    <Box
      sx={theme => ({
        width: 7,
        height: 7,
        borderRadius: '50%',
        bgcolor: hollow ? 'transparent' : theme.palette[tone].main,
        border: `1.5px solid ${theme.palette[tone].main}`,
      })}
    />
  );
}

export interface DayCellProps {
  day: CalendarDay;
  /** In the tab order (the grid's one tabbable day). */
  tabbable: boolean;
  onOpen: (date: string) => void;
  onFocusDay: (date: string) => void;
}

export function DayCell({ day, tabbable, onOpen, onFocusDay }: DayCellProps) {
  const worked = dayWorked(day);
  const estimate = day.estimatedCents > 0 ? '~' : '';
  const goalPercent = dayGoalPercent(day);

  return (
    <Box role="gridcell" sx={{ minWidth: 0 }}>
      <ButtonBase
        data-date={day.date}
        tabIndex={tabbable ? 0 : -1}
        aria-label={describeDay(day)}
        onClick={() => onOpen(day.date)}
        onFocus={() => onFocusDay(day.date)}
        sx={theme => ({
          width: '100%',
          height: '100%',
          minHeight: 72,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 0.5,
          p: 0.75,
          textAlign: 'left',
          borderRadius: 1,
          border: `1px solid ${day.isToday ? theme.palette.primary.main : theme.palette.divider}`,
          bgcolor: worked && day.inMonth ? alpha(theme.palette.primary.main, 0.07) : 'transparent',
          transition: theme.transitions.create(['background-color', 'border-color'], { duration: 120 }),
          [HOVER]: { '&:hover': { bgcolor: theme.palette.action.hover } },
          '&:focus-visible': { outline: `2px solid ${focusColor(theme.palette.mode)}`, outlineOffset: 1 },
          [WIDE]: { minHeight: 112, p: 1 },
        })}
      >
        <Box sx={{ display: 'contents', '& > *': { opacity: day.inMonth ? 1 : 0.45 } }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              typography: 'body2',
              fontWeight: day.isToday ? 700 : 600,
              color: day.isToday ? 'primary.contrastText' : day.inMonth ? 'text.primary' : 'text.secondary',
              bgcolor: day.isToday ? 'primary.main' : 'transparent',
            }}
          >
            {day.dayOfMonth}
          </Box>

          {worked && (
            <Box>
              <Typography
                component="div"
                sx={{
                  fontFamily: '"Roboto Mono", monospace',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  lineHeight: 1.3,
                  [WIDE]: { display: 'none' },
                }}
              >
                {estimate}
                {formatWholeCents(day.earnedCents)}
              </Typography>
              <Typography
                component="div"
                sx={{
                  display: 'none',
                  fontFamily: '"Roboto Mono", monospace',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  lineHeight: 1.3,
                  [WIDE]: { display: 'block' },
                }}
              >
                {estimate}
                {formatCents(day.earnedCents)}
              </Typography>
              {day.timeMs > 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'none', lineHeight: 1.3, [WIDE]: { display: 'block' } }}
                >
                  {formatDurationCompact(day.timeMs)}
                </Typography>
              )}
            </Box>
          )}

          {goalPercent !== null && (
            <LinearProgress
              variant="determinate"
              value={Math.min(100, goalPercent)}
              color={goalPercent >= 100 ? 'success' : 'primary'}
              aria-hidden
              sx={{ height: 3, borderRadius: 2 }}
            />
          )}

          {/* Narrow: a dot per kind */}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto', [WIDE]: { display: 'none' } }}>
            {day.releasedCents > 0 && <Dot tone="info" hollow={day.releasesAhead} />}
            {day.withdrawals.length > 0 && <Dot tone="success" />}
            {(day.opensAtMs !== null || day.openNow) && <Dot tone="success" hollow />}
          </Box>

          {/* Wide: labelled badges */}
          <Box sx={{ display: 'none', flexDirection: 'column', gap: 0.5, mt: 'auto', [WIDE]: { display: 'flex' } }}>
            <DayBadges day={day} />
          </Box>
        </Box>
      </ButtonBase>
    </Box>
  );
}
