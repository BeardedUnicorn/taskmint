/**
 * Payouts' list of recorded withdrawals, newest first, to edit or delete
 * (with Undo). A phone lists them as rows, their actions behind ⋮.
 */

import { useState } from 'react';
import {
  Box,
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
import { Delete as DeleteIcon, Edit as EditIcon, Savings as SavingsIcon } from '@mui/icons-material';
import { useWithdrawals } from '../../../../hooks/useWithdrawals';
import { Withdrawal } from '../../../../types/withdrawal';
import { formatCents } from '../../../../utils/payoutCalculator';
import { formatShortDateTime, formatWeekdayDateTime } from '../../../../utils/locale';
import { EmptyState } from '../../../ui/display/EmptyState';
import { MONO } from '../payoutStyles';
import { VISUALLY_HIDDEN } from '../../../ui/visuallyHidden';
import { PHONE } from '../../../../theme/media';
import { PHONE_TABLE } from '../../../ui/tables/tableStyles';
import { RecordWithdrawalDialog } from './RecordWithdrawalDialog';
import { RowMenu, StackedList, StackedRow } from '../../../ui/tables/StackedRows';
import { useCompactLayout } from '../../../../hooks/useCompactLayout';

export function WithdrawalsCard() {
  const { withdrawals, loadError, deleteWithdrawal } = useWithdrawals();
  const [editing, setEditing] = useState<Withdrawal | null>(null);
  const compact = useCompactLayout();
  // The panel above reports an unreadable record
  if (loadError) return null;

  const newestFirst = [...withdrawals].reverse();
  const totalCents = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amountCents, 0);

  return (
    <Paper sx={{ p: 3, mb: 4, [PHONE]: { p: 2 } }}>
      <Typography variant="h6">Withdrawals</Typography>
      {withdrawals.length === 0 ? (
        <EmptyState
          plain
          icon={<SavingsIcon />}
          title="No withdrawals recorded"
          description="Record one when you withdraw from the payment site, and TaskMint works out when the next one opens."
        />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {withdrawals.length} recorded · {formatCents(totalCents)} in all
          </Typography>
          {compact ? (
            <StackedList label="Withdrawals">
              {newestFirst.map(withdrawal => {
                const when = formatShortDateTime(withdrawal.takenAt);
                return (
                  <StackedRow
                    key={withdrawal.id}
                    title={formatWeekdayDateTime(withdrawal.takenAt)}
                    figure={formatCents(withdrawal.amountCents)}
                    details={withdrawal.note}
                    actions={
                      <RowMenu
                        label={`Actions for the withdrawal on ${when}`}
                        actions={[
                          { label: 'Edit', icon: <EditIcon fontSize="small" />, onClick: () => setEditing(withdrawal) },
                          {
                            label: 'Delete',
                            icon: <DeleteIcon fontSize="small" />,
                            onClick: () => deleteWithdrawal(withdrawal.id),
                            danger: true,
                          },
                        ]}
                      />
                    }
                  />
                );
              })}
            </StackedList>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Withdrawals" sx={PHONE_TABLE}>
                <TableHead>
                  <TableRow>
                    <TableCell>Date and time</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell align="right" sx={{ width: 96 }}>
                      <Box component="span" sx={VISUALLY_HIDDEN}>
                        Actions
                      </Box>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {newestFirst.map(withdrawal => {
                    const when = formatShortDateTime(withdrawal.takenAt);
                    return (
                      <TableRow key={withdrawal.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWeekdayDateTime(withdrawal.takenAt)}</TableCell>
                        <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                          {formatCents(withdrawal.amountCents)}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{withdrawal.note ?? '—'}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              aria-label={`Edit the withdrawal on ${when}`}
                              onClick={() => setEditing(withdrawal)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              aria-label={`Delete the withdrawal on ${when}`}
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
          )}
        </>
      )}
      {editing && <RecordWithdrawalDialog withdrawal={editing} onClose={() => setEditing(null)} />}
    </Paper>
  );
}
