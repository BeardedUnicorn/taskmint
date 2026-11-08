/**
 * One day on the Calendar: its date, what was earned and tracked, a bar
 * toward the daily goal, and badges for money released, withdrawals, and the
 * next withdrawal's opening (its time; the legend says what it is). A button
 * that opens the day's breakdown.
 *
 * Narrow grids show whole dollars and coloured dots; wider ones (a container
 * query on the grid, see MonthGrid) show cents, time and labelled badges.
 */

import { ReactNode } from 'react';
import { Box, ButtonBase, LinearProgress, Typography } from '@mui/material';
import { alpha, Theme } from '@mui/material/styles';
import { ArrowDownward as ReleaseIcon, Savings as WithdrawalIcon, Schedule as OpensIcon } from '@mui/icons-material';
import { formatCents, formatWholeCents } from '../../../utils/payoutCalculator';
import { formatDate, formatDurationCompact } from '../../../utils/formatters';
import { formatClockTime } from '../../../utils/locale';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { CalendarDay } from './calendarMonth';

/** The grid is wide enough for cents, time and labelled badges. */
export const WIDE = '@container calendar (min-width: 640px)';

type Tone = 'info' | 'success';

/** A tone's text colour that stays readable on its own tint, in either mode. */
const toneText = (tone: Tone) => (theme: Theme) =>
  theme.palette.mode === 'dark' ? theme.palette[tone].light : theme.palette[tone].dark;

/** The day in words, for screen readers. */
export function describeDay(day: CalendarDay): string {
  const parts: string[] = [];
  if (day.earnedCents > 0 || day.timeMs > 0) {
    const earned = `earned ${day.estimatedCents > 0 ? 'about ' : ''}${formatCents(day.earnedCents)}`;
    parts.push(day.timeMs > 0 ? `worked ${formatDurationCompact(day.timeMs)}, ${earned}` : earned);
  }
  if (day.releasedCents > 0) {
    parts.push(`${formatCents(day.releasedCents)} ${day.releasesAhead ? 'to be released' : 'released'}`);
  }
  for (const withdrawal of day.withdrawals) {
    parts.push(`withdrew ${formatCents(withdrawal.amountCents)} at ${formatClockTime(withdrawal.takenAt)}`);
  }
  if (day.opensAtMs !== null) parts.push(`next withdrawal opens at ${formatClockTime(day.opensAtMs)}`);
  if (day.openNow) parts.push('withdrawal open now');
  return `${formatDate(parseDateStringLocal(day.date))}: ${parts.length > 0 ? parts.join('; ') : 'nothing tracked'}`;
}

function Badge({
  tone,
  dashed = false,
  icon,
  children,
}: {
  tone: Tone;
  dashed?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={theme => ({
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minWidth: 0,
        px: 0.75,
        py: '1px',
        borderRadius: 1,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${alpha(theme.palette[tone].main, dashed ? 0.7 : 0)}`,
        bgcolor: dashed ? 'transparent' : alpha(theme.palette[tone].main, 0.14),
        color: toneText(tone)(theme),
        '& svg': { fontSize: 13, flexShrink: 0 },
      })}
    >
      {icon}
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function Dot({ tone, hollow = false }: { tone: Tone; hollow?: boolean }) {
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
  const worked = day.earnedCents > 0 || day.timeMs > 0;
  const estimate = day.estimatedCents > 0 ? '~' : '';
  const goalPercent = day.goal && worked ? Math.min(100, (day.earnedCents / 100 / day.goal) * 100) : null;
  const releaseEstimate = day.releasedEstimatedCents > 0 ? '~' : '';

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
          '&:hover': { bgcolor: theme.palette.action.hover },
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
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
              value={goalPercent}
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
            {day.releasedCents > 0 && (
              <Badge tone="info" dashed={day.releasesAhead} icon={<ReleaseIcon />}>
                {releaseEstimate}
                {formatCents(day.releasedCents)}
              </Badge>
            )}
            {day.withdrawals.map(withdrawal => (
              <Badge key={withdrawal.id} tone="success" icon={<WithdrawalIcon />}>
                {formatCents(withdrawal.amountCents)}
              </Badge>
            ))}
            {day.opensAtMs !== null && (
              <Badge tone="success" dashed icon={<OpensIcon />}>
                {formatClockTime(day.opensAtMs)}
              </Badge>
            )}
            {day.openNow && (
              <Badge tone="success" dashed icon={<OpensIcon />}>
                Open now
              </Badge>
            )}
          </Box>
        </Box>
      </ButtonBase>
    </Box>
  );
}
