import { useState, useEffect } from 'react';
import { Stack, TextField, Alert } from '@mui/material';
import { FormDialog } from './FormDialog';
import { EditTimeEntryDialogProps, EditTimeEntryData } from '../../../types/form';
import { formatDuration } from '../../../utils/formatters';

/**
 * Dialog for editing time entries with validation and duration calculation
 */
export function EditTimeEntryDialog({
  open,
  onClose,
  onSave,
  entry,
}: EditTimeEntryDialogProps) {
  const [formData, setFormData] = useState<EditTimeEntryData>({
    id: '',
    taskName: '',
    startTime: '',
    endTime: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (entry) {
      setFormData({
        id: entry.id,
        taskName: entry.taskName,
        startTime: entry.startTime,
        endTime: entry.endTime,
      });
      setErrors({});
    }
  }, [entry]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.taskName.trim()) {
      newErrors.taskName = 'Task name is required';
    }

    if (!formData.startTime) {
      newErrors.startTime = 'Start time is required';
    }

    if (!formData.endTime) {
      newErrors.endTime = 'End time is required';
    }

    if (formData.startTime && formData.endTime) {
      const startTime = new Date(formData.startTime);
      const endTime = new Date(formData.endTime);
      
      if (endTime <= startTime) {
        newErrors.endTime = 'End time must be after start time';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      const startTime = new Date(formData.startTime);
      const endTime = new Date(formData.endTime);
      const duration = endTime.getTime() - startTime.getTime();

      onSave({
        ...formData,
        duration,
      });
    }
  };

  const handleClose = () => {
    setFormData({
      id: '',
      taskName: '',
      startTime: '',
      endTime: '',
    });
    setErrors({});
    onClose();
  };

  const calculateDuration = (): number => {
    if (formData.startTime && formData.endTime) {
      const startTime = new Date(formData.startTime);
      const endTime = new Date(formData.endTime);
      return endTime.getTime() - startTime.getTime();
    }
    return 0;
  };

  const duration = calculateDuration();

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title="Edit Time Entry"
      submitLabel="Save"
      cancelLabel="Cancel"
      submitDisabled={Object.keys(errors).length > 0}
    >
      <Stack spacing={2}>
        <TextField
          label="Task Name"
          fullWidth
          value={formData.taskName}
          onChange={(e) => setFormData(prev => ({ ...prev, taskName: e.target.value }))}
          error={!!errors.taskName}
          helperText={errors.taskName}
        />
        
        <TextField
          label="Start Time"
          type="datetime-local"
          fullWidth
          value={formData.startTime}
          onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
          error={!!errors.startTime}
          helperText={errors.startTime}
          InputLabelProps={{ shrink: true }}
        />
        
        <TextField
          label="End Time"
          type="datetime-local"
          fullWidth
          value={formData.endTime}
          onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
          error={!!errors.endTime}
          helperText={errors.endTime}
          InputLabelProps={{ shrink: true }}
        />
        
        {duration > 0 && (
          <Alert severity="info">
            Duration: {formatDuration(duration)}
          </Alert>
        )}
      </Stack>
    </FormDialog>
  );
}
