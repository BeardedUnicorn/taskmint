/**
 * Session Timer Bar Component
 *
 * Compact status bar for the active session: task name, timer count, and
 * session-level actions (Pause All / Resume All, notes, End Session). With
 * no active session it renders the start form instead: pick an existing task
 * and its timer starts. Per-timer detail and controls live in the "Active
 * Session" panel (SessionTimerDisplay).
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
  /** Tasks to offer, already in start order (orderTasksForStart). */
  startOptions: Task[];
  onStartTask: (taskId: string, taskName: string) => Promise<unknown>;
  onEndSession: () => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onOpenSessionNotes?: (sessionId: string) => void;
}

export const SessionTimerToolbar = memo(function SessionTimerToolbar({
  activeSession,
  startOptions,
  onStartTask,
  onEndSession,
  onPauseAll,
  onResumeAll,
  onOpenSessionNotes,
}: SessionTimerToolbarProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const sessionStatus = useMemo(() => {
    if (!activeSession || !Array.isArray(activeSession.timerInstances)) return { running: 0, paused: 0 };
    return {
        running: activeSession.timerInstances.filter(t => t.state === TimerState.running).length,
        paused: activeSession.timerInstances.filter(t => t.state === TimerState.paused).length,
    };
  }, [activeSession?.timerInstances]);

  // Work starts from existing tasks only: the picker takes no free text.
  const handleStart = async () => {
    if (!selectedTask) return;
    await onStartTask(selectedTask.id, selectedTask.name);
    setSelectedTask(null);
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
            Start Work
          </Typography>

          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Autocomplete
              value={selectedTask}
              onChange={(_, task) => setSelectedTask(task)}
              options={startOptions}
              getOptionLabel={(task) => (task.isFavorite ? `★ ${task.name}` : task.name)}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              disabled={startOptions.length === 0}
              sx={{ minWidth: 300, flex: 1 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  aria-label="Task to start"
                  placeholder={
                    startOptions.length === 0
                      ? 'Add a task on the Tasks page to start'
                      : 'Choose a task…'
                  }
                  variant="outlined"
                  size="small"
                />
              )}
            />

            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon />}
              onClick={handleStart}
              disabled={!selectedTask}
              sx={{ minWidth: 120 }}
            >
              Start
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
