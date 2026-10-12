/**
 * Add Time Dialog
 *
 * Logs time after the fact: a task, the day, when it started, and how long.
 * The backend stores it as a finished timer in its own "Manual" session on
 * that day, and refuses time that overlaps what's already tracked; that
 * reason is shown here.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import { Task } from '../../../types/task';
import { AddManualTimeInput, TaskSession } from '../../../types/timer';
import { orderTasksForStart } from '../../../utils/taskOrdering';
import { formatDuration } from '../../../utils/formatters';
import {
  DurationErrors,
  DurationFields,
  DurationInput,
  durationInputToMs,
  validateDuration,
  MS_PER_HOUR,
} from '../forms/DurationFields';

const MAX_DURATION_MS = 24 * MS_PER_HOUR;
/** Same allowance the backend gives "ends now" for clock skew. */
const FUTURE_TOLERANCE_MS = 60_000;
const PAST_DAY_DEFAULT_HOUR = 9;

/**
 * The opening default: the entry ends now (start = now − duration, to the
 * minute). Its day is the start's, which is yesterday just after midnight.
 */
export function endsNowStart(durationMs: number, now: Dayjs = dayjs()): Dayjs {
  return now.subtract(durationMs, 'millisecond').second(0).millisecond(0);
}

/**
 * Default start once a day has been picked: for today, the entry ends now
 * (kept on today if that would begin yesterday); for an earlier day, 9:00 AM.
 */
export function defaultStartFor(day: Dayjs, durationMs: number, now: Dayjs = dayjs()): Dayjs {
  if (day.isSame(now, 'day')) {
    const start = endsNowStart(durationMs, now);
    // A long entry ending now can begin yesterday; keep it on the chosen day.
    return start.isSame(day, 'day') ? start : day.startOf('day');
  }
  return day.hour(PAST_DAY_DEFAULT_HOUR).minute(0).second(0).millisecond(0);
}

/** The start instant: the chosen day at the chosen time of day. */
export function combineDayAndTime(day: Dayjs, time: Dayjs): Date {
  return day.hour(time.hour()).minute(time.minute()).second(0).millisecond(0).toDate();
}

/** Problems with the entry's timing, or null when it can be submitted. */
export function validateEntryTiming(
  start: Date,
  durationMs: number,
  nowMs: number = Date.now()
): string | null {
  if (durationMs > MAX_DURATION_MS) {
    return 'A time entry can be at most 24 hours';
  }
  if (start.getTime() + durationMs > nowMs + FUTURE_TOLERANCE_MS) {
    return 'This entry would end in the future. Choose an earlier start or a shorter duration.';
  }
  return null;
}

interface AddTimeDialogProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  sessions: TaskSession[];
  /** Rejects with the reason when the entry can't be added. */
  onAdd: (input: AddManualTimeInput) => Promise<unknown>;
}

const DEFAULT_DURATION: DurationInput = { hours: '1', minutes: '0' };

export function AddTimeDialog({ open, onClose, tasks, sessions, onAdd }: AddTimeDialogProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [duration, setDuration] = useState<DurationInput>(DEFAULT_DURATION);
  const [start, setStart] = useState<Dayjs>(() => endsNowStart(durationInputToMs(DEFAULT_DURATION)));
  const [day, setDay] = useState<Dayjs>(() => endsNowStart(durationInputToMs(DEFAULT_DURATION)).startOf('day'));
  // Until edited, the date and start follow the defaults: the entry ends now
  // (its date is the start's), or once a date is picked, defaultStartFor.
  const [dayEdited, setDayEdited] = useState(false);
  const [startEdited, setStartEdited] = useState(false);
  const [durationErrors, setDurationErrors] = useState<DurationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const options = useMemo(() => orderTasksForStart(tasks, sessions), [tasks, sessions]);
  const durationMs = durationInputToMs(duration);

  // Fresh form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    const opening = endsNowStart(durationInputToMs(DEFAULT_DURATION));
    setTask(null);
    setDuration(DEFAULT_DURATION);
    setStart(opening);
    setDay(opening.startOf('day'));
    setDayEdited(false);
    setStartEdited(false);
    setDurationErrors({});
    setFormError(null);
  }, [open]);

  useEffect(() => {
    if (startEdited) return;
    if (!dayEdited) {
      const next = endsNowStart(durationMs);
      setStart(next);
      // Same-day updates keep the state object, so this doesn't re-run itself
      setDay(prev => (prev.isSame(next, 'day') ? prev : next.startOf('day')));
    } else {
      setStart(defaultStartFor(day, durationMs));
    }
  }, [day, dayEdited, durationMs, startEdited]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validateDuration(duration);
    setDurationErrors(errors);
    if (!task) {
      setFormError('Choose a task');
      return;
    }
    if (Object.keys(errors).length > 0) {
      setFormError(null);
      return;
    }
    const startTime = combineDayAndTime(day, start);
    const timingError = validateEntryTiming(startTime, durationMs);
    if (timingError) {
      setFormError(timingError);
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      await onAdd({ taskId: task.id, taskName: task.name, startTime, durationMs });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Time</DialogTitle>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <form onSubmit={handleSubmit} noValidate>
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Autocomplete
                options={options}
                value={task}
                onChange={(_, value) => {
                  setTask(value);
                  setFormError(null);
                }}
                getOptionLabel={(option) => (option.isFavorite ? `★ ${option.name}` : option.name)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Task"
                    placeholder={options.length === 0 ? 'Add a task on the Tasks page first' : 'Choose a task…'}
                  />
                )}
              />

              <Stack direction="row" spacing={2}>
                <DatePicker
                  label="Date"
                  value={day}
                  onChange={(value) => {
                    if (value && value.isValid()) {
                      setDay(value);
                      setDayEdited(true);
                    }
                  }}
                  disableFuture
                  slotProps={{ textField: { fullWidth: true } }}
                />
                <TimePicker
                  label="Start"
                  value={start}
                  onChange={(value) => {
                    if (value && value.isValid()) {
                      setStart(value);
                      setStartEdited(true);
                    }
                  }}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Stack>

              <DurationFields
                value={duration}
                onChange={(next) => {
                  setDuration(next);
                  setDurationErrors({});
                }}
                errors={durationErrors}
              />

              {durationErrors.duration && <Alert severity="error">{durationErrors.duration}</Alert>}
              {formError && <Alert severity="error">{formError}</Alert>}

              <Alert severity="info">
                {formatDuration(durationMs)} on {day.format('ddd, MMM D')}, starting {start.format('h:mm A')}
              </Alert>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} color="secondary">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isSaving || options.length === 0}>
              Add Time
            </Button>
          </DialogActions>
        </form>
      </LocalizationProvider>
    </Dialog>
  );
}
