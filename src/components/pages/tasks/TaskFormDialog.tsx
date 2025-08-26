import { useState, useEffect } from 'react';
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

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  initialTask?: Task | null;
  mode: 'add' | 'edit';
  availableTasks?: Task[];
  onSubmit: (data: {
    name: string;
    hourlyRate?: number;
    defaultNoteTemplateId?: string | null;
    parentId?: string | null;
  }) => Promise<Task | null>;
}

export function TaskFormDialog({
  open,
  onClose,
  initialTask = null,
  mode,
  availableTasks = [],
  onSubmit,
}: TaskFormDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [defaultNoteTemplateId, setDefaultNoteTemplateId] = useState<string>('');
  const [parentId, setParentId] = useState<string>('');
  const [errors, setErrors] = useState<{ taskName?: string; hourlyRate?: string }>({});

  const { getActiveTemplates, isLoading: templatesLoading } = useNoteTemplates();
  const activeTemplates = getActiveTemplates();

  useEffect(() => {
    if (initialTask) {
      setTaskName(initialTask.name);
      setHourlyRate(initialTask.hourlyRate?.toString() || '');
      setDefaultNoteTemplateId(initialTask.defaultNoteTemplateId || '');
      setParentId(initialTask.parentId || '');
      setErrors({});
    } else {
      setTaskName('');
      setHourlyRate('');
      setDefaultNoteTemplateId('');
      setParentId('');
      setErrors({});
    }
  }, [initialTask, open]);

  const validateForm = (): boolean => {
    const newErrors: { taskName?: string; hourlyRate?: string } = {};

    const trimmedName = taskName.trim();
    if (!trimmedName) {
      newErrors.taskName = 'Task name is required';
    } else if (trimmedName.length < 2) {
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
    if (!validateForm()) return;

    const hourlyRateValue = hourlyRate.trim() ? parseFloat(hourlyRate) : undefined;
    const templateId = defaultNoteTemplateId || null;
    const parent = parentId || null;

    try {
      const result = await onSubmit({
        name: taskName.trim(),
        hourlyRate: hourlyRateValue,
        defaultNoteTemplateId: templateId,
        parentId: parent,
      });

      if (result) {
        handleClose();
      }
    } catch (error) {
      console.error('Failed to submit task:', error);
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

  const title = mode === 'add' ? 'Add New Task' : 'Edit Task';
  const submitLabel = mode === 'add' ? 'Add Task' : 'Save Changes';
  const filteredTasks = mode === 'edit' && initialTask
    ? availableTasks.filter(t => t.id !== initialTask.id)
    : availableTasks;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
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
              onChange={setHourlyRate}
              error={!!errors.hourlyRate}
              helperText={errors.hourlyRate || (mode === 'add' ? 'Optional - leave blank if not applicable' : 'Leave empty if not applicable')}
              placeholder="0.00"
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
                {filteredTasks.map((task) => (
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
          <Button type="submit" variant="contained" color="primary" disabled={!taskName.trim()}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

