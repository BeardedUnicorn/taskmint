/**
 * Payouts' upcoming releases: when imported and estimated money becomes
 * available. A release before the next withdrawal opens is held by the wait
 * between withdrawals: it has a lock, and a line marks where withdrawals
 * open. Choosing a release schedules the next withdrawal for it
 * (ScheduleWithdrawalDialog).
 */

import { Fragment, useState } from 'react';
import {
  Box,
  Divider,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { AlarmAdd as AlarmAddIcon, AlarmOn as AlarmOnIcon, LockClock as LockClockIcon } from '@mui/icons-material';
import { usePayoutData } from '../../../hooks/usePayoutData';
import { ReleaseScheduleRow, centsToDollars } from '../../../utils/payoutCalculator';
import { formatCurrency } from '../../../utils/formatters';
import { formatWeekdayDateTime } from '../../../utils/locale';
import { heldUntilMs } from '../../../utils/withdrawals';
import { MONO } from './payoutStyles';
import { PHONE } from '../../../theme/media';
import { PHONE_TABLE } from '../../ui/tables/tableStyles';
import { VISUALLY_HIDDEN } from '../../ui/visuallyHidden';
import { ScheduleWithdrawalDialog } from './withdrawals/ScheduleWithdrawalDialog';

const COLUMNS = 5;
/** Room for the lock, so every row's date lines up. */
const LOCK_WIDTH = 20;

const rowKey = (row: ReleaseScheduleRow, idx: number) =>
  row.releaseIso ?? `${row.releaseDay}-${row.releaseTime ?? ''}-${idx}`;

export function ReleaseScheduleTable() {
  const { schedule, plan, reminder, withdrawalIntervalDays } = usePayoutData();
  const [choosing, setChoosing] = useState<ReleaseScheduleRow | null>(null);
  if (schedule.length === 0) return null;

  const heldUntil = heldUntilMs(plan);
  const isHeld = (row: ReleaseScheduleRow) => heldUntil !== null && row.releaseMs < heldUntil;
  // Soonest first, so the held ones come first and the line goes after them
  const heldCount = schedule.filter(isHeld).length;
  const opening = heldUntil === null ? '' : formatWeekdayDateTime(heldUntil);
  const every = `${withdrawalIntervalDays} day${withdrawalIntervalDays === 1 ? '' : 's'}`;

  return (
    <Paper sx={{ p: 3, mb: 4, [PHONE]: { p: 2 } }}>
      <Typography variant="h6">Upcoming releases</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: heldCount > 0 ? 0.5 : 2 }}>
        Choose a release to schedule your next withdrawal for it, and TaskMint reminds you when it's ready.
      </Typography>
      {heldCount > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 0.75 }}
        >
          <LockClockIcon fontSize="small" />
          Held until your next withdrawal opens on {opening}: the site allows one every {every}.
        </Typography>
      )}
      <TableContainer>
        <Table size="small" aria-label="Upcoming releases" sx={PHONE_TABLE}>
          <TableHead>
            <TableRow>
              <TableCell>Release date</TableCell>
              <TableCell align="right">Imported</TableCell>
              <TableCell align="right">Estimated</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right" sx={{ width: 56 }}>
                <Box component="span" sx={VISUALLY_HIDDEN}>
                  Schedule
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {schedule.map((row, idx) => {
              const held = isHeld(row);
              const scheduled = reminder?.releaseMs === row.releaseMs;
              const when = formatWeekdayDateTime(row.releaseMs);
              const label = scheduled
                ? `Scheduled withdrawal for the release on ${when}`
                : `Schedule a withdrawal for the release on ${when}`;
              return (
                <Fragment key={rowKey(row, idx)}>
                  <TableRow
                    hover
                    selected={scheduled}
                    // The button below is the keyboard's way in; a click anywhere on the row does the same
                    onClick={() => setChoosing(row)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Box sx={{ width: LOCK_WIDTH, flexShrink: 0, display: 'flex', color: 'text.secondary' }}>
                          {held && (
                            <Tooltip title={`Held until withdrawals open on ${opening}`}>
                              <LockClockIcon fontSize="small" titleAccess="Held" />
                            </Tooltip>
                          )}
                        </Box>
                        <div>
                          <Typography variant="body2">{row.releaseDay}</Typography>
                          {row.releaseTime && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {row.releaseTime}
                            </Typography>
                          )}
                        </div>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={MONO}>
                      {row.actualCents > 0 ? formatCurrency(centsToDollars(row.actualCents)) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ ...MONO, color: 'text.secondary' }}>
                      {row.estimatedCents > 0 ? `~${formatCurrency(centsToDollars(row.estimatedCents))}` : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                      {formatCurrency(centsToDollars(row.actualCents + row.estimatedCents))}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={scheduled ? 'Scheduled withdrawal' : 'Schedule withdrawal'}>
                        <IconButton size="small" aria-label={label} color={scheduled ? 'primary' : 'default'}>
                          {scheduled ? <AlarmOnIcon fontSize="small" /> : <AlarmAddIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  {idx === heldCount - 1 && (
                    <TableRow>
                      <TableCell colSpan={COLUMNS} sx={{ py: 0.5 }}>
                        <Divider
                          textAlign="left"
                          sx={{
                            typography: 'caption',
                            fontWeight: 600,
                            color: 'success.main',
                            '&::before, &::after': { borderColor: 'success.main' },
                            '&::before': { width: LOCK_WIDTH },
                          }}
                        >
                          Withdrawals open {opening}
                        </Divider>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {choosing && <ScheduleWithdrawalDialog row={choosing} onClose={() => setChoosing(null)} />}
    </Paper>
  );
}
