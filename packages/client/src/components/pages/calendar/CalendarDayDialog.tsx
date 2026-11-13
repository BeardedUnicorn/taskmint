/**
 * One day from the Calendar: each task's tracked and reported time and its
 * amount, the money released that day (from earlier work days), the
 * withdrawals made that day, and the next withdrawal's opening when it falls
 * on the day. The arrows step to the day before or after.
 */

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Savings as SavingsIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import { usePayoutData } from '../../../hooks/usePayoutData';
import { useWithdrawals } from '../../../hooks/useWithdrawals';
import { Withdrawal } from '../../../types/withdrawal';
import { formatCents, formatPayoutAmount } from '../../../utils/payoutCalculator';
import { formatDate } from '../../../utils/formatters';
import { formatClockTime, formatWeekdayDate } from '../../../utils/locale';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { MONO } from '../payouts/payoutStyles';
import { RecordWithdrawalDialog } from '../payouts/withdrawals/RecordWithdrawalDialog';
import { buildDayBreakdown } from './calendarMonth';
import { minutes, NOTHING_ON_DAY, OpeningAlert, Section, StatusChips, sumBy } from './dayBreakdownParts';

interface CalendarDayDialogProps {
  /** YYYY-MM-DD, or null when closed */
  date: string | null;
  onChangeDate: (date: string) => void;
  onClose: () => void;
}

export function CalendarDayDialog({ date, onChangeDate, onClose }: CalendarDayDialogProps) {
  const { cells, events, plan, nowMs, today } = usePayoutData();
  const { withdrawals, deleteWithdrawal } = useWithdrawals();
  const [editing, setEditing] = useState<Withdrawal | 'new' | null>(null);
  if (!date) return null;

  const { worked, released, withdrawn, opening } = buildDayBreakdown(date, { cells, events, withdrawals, plan });
  const step = (days: number) => onChangeDate(dayjs(date).add(days, 'day').format('YYYY-MM-DD'));

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="calendar-day-title"
      // Pinned to the top: centred, it moves with each day's height, and the
      // day arrows would slide out from under the pointer. (A phone shows
      // days in the Calendar's agenda instead.)
      sx={{
        '& .MuiDialog-container': { alignItems: 'flex-start' },
        '& .MuiDialog-paper': { mt: '8vh' },
      }}
    >
      <DialogTitle id="calendar-day-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" sx={{ flex: 1 }}>
          {formatDate(parseDateStringLocal(date))}
        </Box>
        <IconButton aria-label="Previous day" onClick={() => step(-1)}>
          <ChevronLeft />
        </IconButton>
        <IconButton aria-label="Next day" onClick={() => step(1)}>
          <ChevronRight />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {opening && <OpeningAlert opening={opening} />}

        {worked.length === 0 && released.length === 0 && withdrawn.length === 0 && (
          <Typography color="text.secondary">{NOTHING_ON_DAY}</Typography>
        )}

        {worked.length > 0 && (
          <Section title="Worked">
            <TableContainer>
              <Table size="small" aria-label="Worked">
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    <TableCell align="right">Tracked</TableCell>
                    <TableCell align="right">Reported</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {worked.map(cell => (
                    <TableRow key={cell.taskId}>
                      <TableCell>{cell.taskName}</TableCell>
                      <TableCell align="right" sx={MONO}>
                        {minutes(cell.trackedMs)}
                      </TableCell>
                      <TableCell align="right" sx={MONO}>
                        {minutes(cell.importedMinutes * 60_000)}
                      </TableCell>
                      <TableCell align="right" sx={MONO}>
                        {formatPayoutAmount(cell.actualCents, cell.estimatedCents)}
                      </TableCell>
                      <TableCell>
                        <StatusChips statuses={cell.isEstimate ? ['Estimate'] : cell.statuses} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {worked.length > 1 && (
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                      <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                        {minutes(sumBy(worked, cell => cell.trackedMs))}
                      </TableCell>
                      <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                        {minutes(sumBy(worked, cell => cell.importedMinutes * 60_000))}
                      </TableCell>
                      <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                        {formatPayoutAmount(
                          sumBy(worked, cell => cell.actualCents),
                          sumBy(worked, cell => cell.estimatedCents)
                        )}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        )}

        {released.length > 0 && (
          <Section title="Released">
            <TableContainer>
              <Table size="small" aria-label="Released">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Task</TableCell>
                    <TableCell>Worked on</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {released.map((event, index) => (
                    <TableRow key={`${event.taskId}-${event.releaseMs}-${index}`}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {event.releaseTime ? formatClockTime(event.releaseMs) : '—'}
                        {event.releaseMs > nowMs && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            upcoming
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{event.taskName}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {formatWeekdayDate(parseDateStringLocal(event.workDay))}
                      </TableCell>
                      <TableCell align="right" sx={MONO}>
                        {formatPayoutAmount(event.actualCents, event.estimatedCents)}
                      </TableCell>
                      <TableCell>
                        <StatusChips statuses={[event.status ?? 'Estimate']} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        )}

        {withdrawn.length > 0 && (
          <Section title="Withdrawals">
            <TableContainer>
              <Table size="small" aria-label="Withdrawals">
                <TableBody>
                  {withdrawn.map(withdrawal => {
                    const at = formatClockTime(withdrawal.takenAt);
                    return (
                      <TableRow key={withdrawal.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{at}</TableCell>
                        <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                          {formatCents(withdrawal.amountCents)}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{withdrawal.note ?? ''}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              aria-label={`Edit the withdrawal at ${at}`}
                              onClick={() => setEditing(withdrawal)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              aria-label={`Delete the withdrawal at ${at}`}
                              onClick={() => deleteWithdrawal(withdrawal.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        )}
      </DialogContent>
      <DialogActions>
        {date <= today && (
          <Button startIcon={<SavingsIcon />} onClick={() => setEditing('new')} sx={{ mr: 'auto' }}>
            Record withdrawal on this day
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      {editing && (
        <RecordWithdrawalDialog
          withdrawal={editing === 'new' ? undefined : editing}
          initialDay={date}
          onClose={() => setEditing(null)}
        />
      )}
    </Dialog>
  );
}
