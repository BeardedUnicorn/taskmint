import { useState, useMemo } from 'react';
import { Autocomplete, TextField, Button, Box, Stack } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { TaskSelectorProps } from '../../../types/form';
import { Task } from '../../../types/task';

/**
 * Pick a task by name (or type one), or create a new one. Tasks are listed
 * by name; typing a task's exact name picks that task.
 */
export function TaskSelector({ value, onChange, predefinedTasks, onCreateNewTask, placeholder }: TaskSelectorProps) {
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');

  // Sorted as a copy: the caller's (memoized) list stays as it is
  const sortedTasks = useMemo(
    () => [...predefinedTasks].sort((a, b) => a.name.localeCompare(b.name)),
    [predefinedTasks]
  );

  // A typed name is reported as it's typed (handleInputChange), so the value
  // always matches the input: a change here is a picked task, or a clear
  const handleTaskChange = (_event: unknown, newValue: string | Task | null) => {
    if (newValue !== null && typeof newValue === 'object') onChange(newValue.name, newValue);
    else onChange('');
  };

  const handleInputChange = (_event: unknown, newInputValue: string) => {
    // Typing a task's exact name shows that task as selected (selectedTask
    // below), and picking its option is then a no-op for Autocomplete, so
    // report the task here too.
    onChange(
      newInputValue,
      sortedTasks.find(task => task.name === newInputValue)
    );
  };

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
      onChange(newTask.name, newTask);
      handleCancelNewTask();
    } catch (error) {
      // The caller reports it; the name stays for another try
      console.error('Failed to create new task:', error);
    }
  };

  const selectedTask = sortedTasks.find(task => task.name === value);

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
      <Autocomplete
        value={selectedTask ?? (value || null)}
        onChange={handleTaskChange}
        onInputChange={handleInputChange}
        options={sortedTasks}
        getOptionLabel={option => (typeof option === 'string' ? option : option.name)}
        renderOption={(props, option) => {
          const { key, ...otherProps } = props;
          return (
            <Box component="li" key={key} {...otherProps}>
              <Box>
                <Box>{option.name}</Box>
                {option.hourlyRate ? (
                  <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>${option.hourlyRate}/hour</Box>
                ) : null}
              </Box>
            </Box>
          );
        }}
        freeSolo
        renderInput={params => <TextField {...params} label="Task" placeholder={placeholder} fullWidth />}
      />

      <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setShowNewTaskInput(true)} size="small">
        Create New Task
      </Button>
    </Stack>
  );
}
