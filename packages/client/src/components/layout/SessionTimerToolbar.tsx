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
  SwapHoriz as SwitchIcon,
} from '@mui/icons-material';
import { TaskSession, TimerState } from '../../types/timer';
import { Task } from '../../types/task';
import { sessionTitle } from '../../utils/timerHelpers';
import { TaskSelect } from '../ui/forms/TaskSelect';
import { PHONE } from '../../theme/media';
import { PhoneOwnLine, TWO_LINES } from '../ui/phoneLayout';

interface SessionTimerToolbarProps {
  activeSession: TaskSession | null;
  /** Tasks to offer, already in start order (orderTasksForStart). */
  startOptions: Task[];
  onStartTask: (taskId: string, taskName: string) => Promise<unknown>;
  onEndSession: () => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onOpenSessionNotes?: (sessionId: string) => void;
  /** Move on to another task in this session (opens the start dialog). */
  onSwitchTask?: () => void;
}

export const SessionTimerToolbar = memo(function SessionTimerToolbar({
  activeSession,
  startOptions,
  onStartTask,
  onEndSession,
  onPauseAll,
  onResumeAll,
  onOpenSessionNotes,
  onSwitchTask,
}: SessionTimerToolbarProps) {
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const sessionStatus = useMemo(() => {
    if (!activeSession || !Array.isArray(activeSession.timerInstances)) return { running: 0, paused: 0 };
    return {
      running: activeSession.timerInstances.filter(t => t.state === TimerState.running).length,
      paused: activeSession.timerInstances.filter(t => t.state === TimerState.paused).length,
    };
  }, [activeSession?.timerInstances]);

  // Work starts from existing tasks only: Start waits for a pick that's
  // still offered.
  const selectedTask = startOptions.find(task => task.id === selectedTaskId);
  const start =
    selectedTask &&
    (async () => {
      await onStartTask(selectedTask.id, selectedTask.name);
      setSelectedTaskId('');
    });

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
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, [PHONE]: { flexWrap: 'wrap', rowGap: 1.5 } }}>
          <SessionIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Start Work
          </Typography>

          {/* On a phone the picker and Start get the full width, below */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, [PHONE]: { flexBasis: '100%', gap: 1 } }}>
            <TaskSelect
              tasks={startOptions}
              value={selectedTaskId}
              onChange={task => setSelectedTaskId(task.id)}
              label={startOptions.length === 0 ? 'Add a task on the Tasks page to start' : 'Task'}
              disabled={startOptions.length === 0}
              size="small"
              sx={{ minWidth: 300, flex: 1, [PHONE]: { minWidth: 0 } }}
            />

            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon />}
              onClick={start ?? undefined}
              disabled={!start}
              sx={{ minWidth: 120, [PHONE]: { minWidth: 0 } }}
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
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 2, [PHONE]: { flexWrap: 'wrap', columnGap: 1.5, rowGap: 1 } }}
      >
        <SessionIcon color="primary" />
        <Typography
          variant="h6"
          noWrap
          title={sessionTitle(activeSession)}
          sx={{ fontWeight: 600, minWidth: 0, maxWidth: '40%', [PHONE]: { maxWidth: 'none', flex: 1, ...TWO_LINES } }}
        >
          {sessionTitle(activeSession)}
        </Typography>

        <Chip
          label={`${activeSession.timerInstances?.length || 0} timer${(activeSession.timerInstances?.length || 0) !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
        />

        {/* On a phone the session's buttons go on their own line(s) */}
        <PhoneOwnLine sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
            {sessionStatus.running > 0 && (
              <Button variant="outlined" color="warning" size="small" onClick={onPauseAll} startIcon={<PauseIcon />}>
                Pause All
              </Button>
            )}
            {/* One timer runs at a time: resuming while one runs would stop it */}
            {sessionStatus.paused > 0 && sessionStatus.running === 0 && (
              <Button variant="outlined" color="success" size="small" onClick={onResumeAll} startIcon={<ResumeIcon />}>
                Resume All
              </Button>
            )}
          </Box>

          {onSwitchTask && (
            <Button variant="outlined" startIcon={<SwitchIcon />} onClick={onSwitchTask}>
              Switch task
            </Button>
          )}

          <IconButton onClick={handleMenuOpen} aria-label="Session options">
            <MoreIcon />
          </IconButton>

          <Button variant="outlined" color="error" startIcon={<StopIcon />} onClick={onEndSession}>
            End Session
          </Button>
        </PhoneOwnLine>
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
        <MenuItem
          onClick={() => {
            onOpenSessionNotes?.(activeSession.id);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <NotesIcon />
          </ListItemIcon>
          <ListItemText>Session Notes</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
});
