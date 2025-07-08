import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Autocomplete,
  TextField,
  Chip,
  Stack,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Timer as TimerIcon,
  Notes as NotesIcon,
  NoteAdd as NoteAddIcon,
} from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { TimerDisplay } from '../ui/display/TimerDisplay';
import { useTimer } from '../../hooks/useTimer';

interface GlobalTimerBarProps {
  activeEntry: TimeEntry | null;
  predefinedTasks: Task[];
  timeEntries: TimeEntry[];
  onStart: (taskName: string) => void;
  onStop: () => void;
  onOpenNotes?: () => void;
  onOpenTaskNote?: () => void;
}

export function GlobalTimerBar({
  activeEntry,
  predefinedTasks,
  onStart,
  onStop,
  onOpenNotes,
  onOpenTaskNote,
}: Omit<GlobalTimerBarProps, 'timeEntries'>) {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');

  // Calculate elapsed time for running timer
  const elapsed = useTimer(
    activeEntry?.isRunning || false,
    activeEntry?.startTime
  );

  const taskOptions = predefinedTasks.map(task => task.name);

  const handleStart = () => {
    // Use selectedTask if available, otherwise fall back to inputValue
    const taskName = selectedTask.trim() || inputValue.trim();
    if (taskName) {
      onStart(taskName);
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
    const taskName = selectedTask.trim() || inputValue.trim();
    if (event.key === 'Enter' && taskName && !activeEntry) {
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
        <Stack spacing={2}>
          {/* Main Timer Controls */}
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
              disabled={activeEntry?.isRunning}
              sx={{ flex: 1, minWidth: 200 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or type task name..."
                  size="small"
                  onKeyPress={handleKeyPress}
                  data-testid="global-timer-task-input"
                  aria-label="Task name input"
                  label="Task"
                />
              )}
            />

            <Button
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={handleStart}
              disabled={!selectedTask.trim() && !inputValue.trim()}
              data-testid="global-timer-start-button"
            >
              Start
            </Button>
          </Box>
        </Stack>
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
        backgroundColor: 'secondary.main',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'secondary.dark',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <TimerIcon sx={{ color: 'secondary.contrastText' }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <Typography variant="body2" sx={{ color: 'secondary.contrastText' }}>
            Working on:
          </Typography>
          <Chip
            label={activeEntry.taskName}
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              border: '1px solid',
              borderColor: 'primary.light',
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
            color: 'secondary.contrastText'
          }}
        />
        <Button
          variant="outlined"
          startIcon={<NotesIcon />}
          onClick={onOpenNotes}
          sx={{ color: 'secondary.contrastText', borderColor: 'secondary.contrastText' }}
        >
          Notes
        </Button>
        <Button
          variant="outlined"
          startIcon={<NoteAddIcon />}
          onClick={onOpenTaskNote}
          sx={{ color: 'secondary.contrastText', borderColor: 'secondary.contrastText' }}
        >
          Task Note
        </Button>
        
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
