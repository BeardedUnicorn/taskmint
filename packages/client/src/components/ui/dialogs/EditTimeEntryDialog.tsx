import { useState, useMemo } from 'react';
import { Stack, Alert, Typography } from '@mui/material';
import { FormDialog } from './FormDialog';
import { EditTimeEntryDialogProps } from '../../../types/form';
import { formatDuration } from '../../../utils/formatters';
import { orderTasksForStart } from '../../../utils/taskOrdering';
import {
  DurationFields,
  durationInputToMs,
  parseDuration,
  splitDuration,
  validateDuration,
  MS_PER_HOUR,
  MS_PER_MINUTE,
} from '../forms/DurationFields';
import { formatDateTime } from '../../../utils/locale';
import { TaskSelect } from '../forms/TaskSelect';

const NO_SESSIONS: never[] = [];

/**
 * Dialog for editing a time entry's task and tracked duration. Picking
 * another task moves the entry there (it earns at that task's rate).
 * Duration is edited as hours + minutes; the entry's start time stays as
 * recorded and is shown for reference only.
 */
export function EditTimeEntryDialog({ onClose, onSave, entry, tasks }: EditTimeEntryDialogProps) {
  // Shown while there's an entry to edit, so the form starts from it once:
  // the page re-rendering (a new entry object each time) doesn't reset it.
  const [initial] = useState(() => splitDuration(entry.durationMs));
  const [taskId, setTaskId] = useState(entry.taskId);
  // Strings so the fields can be transiently empty while typing.
  const [hours, setHours] = useState(String(initial.hours));
  const [minutes, setMinutes] = useState(String(initial.minutes));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Active tasks, favorites first; the entry's own task stays listed even
  // when it's archived, so the picker can show where the time is now.
  const taskOptions = useMemo(() => {
    const options = orderTasksForStart(tasks, NO_SESSIONS);
    const current = tasks.find(t => t.id === entry.taskId);
    return current && !options.some(t => t.id === current.id) ? [current, ...options] : options;
  }, [tasks, entry.taskId]);
  // None for an entry whose task is gone, or that never had one
  const selectedTask = taskOptions.find(t => t.id === taskId);

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

    if (!taskId) {
      newErrors.taskId = 'Choose a task';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    // A task-only edit keeps the original duration so the sub-minute
    // remainder isn't truncated; typed values mean exact whole minutes.
    const unchanged = parsedHours === initial.hours && parsedMinutes === initial.minutes;
    const durationMs = unchanged ? entry.durationMs : parsedHours * MS_PER_HOUR + parsedMinutes * MS_PER_MINUTE;

    onSave({
      id: entry.id,
      taskId,
      durationMs,
    });
  };

  const previewMs = durationInputToMs({ hours, minutes });
  const moving = taskId !== entry.taskId;

  return (
    <FormDialog onClose={onClose} onSubmit={handleSubmit} title="Edit Time Entry">
      <Stack spacing={2}>
        <TaskSelect
          tasks={taskOptions}
          value={taskId}
          onChange={task => {
            setTaskId(task.id);
            clearError('taskId');
          }}
          error={!!errors.taskId}
          helperText={
            errors.taskId ?? (moving ? `Moves this entry to "${selectedTask?.name}", at its hourly rate` : undefined)
          }
        />

        <DurationFields
          value={{ hours, minutes }}
          onChange={next => {
            if (next.hours !== hours) clearError('hours');
            if (next.minutes !== minutes) clearError('minutes');
            setHours(next.hours);
            setMinutes(next.minutes);
          }}
          errors={errors}
        />

        {errors.duration && <Alert severity="error">{errors.duration}</Alert>}

        <Alert severity="info">Duration: {formatDuration(previewMs)}</Alert>

        <Typography variant="caption" color="text.secondary">
          Started {formatDateTime(entry.startTime)} — the start time stays as recorded.
        </Typography>
      </Stack>
    </FormDialog>
  );
}
