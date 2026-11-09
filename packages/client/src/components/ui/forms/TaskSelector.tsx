import { useState, useMemo } from 'react';
import { TextField, Button, Box, Stack } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { TaskSelectorProps } from '../../../types/form';
import { Task } from '../../../types/task';
import { TaskSelect } from './TaskSelect';

/**
 * Pick a task from a dropdown, listed by name, or create a new one without
 * leaving the form (the import would lose its paste on the way to the Tasks
 * page).
 */
export function TaskSelector({ value, onChange, predefinedTasks, onCreateNewTask }: TaskSelectorProps) {
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  // Listed until the caller's tasks include it, so it shows as picked at once
  const [created, setCreated] = useState<Task | null>(null);

  // Sorted as a copy: the caller's (memoized) list stays as it is
  const sortedTasks = useMemo(() => {
    const pending = created && !predefinedTasks.some(task => task.id === created.id) ? [created] : [];
    return [...predefinedTasks, ...pending].sort((a, b) => a.name.localeCompare(b.name));
  }, [predefinedTasks, created]);

  const handleCancelNewTask = () => {
    setNewTaskName('');
    setShowNewTaskInput(false);
  };

  // (Create Task is disabled without a name; Enter needs the check)
  const handleCreateNewTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    try {
      const newTask = await onCreateNewTask(name);
      setCreated(newTask);
      onChange(newTask);
      handleCancelNewTask();
    } catch (error) {
      // The caller reports it; the name stays for another try
      console.error('Failed to create new task:', error);
    }
  };

  if (showNewTaskInput) {
    return (
      <Stack spacing={2}>
        <TextField
          label="New Task Name"
          value={newTaskName}
          onChange={e => setNewTaskName(e.target.value)}
          placeholder="Enter task name..."
          fullWidth
          autoFocus
          helperText="Enter a name for the new task"
          onKeyDown={e => {
            if (e.key === 'Enter') void handleCreateNewTask();
            else if (e.key === 'Escape') handleCancelNewTask();
          }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => void handleCreateNewTask()}
            disabled={!newTaskName.trim()}
            size="small"
          >
            Create Task
          </Button>
          <Button variant="outlined" onClick={handleCancelNewTask} size="small">
            Cancel
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      <TaskSelect tasks={sortedTasks} value={value} onChange={onChange} />

      <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setShowNewTaskInput(true)} size="small">
        Create New Task
      </Button>
    </Stack>
  );
}
