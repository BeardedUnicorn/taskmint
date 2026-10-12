import { useState, useEffect } from 'react';
import { Stack, TextField, Alert, Typography } from '@mui/material';
import { FormDialog } from './FormDialog';
import { EditTimeEntryDialogProps } from '../../../types/form';
import { formatDuration } from '../../../utils/formatters';
import {
  DurationFields,
  durationInputToMs,
  parseDuration,
  splitDuration,
  validateDuration,
  MS_PER_HOUR,
  MS_PER_MINUTE,
} from '../forms/DurationFields';

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

  const { hours: parsedHours, minutes: parsedMinutes } = parseDuration({ hours, minutes });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = { ...validateDuration({ hours, minutes }) };

    if (!taskName.trim()) {
      newErrors.taskName = 'Task name is required';
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

  const previewMs = durationInputToMs({ hours, minutes });

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

        <DurationFields
          value={{ hours, minutes }}
          onChange={(next) => {
            if (next.hours !== hours) clearError('hours');
            if (next.minutes !== minutes) clearError('minutes');
            setHours(next.hours);
            setMinutes(next.minutes);
          }}
          errors={errors}
        />

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
