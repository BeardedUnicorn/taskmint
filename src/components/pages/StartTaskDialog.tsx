import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Autocomplete,
} from '@mui/material';
import { StartTaskDialogProps } from '../../types/task';

export function StartTaskDialog({
  open,
  onClose,
  onStartTask,
  existingTasks,
}: StartTaskDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (taskName.trim()) {
      try {
        await onStartTask(taskName.trim());
        setTaskName('');
        setError(null);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start task');
      }
    }
  };

  const handleClose = () => {
    setTaskName('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start New Task</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Autocomplete
              freeSolo
              options={existingTasks}
              inputValue={taskName}
              onInputChange={(_, newValue) => setTaskName(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  fullWidth
                  label="Task Name"
                  placeholder="Enter task name..."
                  variant="outlined"
                  error={!!error}
                  helperText={error}
                />
              )}
            />
          </Box>
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
            Start Timer
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
