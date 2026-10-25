/**
 * Calendar Day Dialog
 *
 * One day from the Calendar: each task's time and amount worked that day,
 * and the money released that day (from earlier work days).
 */

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { PayoutDayCell, formatPayoutAmount } from '../../../utils/payoutCalculator';
import { formatDate, formatDuration } from '../../../utils/formatters';
import { parseDateStringLocal } from '../../../utils/dateHelpers';

interface CalendarDayDialogProps {
  /** YYYY-MM-DD, or null when closed */
  date: string | null;
  cells: PayoutDayCell[];
  onClose: () => void;
}

const MONO = { fontFamily: '"Roboto Mono", monospace' } as const;

/** Time on the day: tracked, else what the site reported. */
function cellTimeMs(cell: PayoutDayCell): number {
  return cell.trackedMs > 0 ? cell.trackedMs : cell.importedMinutes * 60_000;
}

export function CalendarDayDialog({ date, cells, onClose }: CalendarDayDialogProps) {
  if (!date) return null;

  const worked = cells.filter(
    cell =>
      cell.workDay === date && (cellTimeMs(cell) > 0 || cell.actualCents + cell.estimatedCents > 0)
  );
  const released = cells.filter(
    cell => cell.releaseDay === date && cell.actualCents + cell.estimatedCents > 0
  );
  const sum = (list: PayoutDayCell[], pick: (cell: PayoutDayCell) => number) =>
    list.reduce((total, cell) => total + pick(cell), 0);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{formatDate(parseDateStringLocal(date))}</DialogTitle>
      <DialogContent>
        {worked.length === 0 && released.length === 0 && (
          <Typography color="text.secondary">Nothing tracked or released on this day.</Typography>
        )}

        {worked.length > 0 && (
          <Box sx={{ mb: released.length > 0 ? 3 : 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Worked
            </Typography>
            <Table size="small" aria-label="Worked">
              <TableHead>
                <TableRow>
                  <TableCell>Task</TableCell>
                  <TableCell align="right">Time</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {worked.map(cell => (
                  <TableRow key={cell.taskId}>
                    <TableCell>{cell.taskName}</TableCell>
                    <TableCell align="right" sx={MONO}>
                      {formatDuration(cellTimeMs(cell))}
                    </TableCell>
                    <TableCell align="right" sx={MONO}>
                      {formatPayoutAmount(cell.actualCents, cell.estimatedCents)}
                    </TableCell>
                  </TableRow>
                ))}
                {worked.length > 1 && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                    <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                      {formatDuration(sum(worked, cellTimeMs))}
                    </TableCell>
                    <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                      {formatPayoutAmount(
                        sum(worked, cell => cell.actualCents),
                        sum(worked, cell => cell.estimatedCents)
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        )}

        {released.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Released
            </Typography>
            <Table size="small" aria-label="Released">
              <TableHead>
                <TableRow>
                  <TableCell>Task</TableCell>
                  <TableCell>Worked on</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {released.map(cell => (
                  <TableRow key={`${cell.taskId}-${cell.workDay}`}>
                    <TableCell>{cell.taskName}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{cell.workDay}</TableCell>
                    <TableCell align="right" sx={MONO}>
                      {formatPayoutAmount(cell.actualCents, cell.estimatedCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
