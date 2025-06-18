import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
} from '@mui/material';
import { Task } from '../../../types/task';
import { CurrencyInput } from '../../ui';

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (taskData: { name: string; hourlyRate?: number }) => Promise<Task | null>;
}

export function AddTaskDialog({
  open,
  onClose,
  onSave,
}: AddTaskDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!taskName.trim()) {
      newErrors.taskName = 'Task name is required';
    }

    if (hourlyRate.trim() && isNaN(parseFloat(hourlyRate))) {
      newErrors.hourlyRate = 'Please enter a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const hourlyRateValue = hourlyRate.trim() 
      ? parseFloat(hourlyRate) 
      : undefined;

    try {
      const result = await onSave({
        name: taskName.trim(),
        hourlyRate: hourlyRateValue,
      });

      if (result) {
        handleClose();
      }
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleClose = () => {
    setTaskName('');
    setHourlyRate('');
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Task</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label="Task Name"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              error={!!errors.taskName}
              helperText={errors.taskName}
              placeholder="Enter task name..."
              variant="outlined"
              required
            />
            
            <CurrencyInput
              label="Hourly Rate"
              value={hourlyRate}
              onChange={(value) => setHourlyRate(value)}
              error={!!errors.hourlyRate}
              helperText={errors.hourlyRate || 'Optional - leave blank if not applicable'}
              placeholder="0.00"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="secondary">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={!taskName.trim()}
          >
            Add Task
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
