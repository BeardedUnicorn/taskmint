import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import { Task } from '../../../types/task';
import { CurrencyInput } from '../../ui';
import { useNoteTemplates } from '../../../hooks/useNoteTemplates';

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (taskData: { name: string; hourlyRate?: number; defaultNoteTemplateId?: string | null; parentId?: string | null }) => Promise<Task | null>;
  availableTasks?: Task[]; // For parent task selection
}

export function AddTaskDialog({
  open,
  onClose,
  onSave,
  availableTasks = [],
}: AddTaskDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [defaultNoteTemplateId, setDefaultNoteTemplateId] = useState<string>('');
  const [parentId, setParentId] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch note templates
  const { getActiveTemplates, isLoading: templatesLoading } = useNoteTemplates();
  const activeTemplates = getActiveTemplates();

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

    const templateId = defaultNoteTemplateId || null;

    try {
      const result = await onSave({
        name: taskName.trim(),
        hourlyRate: hourlyRateValue,
        defaultNoteTemplateId: templateId,
        parentId: parentId || null,
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
    setDefaultNoteTemplateId('');
    setParentId('');
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

            <FormControl fullWidth>
              <InputLabel id="parent-task-label">Parent Task</InputLabel>
              <Select
                labelId="parent-task-label"
                value={parentId}
                label="Parent Task"
                onChange={(e) => setParentId(e.target.value)}
              >
                <MenuItem value="">
                  <em>None (Root Level)</em>
                </MenuItem>
                {availableTasks.map((task) => (
                  <MenuItem key={task.id} value={task.id}>
                    {task.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="default-note-template-label">Default Note Template</InputLabel>
              <Select
                labelId="default-note-template-label"
                value={defaultNoteTemplateId}
                label="Default Note Template"
                onChange={(e) => setDefaultNoteTemplateId(e.target.value)}
                disabled={templatesLoading}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {activeTemplates.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
              {templatesLoading && (
                <CircularProgress size={20} sx={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)' }} />
              )}
            </FormControl>
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
