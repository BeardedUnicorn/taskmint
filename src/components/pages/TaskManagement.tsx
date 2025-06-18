import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { Task, TaskFormData } from '../../types/task';
import { ActionButton, FormDialog, ConfirmDialog, CurrencyInput } from '../ui';
import { TaskRow } from '../ui/tables/TaskRow';
import { TaskDetail } from '../features/tasks';

interface TaskManagementProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task | null>;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<Task | null>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export function TaskManagement({ tasks, onAddTask, onUpdateTask, onDeleteTask }: TaskManagementProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>({
    name: '',
    hourlyRate: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<TaskFormData>>({});

  const validateForm = (): boolean => {
    const errors: Partial<TaskFormData> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Task name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Task name must be at least 2 characters';
    }

    if (formData.hourlyRate && formData.hourlyRate.trim()) {
      const rate = parseFloat(formData.hourlyRate);
      if (isNaN(rate) || rate < 0) {
        errors.hourlyRate = 'Hourly rate must be a positive number';
      } else if (rate > 1000) {
        errors.hourlyRate = 'Hourly rate seems too high (max $1000/hour)';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenDialog = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        name: task.name,
        hourlyRate: task.hourlyRate?.toString() || '',
      });
    } else {
      setEditingTask(null);
      setFormData({ name: '', hourlyRate: '' });
    }
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTask(null);
    setFormData({ name: '', hourlyRate: '' });
    setFormErrors({});
  };

  const handleSaveTask = async () => {
    if (!validateForm()) return;

    const hourlyRate = formData.hourlyRate.trim()
      ? parseFloat(formData.hourlyRate)
      : undefined;

    try {
      if (editingTask) {
        // Update existing task
        await onUpdateTask(editingTask.id, {
          name: formData.name.trim(),
          hourlyRate,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Add new task
        const result = await onAddTask({
          name: formData.name.trim(),
          hourlyRate,
        });

        if (!result) {
          console.error('Failed to create task - no result returned');
          return;
        }
      }

      handleCloseDialog();
    } catch (error) {
      console.error('Failed to save task:', error);
      // TODO: Show error message to user
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await onDeleteTask(taskId);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete task:', error);
      // TODO: Show error message to user
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
  };

  const handleBackToList = () => {
    setSelectedTask(null);
  };



  // Show task detail view if a task is selected
  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        onBack={handleBackToList}
        onEdit={handleOpenDialog}
        onDelete={onDeleteTask}
      />
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Card>
        <CardContent>
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h5" component="h1">
              Task Management
            </Typography>
            <ActionButton
              onClick={() => handleOpenDialog()}
              icon={<AddIcon />}
              variant="contained"
            >
              Add New Task
            </ActionButton>
          </Stack>

          {/* Tasks Table */}
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Task Name</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Hourly Rate</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                      <Typography variant="subtitle1" color="text.secondary">
                        No tasks created yet. Click "Add New Task" to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  [...tasks]
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onEdit={handleOpenDialog}
                        onDelete={(taskId) => setDeleteConfirm(taskId)}
                        onView={handleViewTask}
                        showUsageStats={false}
                      />
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add/Edit Task Dialog */}
      <FormDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSubmit={handleSaveTask}
        title={editingTask ? 'Edit Task' : 'Add New Task'}
        submitLabel={editingTask ? 'Update Task' : 'Add Task'}
        submitDisabled={Object.keys(formErrors).length > 0}
      >
        <Stack spacing={3}>
          <TextField
            label="Task Name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            error={!!formErrors.name}
            helperText={formErrors.name}
            fullWidth
            required
          />
          <CurrencyInput
            label="Hourly Rate"
            value={formData.hourlyRate}
            onChange={(value) => setFormData(prev => ({ ...prev, hourlyRate: value }))}
            error={!!formErrors.hourlyRate}
            helperText={formErrors.hourlyRate || 'Optional - leave blank if not applicable'}
            placeholder="0.00"
            min={0}
            max={1000}
          />
        </Stack>
      </FormDialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteTask(deleteConfirm)}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone. Existing time entries will keep their task names, but won't be linked to this task anymore."
        confirmLabel="Delete"
        severity="error"
      />
    </Box>
  );
}
