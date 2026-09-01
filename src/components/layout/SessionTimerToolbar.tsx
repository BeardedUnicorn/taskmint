/**
 * Session Timer Bar Component
 *
 * Compact status bar for the active session: task name, timer count, and
 * session-level actions (Pause All / Resume All, notes, End Session). With
 * no active session it renders the Start New Session form instead. Per-timer
 * detail and controls live in the "Active Session" panel (SessionTimerDisplay).
 */

import React, { useState, memo, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Autocomplete,
  TextField,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Pause as PauseIcon,
  Notes as NotesIcon,
  MoreVert as MoreIcon,
  FolderOpen as SessionIcon,
  Replay as ResumeIcon,
} from '@mui/icons-material';
import { TaskSession, TimerState } from '../../types/timer';
import { Task } from '../../types/task';

interface SessionTimerToolbarProps {
  activeSession: TaskSession | null;
  predefinedTasks: Task[];
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession | null>;
  onEndSession: () => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onOpenSessionNotes?: (sessionId: string) => void;
}

export const SessionTimerToolbar = memo(function SessionTimerToolbar({
  activeSession,
  predefinedTasks,
  onStartSession,
  onEndSession,
  onPauseAll,
  onResumeAll,
  onOpenSessionNotes,
}: SessionTimerToolbarProps) {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const sessionStatus = useMemo(() => {
    if (!activeSession || !Array.isArray(activeSession.timerInstances)) return { running: 0, paused: 0 };
    return {
        running: activeSession.timerInstances.filter(t => t.state === TimerState.running).length,
        paused: activeSession.timerInstances.filter(t => t.state === TimerState.paused).length,
    };
  }, [activeSession?.timerInstances]);

  const taskOptions = useMemo(() =>
    predefinedTasks.map(task => ({ label: task.name, id: task.id })),
    [predefinedTasks]
  );

  const handleStartSession = async () => {
    let taskName = '';
    let taskId = '';

    const selectedTaskObj = predefinedTasks.find(t => t.name === selectedTask || t.name === inputValue);
    if (selectedTaskObj) {
        taskName = selectedTaskObj.name;
        taskId = selectedTaskObj.id;
    } else {
        taskName = (inputValue || selectedTask).trim();
    }

    if (!taskName) {
      console.error('Cannot start session: task name is empty');
      return;
    }

    try {
      await onStartSession(taskId, taskName);
      setSelectedTask('');
      setInputValue('');
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  if (!activeSession) {
    return (
      <Paper
        elevation={2}
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SessionIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Start New Session
          </Typography>

          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Autocomplete
              value={selectedTask}
              onChange={(_, newValue) => setSelectedTask(typeof newValue === 'string' ? newValue : newValue?.label || '')}
              inputValue={inputValue}
              onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
              options={taskOptions}
              freeSolo
              sx={{ minWidth: 300, flex: 1 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or enter task name..."
                  variant="outlined"
                  size="small"
                />
              )}
            />

            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon />}
              onClick={handleStartSession}
              disabled={!selectedTask.trim() && !inputValue.trim()}
              sx={{ minWidth: 120 }}
            >
              Start Session
            </Button>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <SessionIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {activeSession.taskName}
        </Typography>

        <Chip
          label={`${activeSession.timerInstances?.length || 0} timer${(activeSession.timerInstances?.length || 0) !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
        />

        <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
            {sessionStatus.running > 0 && <Button variant="outlined" color="warning" size="small" onClick={onPauseAll} startIcon={<PauseIcon />}>Pause All</Button>}
            {sessionStatus.paused > 0 && <Button variant="outlined" color="success" size="small" onClick={onResumeAll} startIcon={<ResumeIcon />}>Resume All</Button>}
        </Box>

        <IconButton
          onClick={handleMenuOpen}
          aria-label="Session options"
        >
          <MoreIcon />
        </IconButton>

        <Button
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          onClick={onEndSession}
        >
          End Session
        </Button>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { onOpenSessionNotes?.(activeSession.id); handleMenuClose(); }}>
          <ListItemIcon><NotesIcon /></ListItemIcon>
          <ListItemText>Session Notes</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
});
