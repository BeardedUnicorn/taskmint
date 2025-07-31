import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
} from '@mui/material';
import { TaskSelector } from '../forms/TaskSelector';
import { Task } from '../../../types/task';
import { TaskSession } from '../../../types/timer';

interface QuickSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession>;
  tasks: Task[];
}

export function QuickSessionDialog({
  open,
  onClose,
  onStartSession,
  tasks,
}: QuickSessionDialogProps) {
  const [selectedTaskName, setSelectedTaskName] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleStart = async () => {
    if (selectedTaskName.trim()) {
      await onStartSession(selectedTask?.id || '', selectedTaskName.trim());
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedTaskName('');
    setSelectedTask(null);
    onClose();
  }

  const handleTaskChange = (name: string, task?: Task | null) => {
    setSelectedTaskName(name);
    setSelectedTask(task || null);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start a Quick Session</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <TaskSelector
            value={selectedTaskName}
            onChange={handleTaskChange}
            predefinedTasks={tasks}
            placeholder="Select a task to start"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="secondary">
          Cancel
        </Button>
        <Button
          onClick={handleStart}
          variant="contained"
          disabled={!selectedTaskName.trim()}
        >
          Start Session
        </Button>
      </DialogActions>
    </Dialog>
  );
}