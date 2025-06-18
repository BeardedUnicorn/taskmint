import { useState, useEffect } from 'react';
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

interface EditTaskDialogProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (taskId: string, updates: { name: string; hourlyRate?: number }) => Promise<Task | null>;
}

export function EditTaskDialog({
  open,
  task,
  onClose,
  onSave,
}: EditTaskDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [errors, setErrors] = useState<{ taskName?: string; hourlyRate?: string }>({});

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTaskName(task.name);
      setHourlyRate(task.hourlyRate?.toString() || '');
      setErrors({});
    }
  }, [task]);

  const validateForm = (): boolean => {
    const newErrors: { taskName?: string; hourlyRate?: string } = {};

    if (!taskName.trim()) {
      newErrors.taskName = 'Task name is required';
    } else if (taskName.trim().length < 2) {
      newErrors.taskName = 'Task name must be at least 2 characters';
    }

    if (hourlyRate.trim()) {
      const rate = parseFloat(hourlyRate);
      if (isNaN(rate) || rate < 0) {
        newErrors.hourlyRate = 'Hourly rate must be a positive number';
      } else if (rate > 1000) {
        newErrors.hourlyRate = 'Hourly rate seems too high (max $1000/hour)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !validateForm()) return;

    const hourlyRateValue = hourlyRate.trim() 
      ? parseFloat(hourlyRate) 
      : undefined;

    try {
      const result = await onSave(task.id, {
        name: taskName.trim(),
        hourlyRate: hourlyRateValue,
      });

      if (result) {
        handleClose();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
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
      <DialogTitle>Edit Task</DialogTitle>
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
              label="Hourly Rate (Optional)"
              value={hourlyRate}
              onChange={setHourlyRate}
              error={!!errors.hourlyRate}
              helperText={errors.hourlyRate || 'Leave empty if not applicable'}
              placeholder="0.00"
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
          >
            Save Changes
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
