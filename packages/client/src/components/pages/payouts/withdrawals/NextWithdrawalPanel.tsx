/**
 * When the next withdrawal opens and how much it will be, with what waiting
 * longer would add, a button to record one, and the withdrawal you scheduled
 * from the upcoming releases (to remove it). On the Calendar and Payouts.
 */

import { ReactNode, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { AlarmOn as AlarmOnIcon, ExpandMore as ExpandMoreIcon, Savings as SavingsIcon } from '@mui/icons-material';
import { usePayoutData } from '../../../../hooks/usePayoutData';
import { useWithdrawals } from '../../../../hooks/useWithdrawals';
import { formatCents } from '../../../../utils/payoutCalculator';
import { formatCountdown } from '../../../../utils/formatters';
import { formatWeekdayDateTime } from '../../../../utils/locale';
import { WaitStep, WithdrawableAmount, WithdrawalReminder } from '../../../../utils/withdrawals';
import { MONO } from '../payoutStyles';
import { RecordWithdrawalDialog } from './RecordWithdrawalDialog';
import { PHONE } from '../../../../theme/media';
import { PHONE_TABLE } from '../../../ui/tables/tableStyles';

/** "includes ~$80.00 estimated · $800.00 awaiting site approval", or null when it's all settled money. */
export function amountNotes(amount: WithdrawableAmount): string | null {
  const notes = [
    amount.estimatedCents > 0 && `includes ~${formatCents(amount.estimatedCents)} estimated from tracked time`,
    amount.pastDueCents > 0 && `${formatCents(amount.pastDueCents)} still awaiting the site's approval`,
  ].filter(Boolean);
  return notes.length > 0 ? notes.join(' · ') : null;
}

function IfYouWait({ steps }: { steps: WaitStep[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Button
        size="small"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
      >
        If you wait
      </Button>
      <Collapse in={open} unmountOnExit>
        <TableContainer sx={{ mt: 1 }}>
          <Table size="small" aria-label="If you wait" sx={PHONE_TABLE}>
            <TableHead>
              <TableRow>
                <TableCell>Withdraw after</TableCell>
                <TableCell align="right">Adds</TableCell>
                <TableCell align="right">Withdrawal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {steps.map(step => (
                <TableRow key={step.atMs}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWeekdayDateTime(step.atMs)}</TableCell>
                  <TableCell align="right" sx={MONO}>
                    +{step.hasEstimate ? '~' : ''}
                    {formatCents(step.addedCents)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...MONO, fontWeight: 600 }}>
                    {formatCents(step.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Box>
  );
}

/** "Reminder: Thu, Nov 12, 6:25 PM · ~$1,234.00", or that it's ready, with a button to remove it. */
function ScheduledLine({
  reminder,
  nowMs,
  onRemove,
}: {
  reminder: WithdrawalReminder;
  nowMs: number;
  onRemove: () => void;
}) {
  const { amount } = reminder;
  const when = formatWeekdayDateTime(reminder.dueMs);
  return (
    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <AlarmOnIcon fontSize="small" color="primary" />
      <Typography variant="body2">
        {reminder.dueMs > nowMs ? `Reminder: ${when}` : `Your scheduled withdrawal is ready (since ${when})`}
        {amount && ` · ${amount.estimatedCents > 0 ? '~' : ''}${formatCents(amount.totalCents)}`}
      </Typography>
      <Button size="small" onClick={onRemove} aria-label="Remove the scheduled withdrawal">
        Remove
      </Button>
    </Box>
  );
}

export function NextWithdrawalPanel() {
  const { plan, reminder, nowMs, withdrawalIntervalDays } = usePayoutData();
  const { loadError, cancelScheduledWithdrawal } = useWithdrawals();
  const [recording, setRecording] = useState(false);

  const recordButton = (primary: boolean) => (
    <Button
      variant={primary ? 'contained' : 'outlined'}
      startIcon={<SavingsIcon />}
      onClick={() => setRecording(true)}
      sx={{ flexShrink: 0 }}
    >
      Record withdrawal
    </Button>
  );

  let content: ReactNode;
  if (loadError) {
    content = <Alert severity="error">{loadError}</Alert>;
  } else if (plan === null) {
    content = (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: '1 1 320px' }}>
          <Typography variant="h6" component="h2">
            Track your withdrawals
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Record your most recent withdrawal from the payment site. TaskMint then shows when the next one opens and
            how much it will be.
          </Typography>
        </Box>
        {recordButton(true)}
      </Box>
    );
  } else {
    const { last, next, isOpen, opensAtMs } = plan;
    const notes = amountNotes(next);
    const every = `${withdrawalIntervalDays} day${withdrawalIntervalDays === 1 ? '' : 's'}`;
    content = (
      <>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 3 }}>
          <Box sx={{ flex: '1 1 220px' }}>
            <Typography
              variant="overline"
              component="h2"
              sx={{ color: isOpen ? 'success.main' : 'text.secondary', lineHeight: 1.5 }}
            >
              {isOpen ? 'Withdrawal open' : 'Next withdrawal'}
            </Typography>
            <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
              {isOpen ? 'You can withdraw now' : formatWeekdayDateTime(opensAtMs)}
            </Typography>
            {!isOpen && (
              <Typography variant="body2" color="text.secondary">
                in {formatCountdown(opensAtMs - nowMs)}
              </Typography>
            )}
          </Box>
          <Box sx={{ flex: '1 1 220px' }}>
            <Typography variant="overline" component="p" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              {isOpen ? 'Available' : 'It will be'}
            </Typography>
            <Typography
              variant="h4"
              component="p"
              sx={{ ...MONO, fontWeight: 700, color: next.totalCents > 0 ? 'success.main' : 'text.secondary' }}
            >
              {next.estimatedCents > 0 ? '~' : ''}
              {formatCents(next.totalCents)}
            </Typography>
            {notes && (
              <Typography variant="body2" color="text.secondary">
                {notes}
              </Typography>
            )}
          </Box>
          {recordButton(isOpen)}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Last withdrawal: {formatWeekdayDateTime(last.takenAt)} · {formatCents(last.amountCents)}. The site allows one
          every {every}.
        </Typography>
        <IfYouWait steps={plan.ifYouWait} />
      </>
    );
  }

  return (
    <Paper component="section" aria-label="Withdrawals" sx={{ p: 3, mb: 3, [PHONE]: { p: 2 } }}>
      {content}
      {reminder && !loadError && (
        <ScheduledLine reminder={reminder} nowMs={nowMs} onRemove={cancelScheduledWithdrawal} />
      )}
      {recording && <RecordWithdrawalDialog onClose={() => setRecording(false)} />}
    </Paper>
  );
}
