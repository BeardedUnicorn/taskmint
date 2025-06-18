import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Autocomplete,
  TextField,
  Chip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { TimerDisplay } from '../ui/display/TimerDisplay';
import { useTimer } from '../../hooks/useTimer';

interface GlobalTimerBarProps {
  activeEntry: TimeEntry | null;
  predefinedTasks: Task[];
  onStart: (taskName: string) => void;
  onStop: () => void;
}

export function GlobalTimerBar({
  activeEntry,
  predefinedTasks,
  onStart,
  onStop,
}: GlobalTimerBarProps) {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');

  // Calculate elapsed time for running timer
  const elapsed = useTimer(
    activeEntry?.isRunning || false,
    activeEntry?.startTime
  );

  const taskOptions = predefinedTasks.map(task => task.name);

  const handleStart = () => {
    if (selectedTask.trim()) {
      onStart(selectedTask.trim());
      setSelectedTask('');
      setInputValue('');
    }
  };

  const handleStop = () => {
    onStop();
  };

  const handleTaskChange = (_event: any, newValue: string | null) => {
    setSelectedTask(newValue || '');
  };

  const handleInputChange = (_event: any, newInputValue: string) => {
    setInputValue(newInputValue);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && selectedTask.trim() && !activeEntry) {
      handleStart();
    }
  };

  // Timer stopped state
  if (!activeEntry || !activeEntry.isRunning) {
    return (
      <Paper
        elevation={1}
        sx={{
          p: 2,
          mb: 2,
          backgroundColor: 'background.paper',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TimerIcon color="action" />
          
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 'fit-content' }}>
            Start Timer:
          </Typography>
          
          <Autocomplete
            value={selectedTask}
            onChange={handleTaskChange}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            options={taskOptions}
            freeSolo
            sx={{ flex: 1, minWidth: 200 }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Select or type task name..."
                size="small"
                onKeyPress={handleKeyPress}
                data-testid="global-timer-task-input"
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option}>
                {option}
              </li>
            )}
          />
          
          <Button
            variant="contained"
            startIcon={<PlayIcon />}
            onClick={handleStart}
            disabled={!selectedTask.trim()}
            data-testid="global-timer-start-button"
          >
            Start
          </Button>
        </Box>
      </Paper>
    );
  }

  // Timer running state
  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        mb: 2,
        backgroundColor: 'success.dark',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'success.main',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <TimerIcon sx={{ color: 'success.contrastText' }} />
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <Typography variant="body2" sx={{ color: 'success.contrastText' }}>
            Working on:
          </Typography>
          <Chip
            label={activeEntry.taskName}
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'success.contrastText',
              border: '1px solid rgba(255, 255, 255, 0.3)',
            }}
            size="small"
          />
        </Box>
        
        <TimerDisplay
          elapsed={elapsed}
          isRunning={activeEntry.isRunning}
          showTaskName={false}
          size="small"
          sx={{ 
            fontWeight: 600, 
            fontSize: '1.1rem',
            color: 'success.contrastText'
          }}
        />
        
        <Button
          variant="contained"
          color="error"
          startIcon={<StopIcon />}
          onClick={handleStop}
          data-testid="global-timer-stop-button"
        >
          Stop
        </Button>
      </Box>
    </Paper>
  );
}
