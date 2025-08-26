import { useState } from 'react';
import { TextField } from '@mui/material';
import { FormDialog } from './FormDialog';
import { StartTaskDialogProps } from '../../../types/task';

export function StartTaskDialog({
  open,
  onClose,
  onStartTask,
  existingTasks: _existingTasks,
}: StartTaskDialogProps) {
  const [taskName, setTaskName] = useState('');

  const handleSubmit = () => {
    if (taskName.trim()) {
      onStartTask(taskName.trim());
      setTaskName('');
      onClose();
    }
  };

  const handleClose = () => {
    setTaskName('');
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Start New Task"
      onSubmit={handleSubmit}
      submitLabel="Start Timer"
      submitDisabled={!taskName.trim()}
    >
      <TextField
        autoFocus
        fullWidth
        label="Task Name"
        value={taskName}
        onChange={(e) => setTaskName(e.target.value)}
        placeholder="Enter task name..."
        variant="outlined"
      />
    </FormDialog>
  );
}
