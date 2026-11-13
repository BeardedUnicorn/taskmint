/**
 * Pieces a day's breakdown is built from, in the desktop's day dialog
 * (tables) and the phone's agenda (stacked rows): a titled section, the
 * site's status chips, and the opening notice.
 */

import { ReactNode } from 'react';
import { Alert, Box, Chip, Typography } from '@mui/material';
import { formatCents } from '../../../utils/payoutCalculator';
import { formatDurationCompact } from '../../../utils/formatters';
import { formatClockTime } from '../../../utils/locale';
import { WithdrawalPlan } from '../../../utils/withdrawals';

/** A duration, or a dash for none. */
export const minutes = (ms: number) => (ms > 0 ? formatDurationCompact(ms) : '—');

export const sumBy = <T,>(list: T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title} sx={{ '& + &': { mt: 3 } }}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function StatusChips({ statuses }: { statuses: string[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {statuses.map(status => (
        <Chip key={status} label={status} size="small" variant="outlined" />
      ))}
    </Box>
  );
}

/** "Your next withdrawal opens at 6:25 PM: ~$15.00." */
export function OpeningAlert({ opening }: { opening: WithdrawalPlan }) {
  return (
    <Alert severity="info" sx={{ mb: 3 }}>
      Your next withdrawal opens at {formatClockTime(opening.opensAtMs)}: {opening.next.estimatedCents > 0 ? '~' : ''}
      {formatCents(opening.next.totalCents)}.
    </Alert>
  );
}

export const NOTHING_ON_DAY = 'Nothing tracked, released or withdrawn on this day.';
