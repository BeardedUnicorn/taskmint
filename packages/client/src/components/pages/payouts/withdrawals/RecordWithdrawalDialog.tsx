/**
 * Record a withdrawal (or edit one): when it was made on the payment site and
 * how much it was. The amount starts at what TaskMint expects (the money
 * released since the withdrawal before it) until it's typed over.
 */

import { useMemo, useState } from 'react';
import { Alert, InputAdornment, Stack, TextField } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import { FormDialog } from '../../../ui/dialogs/FormDialog';
import { whenComplete } from '../../../ui/dialogs/AddTimeDialog';
import { usePayoutData } from '../../../../hooks/usePayoutData';
import { useWithdrawals } from '../../../../hooks/useWithdrawals';
import { Withdrawal } from '../../../../types/withdrawal';
import { formatCents } from '../../../../utils/payoutCalculator';
import { formatShortDateTime } from '../../../../utils/locale';
import { DAY_MS, withdrawableAt, withdrawalBefore, withdrawalTooClose } from '../../../../utils/withdrawals';

/** A little slack for a withdrawal recorded "now" a moment after the clock read. */
const FUTURE_TOLERANCE_MS = 60_000;

export interface RecordWithdrawalDialogProps {
  /** The withdrawal to edit; a new one when left out. */
  withdrawal?: Withdrawal;
  /** A new one's day (YYYY-MM-DD), e.g. from the Calendar's day view; today when left out. */
  initialDay?: string;
  onClose: () => void;
}

/** "1234.50" for an amount field. */
function centsToField(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Cents from what was typed ("$1,234.5" → 123450), or null when it isn't an amount. */
export function parseAmountCents(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Where a new withdrawal starts: now, or noon on an earlier day. */
function initialTakenAt(initialDay: string | undefined, nowMs: number): Dayjs {
  const now = dayjs(nowMs);
  if (!initialDay || initialDay >= now.format('YYYY-MM-DD')) return now;
  return dayjs(initialDay).hour(12);
}

export function RecordWithdrawalDialog({ withdrawal, initialDay, onClose }: RecordWithdrawalDialogProps) {
  const { events, nowMs, withdrawalIntervalDays } = usePayoutData();
  const { withdrawals, recordWithdrawal, updateWithdrawal } = useWithdrawals();

  const [takenAt, setTakenAt] = useState<Dayjs>(() =>
    withdrawal ? dayjs(withdrawal.takenAt) : initialTakenAt(initialDay, nowMs)
  );
  // Until typed over, a new withdrawal's amount follows what TaskMint expects
  const [amountText, setAmountText] = useState<string | null>(() =>
    withdrawal ? centsToField(withdrawal.amountCents) : null
  );
  const [note, setNote] = useState(withdrawal?.note ?? '');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

  const takenAtMs = takenAt.valueOf();
  // What a withdrawal then takes: what was released since the one before it
  const expected = useMemo(() => {
    const previous = withdrawalBefore(withdrawals, takenAtMs, withdrawal?.id);
    return previous ? { previous, amount: withdrawableAt(events, Date.parse(previous.takenAt), takenAtMs) } : null;
  }, [events, withdrawals, takenAtMs, withdrawal?.id]);
  const tooClose = withdrawalTooClose(withdrawals, takenAtMs, withdrawalIntervalDays * DAY_MS, withdrawal?.id);
  const shownAmount = amountText ?? (expected ? centsToField(expected.amount.totalCents) : '');

  const setTime = (next: Dayjs) => {
    setTakenAt(next);
    setTimeError(null);
  };

  const handleSubmit = () => {
    const amountCents = parseAmountCents(shownAmount);
    const time = takenAt.second(0).millisecond(0).toDate();
    const future = time.getTime() > Date.now() + FUTURE_TOLERANCE_MS;
    setAmountError(amountCents === null ? 'Enter the amount you withdrew, like 712.50' : null);
    setTimeError(future ? "A withdrawal can't be in the future" : null);
    if (amountCents === null || future) return;

    const input = { takenAt: time.toISOString(), amountCents, note };
    if (withdrawal) {
      updateWithdrawal(withdrawal.id, input);
    } else {
      recordWithdrawal(input);
    }
    onClose();
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <FormDialog
        onClose={onClose}
        title={withdrawal ? 'Edit withdrawal' : 'Record withdrawal'}
        onSubmit={handleSubmit}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2}>
            <DatePicker
              label="Date"
              value={takenAt}
              onChange={whenComplete(value =>
                setTime(takenAt.year(value.year()).month(value.month()).date(value.date()))
              )}
              disableFuture
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TimePicker
              label="Time"
              value={takenAt}
              onChange={whenComplete(value => setTime(takenAt.hour(value.hour()).minute(value.minute())))}
              slotProps={{ textField: { fullWidth: true, error: timeError !== null, helperText: timeError } }}
            />
          </Stack>

          <TextField
            label="Amount withdrawn"
            value={shownAmount}
            onChange={event => {
              setAmountText(event.target.value);
              setAmountError(null);
            }}
            error={amountError !== null}
            helperText={
              amountError ??
              (expected
                ? `TaskMint expects ${formatCents(expected.amount.totalCents)}${
                    expected.amount.estimatedCents > 0
                      ? ` (~${formatCents(expected.amount.estimatedCents)} of it estimated)`
                      : ''
                  }: what was released since your withdrawal on ${formatShortDateTime(expected.previous.takenAt)}.`
                : 'What the payment site paid out.')
            }
            slotProps={{
              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
              htmlInput: { inputMode: 'decimal' },
            }}
            fullWidth
          />

          <TextField label="Note (optional)" value={note} onChange={event => setNote(event.target.value)} fullWidth />

          {tooClose && (
            <Alert severity="warning">
              That's within {withdrawalIntervalDays} day{withdrawalIntervalDays === 1 ? '' : 's'} of your withdrawal on{' '}
              {formatShortDateTime(tooClose.takenAt)}. The payment site normally allows one withdrawal every{' '}
              {withdrawalIntervalDays} day{withdrawalIntervalDays === 1 ? '' : 's'}.
            </Alert>
          )}
        </Stack>
      </FormDialog>
    </LocalizationProvider>
  );
}
