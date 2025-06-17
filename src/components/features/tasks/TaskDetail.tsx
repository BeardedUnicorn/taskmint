/**
 * Task Detail Component
 * 
 * Detailed view of a task with notes integration, template selection,
 * and comprehensive task information display.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Notes as NotesIcon,
  Schedule as TimeIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { Task } from '../../../types/task';
import { TaskNotesIntegration } from './TaskNotesIntegration';
import { formatCurrency } from '../../../utils/formatters';

interface TaskDetailProps {
  task: Task;
  onBack: () => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

export function TaskDetail({ task, onBack, onEdit, onDelete }: TaskDetailProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleDeleteTask = useCallback(() => {
    onDelete(task.id);
    setDeleteConfirm(false);
    onBack();
  }, [onDelete, task.id, onBack]);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Button
            startIcon={<BackIcon />}
            onClick={onBack}
            sx={{ mr: 2 }}
          >
            Back to Tasks
          </Button>
          <Typography variant="h4" sx={{ flex: 1 }}>
            {task.name}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => onEdit(task)}
            sx={{ mr: 1 }}
          >
            Edit Task
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setDeleteConfirm(true)}
          >
            Delete Task
          </Button>
        </Box>

        {/* Task Info */}
        <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon color="action" />
            <Typography variant="body1">
              <strong>Hourly Rate:</strong> {
                task.hourlyRate ? formatCurrency(task.hourlyRate) : 'Not set'
              }
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimeIcon color="action" />
            <Typography variant="body1">
              <strong>Created:</strong> {formatDate(task.createdAt)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotesIcon color="action" />
            <Typography variant="body1">
              <strong>Notes:</strong> Available below
            </Typography>
          </Box>
        </Stack>


      </Paper>

      {/* Notes Integration */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TaskNotesIntegration task={task} />
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <DialogTitle>Delete Task</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{task.name}"? This will also delete all associated notes and time entries. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button onClick={handleDeleteTask} color="error" variant="contained">
            Delete Task
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
