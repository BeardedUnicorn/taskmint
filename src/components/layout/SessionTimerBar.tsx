/**
 * Session Timer Bar Component
 * 
 * Enhanced timer bar that supports session-based timing with multiple
 * timer instances, session selection, and improved visual hierarchy.
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
  Stack,
  Divider,
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
  NoteAdd as NoteAddIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
  FolderOpen as SessionIcon,
  RadioButtonChecked as RunningIcon,
  PauseCircle as PausedIcon,
  StopCircle as StoppedIcon,
  Replay as ResumeIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { Task } from '../../types/task';
import { useTimer } from '../../hooks/useTimer';
import { formatTime } from '../../utils/formatters';
import { useNotification } from '../../contexts/NotificationContext';
import { SESSION_CONSTANTS } from '../../constants';

// Status indicator component with animations
interface TimerStatusIndicatorProps {
  status: 'running' | 'paused' | 'stopped';
  size?: 'small' | 'medium';
}

function TimerStatusIndicator({ status, size = 'medium' }: TimerStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'running':
        return {
          color: 'success.main',
          icon: <RunningIcon />,
          label: 'Running',
          animation: 'pulse 2s infinite'
        };
      case 'paused':
        return {
          color: 'warning.main',
          icon: <PausedIcon />,
          label: 'Paused',
          animation: 'none'
        };
      case 'stopped':
        return {
          color: 'grey.500',
          icon: <StoppedIcon />,
          label: 'Stopped',
          animation: 'none'
        };
    }
  };

  const config = getStatusConfig();
  const iconSize = size === 'small' ? 16 : 20;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        '@keyframes pulse': {
          '0%': { opacity: 1 },
          '50%': { opacity: 0.6 },
          '100%': { opacity: 1 },
        },
      }}
    >
      <Box
        sx={{
          color: config.color,
          animation: config.animation,
          display: 'flex',
          alignItems: 'center',
          '& svg': { fontSize: iconSize },
        }}
      >
        {config.icon}
      </Box>
      {size === 'medium' && (
        <Typography variant="caption" sx={{ color: config.color, fontWeight: 600 }}>
          {config.label}
        </Typography>
      )}
    </Box>
  );
}

interface SessionTimerBarProps {
  activeSession: TaskSession | null;
  predefinedTasks: Task[];
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession | null>;
  onEndSession: () => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onCreateTimerInstance: (sessionId: string) => Promise<TimerInstance | null>;
  onStartTimer: (instanceId: string) => Promise<void>;
  onStopTimer: (instanceId: string) => Promise<void>;
  onPauseTimer: (instanceId: string) => Promise<void>;
  onResumeTimer: (instanceId: string) => Promise<void>;
  onDeleteTimer?: (instanceId: string) => Promise<void>;
  onEditTimer?: (instance: TimerInstance) => void;
  onOpenSessionNotes?: (sessionId: string) => void;
  onOpenTimerNotes?: (instanceId: string) => void;
}

export const SessionTimerBar = memo(function SessionTimerBar({
  activeSession,
  predefinedTasks,
  onStartSession,
  onEndSession,
  onPauseAll,
  onResumeAll,
  onCreateTimerInstance,
  onStartTimer,
  onStopTimer,
  onPauseTimer,
  onResumeTimer,
  onDeleteTimer,
  onEditTimer,
  onOpenSessionNotes,
  onOpenTimerNotes,
}: SessionTimerBarProps) {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const { showError } = useNotification();

  // We don't need a single global elapsed timer anymore since each instance will calculate its own
  
  const sessionStatus = useMemo(() => {
    if (!activeSession || !Array.isArray(activeSession.timerInstances)) return { running: 0, paused: 0 };
    return {
        running: activeSession.timerInstances.filter(t => t.state === TimerState.running).length,
        paused: activeSession.timerInstances.filter(t => t.state === TimerState.paused).length,
    };
  }, [activeSession?.timerInstances]);

  const isAddTimerDisabled = useMemo(
      () =>
        (activeSession?.timerInstances?.length ?? 0) >=
        SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION,
      [activeSession?.timerInstances]
    );

  // Remove the old getInstanceElapsedTime function since each TimerInstanceCard will handle its own timing

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

  const handleAddTimerInstance = useCallback(async () => {
    if (!activeSession) {
      console.warn('No active session available for adding timer instance');
      return;
    }

    try {
      await onCreateTimerInstance(activeSession.id);
      // Don't automatically start the new timer - let user start it manually
    } catch (error) {
      console.error('Failed to add timer instance:', error);
      showError(
        error instanceof Error ? error.message : 'Failed to add timer instance'
      );
    }
  }, [activeSession, onCreateTimerInstance, showError]);

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
        bgcolor: 'secondary.main',
        color: 'secondary.contrastText',
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <SessionIcon />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {activeSession.taskName}
        </Typography>
        
        <Chip
          label={`${activeSession.timerInstances?.length || 0} timer${(activeSession.timerInstances?.length || 0) !== 1 ? 's' : ''}`}
          size="small"
          sx={{ bgcolor: 'secondary.dark', color: 'secondary.contrastText', fontWeight: 600 }}
        />
        
        <Box sx={{ flex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
            {sessionStatus.running > 0 && <Button variant="outlined" color="warning" size="small" onClick={onPauseAll} startIcon={<PauseIcon />}>Pause All</Button>}
            {sessionStatus.paused > 0 && <Button variant="outlined" color="success" size="small" onClick={onResumeAll} startIcon={<ResumeIcon />}>Resume All</Button>}
        </Box>
        
        
        <IconButton
          onClick={handleMenuOpen}
          sx={{ color: 'secondary.contrastText' }}
        >
          <MoreIcon />
        </IconButton>
        
        <Button
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          onClick={onEndSession}
          sx={{ 
            color: 'secondary.contrastText', 
            borderColor: 'secondary.contrastText',
            '&:hover': { bgcolor: 'error.main', borderColor: 'error.main', color: 'error.contrastText' }
          }}
        >
          End Session
        </Button>
      </Box>

      <Divider sx={{ bgcolor: 'secondary.contrastText', opacity: 0.3, mb: 2 }} />

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        {(activeSession.timerInstances || []).map((instance, index) => {
          const callbacks = {
            onStart: () => onStartTimer(instance.id),
            onStop: () => onStopTimer(instance.id),
            onPause: () => onPauseTimer(instance.id),
            onResume: () => onResumeTimer(instance.id),
            onOpenNotes: () => onOpenTimerNotes?.(instance.id),
            onDelete: () => onDeleteTimer?.(instance.id),
            onEdit: () => onEditTimer?.(instance),
          };

          return (
            <TimerInstanceCard
              key={instance.id}
              instance={instance}
              index={index + 1}
              {...callbacks}
            />
          );
        })}
        
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddTimerInstance}
          disabled={isAddTimerDisabled}
          sx={{ color: 'secondary.contrastText', borderColor: 'secondary.contrastText', minWidth: 140 }}
        >
          Add Timer
        </Button>
      </Stack>

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

// Timer Instance Card Component
interface TimerInstanceCardProps {
  instance: TimerInstance;
  index: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenNotes?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

const TimerInstanceCard = memo(function TimerInstanceCard({
  instance,
  index,
  onStart,
  onStop,
  onPause,
  onResume,
  onOpenNotes,
  onDelete,
  onEdit,
}: TimerInstanceCardProps) {
  // Determine timer state from instance properties
  const getTimerState = () => {
    switch (instance.state) {
      case TimerState.running:
        return 'running';
      case TimerState.paused:
        return 'paused';
      default:
        return 'stopped';
    }
  };

  const timerState = getTimerState();

  // Calculate elapsed time for this specific instance
  const startTime = useMemo(() => {
    if (instance.state !== TimerState.running || !instance.startTime) return undefined;
    return instance.startTime instanceof Date
      ? instance.startTime
      : new Date(instance.startTime);
  }, [instance.state, instance.startTime]);

  const liveElapsed = useTimer(instance.state === TimerState.running, startTime);

  const getInstanceElapsedTime = useCallback((): number => {
    if (instance.state === TimerState.running) {
      // For running timers, use the live elapsed time from useTimer hook
      return liveElapsed;
    } else if (instance.state === TimerState.paused) {
      // For paused timers, calculate elapsed time up to pause point
      const startTimeMs = instance.startTime instanceof Date ? instance.startTime.getTime() : new Date(instance.startTime).getTime();
      const pausedAtMs = instance.pausedAt instanceof Date ? instance.pausedAt.getTime() : new Date(instance.pausedAt || Date.now()).getTime();
      const elapsedToPause = pausedAtMs - startTimeMs;
      const previousPausedDuration = instance.pausedDuration || 0;
      return Math.max(0, elapsedToPause - previousPausedDuration);
    } else {
      // For stopped timers, show their stored duration (preserves previous values)
      return instance.duration || 0;
    }
  }, [instance, liveElapsed]);

  const elapsed = getInstanceElapsedTime();

  // Determine background color and text color based on timer state
  const getTimerStyles = () => {
    switch (timerState) {
      case 'running':
        return {
          bgcolor: '#2e7d32', // success.dark
          color: '#ffffff',
          boxShadow: '0 0 12px rgba(76, 175, 80, 0.4)',
          border: '1px solid rgba(76, 175, 80, 0.3)',
        };
      case 'paused':
        return {
          bgcolor: '#f57c00', // warning.dark
          color: '#ffffff',
          boxShadow: '0 0 12px rgba(255, 152, 0, 0.4)',
          border: '1px solid rgba(255, 152, 0, 0.3)',
        };
      case 'stopped':
      default:
        return {
          bgcolor: '#424242', // grey.800
          color: '#ffffff',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        };
    }
  };

  const timerStyles = getTimerStyles();

  return (
    <Box
      component="section"
      tabIndex={0}
      role="region"
      aria-label={`Timer ${index}: ${timerState}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        p: 2,
        borderRadius: 2,
        minWidth: 140,
        minHeight: 120,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        backgroundColor: timerStyles.bgcolor,
        color: timerStyles.color,
        boxShadow: timerStyles.boxShadow,
        border: timerStyles.border,
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: timerState === 'running' 
            ? '0 0 16px rgba(76, 175, 80, 0.6)' 
            : timerState === 'paused'
            ? '0 0 16px rgba(255, 152, 0, 0.6)'
            : '0 4px 8px rgba(0, 0, 0, 0.3)',
        },
        '&:focus': {
          outline: '2px solid #ffffff',
          outlineOffset: '2px',
        },
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (timerState === 'running') onPause();
          else if (timerState === 'paused') onResume();
          else onStart();
        }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography 
          variant="caption" 
          sx={{ 
            fontWeight: 700, 
            fontSize: '0.75rem',
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          Timer {index}
        </Typography>
        <TimerStatusIndicator
          status={timerState}
          size="small"
        />
      </Box>
      
      <Typography
        variant="h6"
        component="time"
        aria-label={`Timer ${index} elapsed time: ${formatTime(elapsed)}`}
        sx={{ 
          fontFamily: 'monospace', 
          fontWeight: 700, 
          fontSize: '1.1rem',
          color: '#ffffff',
          textAlign: 'center',
          mb: 1,
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
        }}
      >
        {formatTime(elapsed)}
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 0.5 }} role="group" aria-label={`Timer ${index} controls`}>
        {timerState === 'running' ? (
          <>
            <IconButton 
              size="small" 
              onClick={onPause} 
              sx={{ 
                color: '#ffffff',
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
              }} 
              aria-label={`Pause timer ${index}`}
            >
              <PauseIcon fontSize="small" />
            </IconButton>
            <IconButton 
              size="small" 
              onClick={onStop} 
              sx={{ 
                color: '#ffffff',
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
              }} 
              aria-label={`Stop timer ${index}`}
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </>
        ) : timerState === 'paused' ? (
          <>
            <IconButton 
              size="small" 
              onClick={onResume} 
              sx={{ 
                color: '#ffffff',
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
              }} 
              aria-label={`Resume timer ${index}`}
            >
              <PlayIcon fontSize="small" />
            </IconButton>
            <IconButton 
              size="small" 
              onClick={onStop} 
              sx={{ 
                color: '#ffffff',
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
              }} 
              aria-label={`Stop timer ${index}`}
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </>
        ) : (
          <IconButton
            size="small"
            onClick={onStart}
            sx={{
              color: '#ffffff',
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
            }}
            aria-label={`Start timer ${index}`}
          >
            <PlayIcon fontSize="small" />
          </IconButton>
        )}

        {timerState === 'stopped' && (
          <>
            {onEdit && (
              <IconButton
                size="small"
                onClick={onEdit}
                sx={{
                  color: '#ffffff',
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
                }}
                aria-label={`Edit timer ${index}`}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                size="small"
                onClick={onDelete}
                sx={{
                  color: '#ffffff',
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
                }}
                aria-label={`Delete timer ${index}`}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </>
        )}

        {onOpenNotes && (
          <IconButton
            size="small"
            onClick={onOpenNotes}
            sx={{ 
              color: '#ffffff',
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' }
            }} 
            aria-label={`Open notes for timer ${index}`}
          >
            <NoteAddIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
});
