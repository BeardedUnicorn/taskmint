/**
 * One day from the Calendar: each task's tracked and reported time and its
 * amount, the money released that day (from earlier work days), the
 * withdrawals made that day, and the next withdrawal's opening when it falls
 * on the day. The arrows step to the day before or after.
 */

import { ReactNode, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { formatDate, formatDurationCompact } from '../../../utils/formatters';
import { formatClockTime, formatWeekdayDate } from '../../../utils/locale';
import { formatDateString, parseDateStringLocal } from '../../../utils/dateHelpers';
import { MONO } from '../payouts/payoutStyles';
import { RecordWithdrawalDialog } from '../payouts/withdrawals/RecordWithdrawalDialog';
import { cellTimeMs } from './calendarMonth';
import { PHONE } from '../../../theme/media';
import { PHONE_TABLE } from '../../ui/tables/tableStyles';

interface CalendarDayDialogProps {
  /** YYYY-MM-DD, or null when closed */
  date: string | null;
  onChangeDate: (date: string) => void;
  onClose: () => void;
}

const minutes = (ms: number) => (ms > 0 ? formatDurationCompact(ms) : '—');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title} sx={{ '& + &': { mt: 3 } }}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function StatusChips({ statuses }: { statuses: string[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {statuses.map(status => (
        <Chip key={status} label={status} size="small" variant="outlined" />
      ))}
    </Box>
  );
}

export function CalendarDayDialog({ date, onChangeDate, onClose }: CalendarDayDialogProps) {
  const { cells, events, plan, nowMs, today } = usePayoutData();
  const { withdrawals, deleteWithdrawal } = useWithdrawals();
  const [editing, setEditing] = useState<Withdrawal | 'new' | null>(null);
  if (!date) return null;

  const worked = cells.filter(
    cell => cell.workDay === date && (cellTimeMs(cell) > 0 || cell.actualCents + cell.estimatedCents > 0)
  );
  const released = events.filter(event => formatDateString(new Date(event.releaseMs)) === date);
  const withdrawn = withdrawals.filter(withdrawal => formatDateString(withdrawal.takenAt) === date);
  const opening = plan && !plan.isOpen && formatDateString(new Date(plan.opensAtMs)) === date ? plan : null;
  const sum = <T,>(list: T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);
  const step = (days: number) => onChangeDate(dayjs(date).add(days, 'day').format('YYYY-MM-DD'));

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="calendar-day-title"
      // Pinned to the top: centred, it moves with each day's height, and the
      // day arrows would slide out from under the pointer
      // (On a phone it fills the screen, so from the very top)
      sx={{
        '& .MuiDialog-container': { alignItems: 'flex-start' },
        '& .MuiDialog-paper': { mt: '8vh' },
        [PHONE]: { '& .MuiDialog-paper': { mt: 0 } },
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
        {opening && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Your next withdrawal opens at {formatClockTime(opening.opensAtMs)}:{' '}
            {opening.next.estimatedCents > 0 ? '~' : ''}
            {formatCents(opening.next.totalCents)}.
          </Alert>
        )}

        {worked.length === 0 && released.length === 0 && withdrawn.length === 0 && (
          <Typography color="text.secondary">Nothing tracked, released or withdrawn on this day.</Typography>
        )}

        {worked.length > 0 && (
          <Section title="Worked">
            <TableContainer>
              <Table size="small" aria-label="Worked" sx={PHONE_TABLE}>
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
                        {minutes(sum(worked, cell => cell.trackedMs))}
                      </TableCell>
                      <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                        {minutes(sum(worked, cell => cell.importedMinutes * 60_000))}
                      </TableCell>
                      <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                        {formatPayoutAmount(
                          sum(worked, cell => cell.actualCents),
                          sum(worked, cell => cell.estimatedCents)
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
              <Table size="small" aria-label="Released" sx={PHONE_TABLE}>
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
              <Table size="small" aria-label="Withdrawals" sx={PHONE_TABLE}>
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
