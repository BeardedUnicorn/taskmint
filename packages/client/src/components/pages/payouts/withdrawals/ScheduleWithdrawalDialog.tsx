/**
 * Schedule the next withdrawal for an upcoming release: TaskMint reminds you
 * when it's ready (at the release, or when withdrawals open if the release
 * is held by the wait between them), with what it will take then. One is
 * scheduled at a time, so this replaces any other; on the scheduled release
 * it offers to remove it.
 */

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { usePayoutData } from '../../../../hooks/usePayoutData';
import { useWithdrawals } from '../../../../hooks/useWithdrawals';
import { ReleaseScheduleRow, formatCents } from '../../../../utils/payoutCalculator';
import { formatWeekdayDateTime } from '../../../../utils/locale';
import { scheduledFor } from '../../../../utils/withdrawals';
import { MONO } from '../payoutStyles';
import { amountNotes } from './NextWithdrawalPanel';

export interface ScheduleWithdrawalDialogProps {
  /** The release to schedule the withdrawal for. */
  row: ReleaseScheduleRow;
  onClose: () => void;
}

export function ScheduleWithdrawalDialog({ row, onClose }: ScheduleWithdrawalDialogProps) {
  const { plan, events, reminder, withdrawalIntervalDays } = usePayoutData();
  const { scheduleWithdrawal, cancelScheduledWithdrawal } = useWithdrawals();

  const { dueMs, isHeld, amount } = scheduledFor(row.releaseMs, plan, events);
  const isScheduled = reminder?.releaseMs === row.releaseMs;
  const notes = amount && amountNotes(amount);
  const every = `${withdrawalIntervalDays} day${withdrawalIntervalDays === 1 ? '' : 's'}`;

  const schedule = () => {
    scheduleWithdrawal(row.releaseMs);
    onClose();
  };
  const remove = () => {
    cancelScheduledWithdrawal();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isScheduled ? 'Scheduled withdrawal' : 'Schedule withdrawal'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <div>
            <Typography variant="overline" component="p" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              {isScheduled ? "You'll be reminded" : 'Remind me'}
            </Typography>
            <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
              {formatWeekdayDateTime(dueMs)}
            </Typography>
          </div>

          {amount ? (
            <div>
              <Typography variant="overline" component="p" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                It will be
              </Typography>
              <Typography variant="h5" component="p" sx={{ ...MONO, fontWeight: 700, color: 'success.main' }}>
                {amount.estimatedCents > 0 ? '~' : ''}
                {formatCents(amount.totalCents)}
              </Typography>
              {notes && (
                <Typography variant="body2" color="text.secondary">
                  {notes}
                </Typography>
              )}
            </div>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Record your last withdrawal to see how much this one will be.
            </Typography>
          )}

          {isHeld && (
            <Alert severity="info">
              This release on {formatWeekdayDateTime(row.releaseMs)} lands before your next withdrawal opens (the site
              allows one every {every}), so the reminder comes when it opens.
            </Alert>
          )}
          {reminder && !isScheduled && (
            <Typography variant="body2" color="text.secondary">
              This replaces your reminder for {formatWeekdayDateTime(reminder.dueMs)}.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {isScheduled ? (
          <>
            <Button onClick={remove} color="error">
              Remove reminder
            </Button>
            <Button onClick={onClose} variant="contained" autoFocus>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} color="secondary">
              Cancel
            </Button>
            <Button onClick={schedule} variant="contained" autoFocus>
              Schedule
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
