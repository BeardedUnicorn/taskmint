/**
 * A day's labelled badges: money released (dashed while still to come), each
 * withdrawal, and the next withdrawal's opening time or "Open now". The
 * Calendar's legend explains their icons. A wide month grid and the phone's
 * agenda both show them.
 */

import { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha, Theme } from '@mui/material/styles';
import { ArrowDownward as ReleaseIcon, Savings as WithdrawalIcon, Schedule as OpensIcon } from '@mui/icons-material';
import { formatCents } from '../../../utils/payoutCalculator';
import { formatClockTime } from '../../../utils/locale';
import { CalendarDay } from './calendarMonth';

type Tone = 'info' | 'success';

/** A tone's text colour that stays readable on its own tint, in either mode. */
const toneText = (tone: Tone) => (theme: Theme) =>
  theme.palette.mode === 'dark' ? theme.palette[tone].light : theme.palette[tone].dark;

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

/** The day's badges, as siblings for the caller to lay out (a column in a grid cell, a wrapping row in the agenda). */
export function DayBadges({ day }: { day: CalendarDay }) {
  return (
    <>
      {day.releasedCents > 0 && (
        <Badge tone="info" dashed={day.releasesAhead} icon={<ReleaseIcon />}>
          {day.releasedEstimatedCents > 0 ? '~' : ''}
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
    </>
  );
}
