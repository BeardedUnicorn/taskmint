import { useState, useEffect } from 'react';
import { Stack, TextField, Alert, Typography } from '@mui/material';
import { FormDialog } from './FormDialog';
import { EditTimeEntryDialogProps } from '../../../types/form';
import { formatDuration } from '../../../utils/formatters';

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

function splitDuration(durationMs: number): { hours: number; minutes: number } {
  const safe = Math.max(0, durationMs);
  return {
    hours: Math.floor(safe / MS_PER_HOUR),
    minutes: Math.floor((safe % MS_PER_HOUR) / MS_PER_MINUTE),
  };
}

/**
 * Dialog for editing a time entry's task name and tracked duration.
 * Duration is edited as hours + minutes; the entry's start time stays as
 * recorded and is shown for reference only.
 */
export function EditTimeEntryDialog({
  open,
  onClose,
  onSave,
  entry,
}: EditTimeEntryDialogProps) {
  const [taskName, setTaskName] = useState('');
  // Strings so the fields can be transiently empty while typing.
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (entry) {
      const { hours: h, minutes: m } = splitDuration(entry.durationMs);
      setTaskName(entry.taskName);
      setHours(String(h));
      setMinutes(String(m));
      setErrors({});
    }
  }, [entry]);

  const clearError = (field: string) => {
    setErrors(prev => {
      if (!prev[field] && !prev.duration) return prev;
      const next = { ...prev };
      delete next[field];
      delete next.duration;
      return next;
    });
  };

  const parsedHours = hours.trim() === '' ? 0 : Number(hours);
  const parsedMinutes = minutes.trim() === '' ? 0 : Number(minutes);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!taskName.trim()) {
      newErrors.taskName = 'Task name is required';
    }
    if (!Number.isInteger(parsedHours) || parsedHours < 0) {
      newErrors.hours = 'Hours must be a whole number of 0 or more';
    }
    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 0 || parsedMinutes > 59) {
      newErrors.minutes = 'Minutes must be a whole number between 0 and 59';
    }
    if (!newErrors.hours && !newErrors.minutes && parsedHours === 0 && parsedMinutes === 0) {
      newErrors.duration = 'Duration must be greater than zero';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!entry || !validateForm()) return;

    // A name-only edit keeps the original duration so the sub-minute
    // remainder isn't truncated; typed values mean exact whole minutes.
    const initial = splitDuration(entry.durationMs);
    const unchanged = parsedHours === initial.hours && parsedMinutes === initial.minutes;
    const durationMs = unchanged
      ? entry.durationMs
      : parsedHours * MS_PER_HOUR + parsedMinutes * MS_PER_MINUTE;

    onSave({
      id: entry.id,
      taskName: taskName.trim(),
      durationMs,
    });
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  const previewMs =
    Number.isFinite(parsedHours) && Number.isFinite(parsedMinutes)
      ? Math.max(0, parsedHours) * MS_PER_HOUR + Math.max(0, parsedMinutes) * MS_PER_MINUTE
      : 0;

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title="Edit Time Entry"
      submitLabel="Save"
      cancelLabel="Cancel"
    >
      <Stack spacing={2}>
        <TextField
          label="Task Name"
          fullWidth
          value={taskName}
          onChange={(e) => {
            setTaskName(e.target.value);
            clearError('taskName');
          }}
          error={!!errors.taskName}
          helperText={errors.taskName}
        />

        <Stack direction="row" spacing={2}>
          <TextField
            label="Hours"
            type="number"
            fullWidth
            value={hours}
            onChange={(e) => {
              setHours(e.target.value);
              clearError('hours');
            }}
            error={!!errors.hours}
            helperText={errors.hours}
            slotProps={{
              htmlInput: { min: 0, step: 1 },
            }}
          />
          <TextField
            label="Minutes"
            type="number"
            fullWidth
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              clearError('minutes');
            }}
            error={!!errors.minutes}
            helperText={errors.minutes}
            slotProps={{
              htmlInput: { min: 0, max: 59, step: 1 },
            }}
          />
        </Stack>

        {errors.duration && <Alert severity="error">{errors.duration}</Alert>}

        <Alert severity="info">Duration: {formatDuration(previewMs)}</Alert>

        {entry?.startTime && (
          <Typography variant="caption" color="text.secondary">
            Started {new Date(entry.startTime).toLocaleString()} — the start
            time stays as recorded.
          </Typography>
        )}
      </Stack>
    </FormDialog>
  );
}
