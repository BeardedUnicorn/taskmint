import { useState, useMemo } from 'react';
import { Autocomplete, TextField, Button, Box, Stack } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { TaskSelectorProps } from '../../../types/form';
import { Task } from '../../../types/task';

/**
 * Task selector component with autocomplete and new task creation
 * Allows users to select from existing tasks or create new ones
 */
export function TaskSelector({
  value,
  onChange,
  predefinedTasks,
  onCreateNewTask,
  disabled = false,
  error = false,
  helperText,
  placeholder = 'Select or enter task name...',
  sx,
  timeEntries = [],
}: TaskSelectorProps) {
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');

  // Sort tasks by last time entry date
  const sortedTasks = useMemo(() => {
    if (!timeEntries || timeEntries.length === 0) {
      return predefinedTasks.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Create a map of task names to their most recent time entry
    const taskLastUsed = new Map<string, Date>();
    
    timeEntries.forEach(entry => {
      const entryDate = new Date(entry.startTime);
      const currentLastUsed = taskLastUsed.get(entry.taskName);
      
      if (!currentLastUsed || entryDate > currentLastUsed) {
        taskLastUsed.set(entry.taskName, entryDate);
      }
    });

    return predefinedTasks.sort((a, b) => {
      const aLastUsed = taskLastUsed.get(a.name);
      const bLastUsed = taskLastUsed.get(b.name);
      
      // If both have been used, sort by most recent first
      if (aLastUsed && bLastUsed) {
        return bLastUsed.getTime() - aLastUsed.getTime();
      }
      
      // If only one has been used, it goes first
      if (aLastUsed && !bLastUsed) return -1;
      if (!aLastUsed && bLastUsed) return 1;
      
      // If neither has been used, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [predefinedTasks, timeEntries]);

  const handleTaskChange = (_event: any, newValue: string | Task | null) => {
    if (typeof newValue === 'string') {
      // User typed a custom value
      onChange(newValue);
    } else if (newValue) {
      // User selected an existing task
      onChange(newValue.name, newValue);
    } else {
      // Cleared selection
      onChange('');
    }
  };

  const handleInputChange = (_event: any, newInputValue: string) => {
    // Handle typing in freeSolo mode
    onChange(newInputValue);
  };

  const handleCreateNewTask = async () => {
    if (newTaskName.trim() && onCreateNewTask) {
      try {
        const newTask = await onCreateNewTask(newTaskName.trim());
        onChange(newTask.name, newTask);
        setNewTaskName('');
        setShowNewTaskInput(false);
      } catch (error) {
        console.error('Failed to create new task:', error);
      }
    }
  };

  const handleCancelNewTask = () => {
    setNewTaskName('');
    setShowNewTaskInput(false);
  };

  // Find the selected task object
  const selectedTask = sortedTasks.find(task => task.name === value);

  if (showNewTaskInput) {
    return (
      <Stack spacing={2} sx={sx}>
        <TextField
          label="New Task Name"
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          placeholder="Enter task name..."
          fullWidth
          autoFocus
          error={error}
          helperText="Enter a name for the new task"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleCreateNewTask();
            } else if (e.key === 'Escape') {
              handleCancelNewTask();
            }
          }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            onClick={handleCreateNewTask}
            disabled={!newTaskName.trim()}
            size="small"
          >
            Create Task
          </Button>
          <Button
            variant="outlined"
            onClick={handleCancelNewTask}
            size="small"
          >
            Cancel
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={1} sx={sx}>
      <Autocomplete
        value={selectedTask || value || null}
        onChange={handleTaskChange}
        onInputChange={handleInputChange}
        options={sortedTasks}
        getOptionLabel={(option) => {
          if (typeof option === 'string') return option;
          return option.name;
        }}
        renderOption={(props, option) => {
          const { key, ...otherProps } = props;
          return (
            <Box component="li" key={key} {...otherProps}>
              <Box>
                <Box>{option.name}</Box>
                {option.hourlyRate && (
                  <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    ${option.hourlyRate}/hour
                  </Box>
                )}
              </Box>
            </Box>
          );
        }}
        freeSolo
        disabled={disabled}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Task"
            placeholder={placeholder}
            error={error}
            helperText={helperText}
            fullWidth
          />
        )}
      />
      
      {onCreateNewTask && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setShowNewTaskInput(true)}
          size="small"
          disabled={disabled}
        >
          Create New Task
        </Button>
      )}
    </Stack>
  );
}
