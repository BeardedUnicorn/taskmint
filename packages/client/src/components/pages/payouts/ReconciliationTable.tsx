/**
 * Payouts' daily reconciliation: tracked against reported time and the
 * amount per task and day, grouped by month. The current month starts open
 * (or the newest, when this month has nothing yet); clicking a month flips it.
 */

import { Fragment, useState } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { PayoutDayCell, PayoutMonthGroup, formatPayoutAmount } from '../../../utils/payoutCalculator';
import { formatDuration } from '../../../utils/formatters';
import { MONO } from './payoutStyles';
import { PHONE } from '../../../theme/media';
import { PHONE_TABLE } from '../../ui/tables/tableStyles';

function deltaLabel(cell: PayoutDayCell): { text: string; color: string } {
  const deltaMinutes = cell.importedMinutes - cell.trackedMs / 60_000;
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return { text: '±0m', color: 'text.secondary' };
  const text = `${rounded > 0 ? '+' : '−'}${formatDuration(Math.abs(rounded) * 60_000)}`;
  return { text, color: rounded > 0 ? 'success.main' : 'error.main' };
}

export function ReconciliationTable({ monthGroups, today }: { monthGroups: PayoutMonthGroup[]; today: string }) {
  const currentMonth = today.slice(0, 7);
  const defaultOpenMonth = monthGroups.some(group => group.month === currentMonth)
    ? currentMonth
    : monthGroups[0]?.month;
  const [toggledMonths, setToggledMonths] = useState<Set<string>>(() => new Set());
  const isMonthOpen = (month: string) => (month === defaultOpenMonth) !== toggledMonths.has(month);
  const toggleMonth = (month: string) =>
    setToggledMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });

  return (
    <Paper sx={{ p: 3, [PHONE]: { p: 2 } }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Daily reconciliation
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={PHONE_TABLE}>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Task</TableCell>
              <TableCell align="right">Tracked</TableCell>
              <TableCell align="right">Reported</TableCell>
              <TableCell align="right">Δ</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Available on</TableCell>
              <TableCell>Source</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {monthGroups.map(group => {
              const open = isMonthOpen(group.month);
              const label = dayjs(`${group.month}-01`).format('MMMM YYYY');
              return (
                <Fragment key={group.month}>
                  <TableRow
                    hover
                    onClick={() => toggleMonth(group.month)}
                    sx={{ cursor: 'pointer', bgcolor: 'action.hover' }}
                  >
                    <TableCell colSpan={2} sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton size="small" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${label}`}>
                          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {label}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                      {group.trackedMs > 0 ? formatDuration(group.trackedMs) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                      {group.importedMinutes > 0 ? formatDuration(group.importedMinutes * 60_000) : '—'}
                    </TableCell>
                    <TableCell />
                    <TableCell align="right" sx={{ ...MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatPayoutAmount(group.actualCents, group.estimatedCents)}
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                  {open &&
                    group.cells.map(cell => {
                      const hasImportedTime = cell.importedMinutes > 0;
                      const delta = deltaLabel(cell);
                      return (
                        <TableRow key={`${cell.taskId}-${cell.workDay}`}>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{cell.workDay}</TableCell>
                          <TableCell>{cell.taskName}</TableCell>
                          <TableCell align="right" sx={MONO}>
                            {cell.trackedMs > 0 ? formatDuration(cell.trackedMs) : '—'}
                          </TableCell>
                          <TableCell align="right" sx={MONO}>
                            {hasImportedTime ? formatDuration(cell.importedMinutes * 60_000) : '—'}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ ...MONO, color: hasImportedTime ? delta.color : 'text.secondary' }}
                          >
                            {hasImportedTime ? delta.text : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ ...MONO, whiteSpace: 'nowrap' }}>
                            {formatPayoutAmount(cell.actualCents, cell.estimatedCents)}
                          </TableCell>
                          <TableCell>
                            {cell.statuses.map(status => (
                              <Chip key={status} label={status} size="small" variant="outlined" sx={{ mr: 0.5 }} />
                            ))}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {cell.actualCents > 0 || cell.estimatedCents > 0 ? cell.releaseDay : '—'}
                          </TableCell>
                          <TableCell>
                            {cell.actualCents > 0 ? (
                              <Chip label="Actual" size="small" color="success" />
                            ) : cell.isEstimate ? (
                              <Chip label="Estimate" size="small" color="warning" variant="outlined" />
                            ) : (
                              <Chip label="Tracked only" size="small" variant="outlined" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Statuses are shown as the site reported them; all imported amounts count toward availability by work day.
        Estimates use the rate each timer was tracked at, the same amounts History and the Calendar show.
      </Typography>
    </Paper>
  );
}
