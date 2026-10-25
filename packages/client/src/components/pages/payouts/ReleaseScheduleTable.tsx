/**
 * Payouts' upcoming releases: when imported and estimated money becomes
 * available.
 */

import { Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ReleaseScheduleRow, centsToDollars } from '../../../utils/payoutCalculator';
import { formatCurrency } from '../../../utils/formatters';
import { MONO } from './payoutStyles';

export function ReleaseScheduleTable({ schedule }: { schedule: ReleaseScheduleRow[] }) {
  if (schedule.length === 0) return null;
  return (
    <Paper sx={{ p: 3, mb: 4 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Upcoming releases
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Release date</TableCell>
            <TableCell align="right">Imported</TableCell>
            <TableCell align="right">Estimated</TableCell>
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {schedule.map((row, idx) => (
            <TableRow key={row.releaseIso ?? `${row.releaseDay}-${row.releaseTime ?? ''}-${idx}`}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Typography variant="body2">{row.releaseDay}</Typography>
                {row.releaseTime && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {row.releaseTime}
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right" sx={MONO}>
                {row.actualCents > 0
                  ? formatCurrency(centsToDollars(row.actualCents))
                  : '—'}
              </TableCell>
              <TableCell align="right" sx={{ ...MONO, color: 'text.secondary' }}>
                {row.estimatedCents > 0
                  ? `~${formatCurrency(centsToDollars(row.estimatedCents))}`
                  : '—'}
              </TableCell>
              <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                {formatCurrency(centsToDollars(row.actualCents + row.estimatedCents))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
