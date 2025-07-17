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
} from '@mui/icons-material';
import { TaskSession, TimerInstance } from '../../types/timer';
import { Task } from '../../types/task';
import { useTimer } from '../../hooks/useTimer';
import { formatTime } from '../../utils/formatters';

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
  onOpenSessionNotes?: (sessionId: string) => void;
  onOpenTimerNotes?: (instanceId: string) => void;
}

export function SessionTimerBar({
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
  onOpenSessionNotes,
  onOpenTimerNotes,
}: SessionTimerBarProps) {
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Get running timer instance
  const runningInstance = activeSession?.timerInstances?.find(i => i.isRunning);

  // Calculate elapsed time for running timer
  const startTime = runningInstance?.startTime
    ? (runningInstance.startTime instanceof Date
        ? runningInstance.startTime
        : new Date(runningInstance.startTime))
    : undefined;

  const elapsed = useTimer(
    runningInstance?.isRunning || false,
    startTime
  );
  
  const sessionStatus = useMemo(() => {
    if (!activeSession || !Array.isArray(activeSession.timerInstances)) return { running: 0, paused: 0 };
    return {
        running: activeSession.timerInstances.filter(t => t.isRunning).length,
        paused: activeSession.timerInstances.filter(t => t.isPaused).length,
    };
  }, [activeSession]);

  const getInstanceElapsedTime = (instance: TimerInstance): number => {
    if (instance.isRunning) {
      return elapsed;
    } else if (instance.isPaused) {
      const startTimeMs = instance.startTime instanceof Date ? instance.startTime.getTime() : new Date(instance.startTime).getTime();
      const pausedAtMs = instance.pausedAt instanceof Date ? instance.pausedAt.getTime() : new Date(instance.pausedAt || Date.now()).getTime();
      const elapsedToPause = pausedAtMs - startTimeMs;
      const previousPausedDuration = instance.pausedDuration || 0;
      return Math.max(0, elapsedToPause - previousPausedDuration);
    }
    return instance.duration || 0;
  };

  const taskOptions = predefinedTasks.map(task => ({ label: task.name, id: task.id }));

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
      const newInstance = await onCreateTimerInstance(activeSession.id);
      if (newInstance?.id) {
        await onStartTimer(newInstance.id);
      }
    } catch (error) {
      console.error('Failed to add timer instance:', error);
      alert(`Failed to add timer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [activeSession, onCreateTimerInstance, onStartTimer]);

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
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Total:
          </Typography>
          <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {formatTime((activeSession.timerInstances || []).reduce((total, instance) => total + getInstanceElapsedTime(instance), 0))}
          </Typography>
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
          };

          return (
            <TimerInstanceCard
              key={instance.id}
              instance={instance}
              index={index + 1}
              isRunning={instance.isRunning}
              elapsed={getInstanceElapsedTime(instance)}
              {...callbacks}
            />
          );
        })}
        
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddTimerInstance}
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
}

// Timer Instance Card Component
interface TimerInstanceCardProps {
  instance: TimerInstance;
  index: number;
  isRunning: boolean;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenNotes?: () => void;
}

const TimerInstanceCard = memo(function TimerInstanceCard({
  instance,
  index,
  isRunning,
  elapsed,
  onStart,
  onStop,
  onPause,
  onResume,
  onOpenNotes,
}: TimerInstanceCardProps) {
  return (
    <Box
      component="section"
      tabIndex={0}
      role="region"
      aria-label={`Timer ${index}: ${isRunning ? 'running' : instance.isPaused ? 'paused' : 'stopped'}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        p: 1.5,
        borderRadius: 1,
        bgcolor: isRunning ? 'success.dark' : instance.isPaused ? 'warning.dark' : 'secondary.dark',
        color: 'white',
        minWidth: 120,
        transition: 'background-color 0.3s ease, transform 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 2,
        },
        '&:focus': {
          outline: '2px solid white',
          outlineOffset: '2px',
        },
        ...(isRunning && {
          boxShadow: '0 0 10px rgba(76, 175, 80, 0.3)',
        }),
        ...(instance.isPaused && {
          boxShadow: '0 0 10px rgba(255, 152, 0, 0.3)',
        }),
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isRunning) onPause();
          else if (instance.isPaused) onResume();
          else onStart();
        }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.8 }}>
          Timer {index}
        </Typography>
        <TimerStatusIndicator
          status={isRunning ? 'running' : instance.isPaused ? 'paused' : 'stopped'}
          size="small"
        />
      </Box>
      
      <Typography
        variant="body1"
        component="time"
        aria-label={`Timer ${index} elapsed time: ${formatTime(elapsed)}`}
        sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.9rem' }}
      >
        {formatTime(elapsed)}
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 0.5 }} role="group" aria-label={`Timer ${index} controls`}>
        {isRunning ? (
          <>
            <IconButton size="small" onClick={onPause} sx={{ color: 'white' }} aria-label={`Pause timer ${index}`}><PauseIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={onStop} sx={{ color: 'white' }} aria-label={`Stop timer ${index}`}><StopIcon fontSize="small" /></IconButton>
          </>
        ) : instance.isPaused ? (
          <>
            <IconButton size="small" onClick={onResume} sx={{ color: 'white' }} aria-label={`Resume timer ${index}`}><PlayIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={onStop} sx={{ color: 'white' }} aria-label={`Stop timer ${index}`}><StopIcon fontSize="small" /></IconButton>
          </>
        ) : (
          <IconButton size="small" onClick={onStart} sx={{ color: 'white' }} aria-label={`Start timer ${index}`}><PlayIcon fontSize="small" /></IconButton>
        )}

        {onOpenNotes && <IconButton size="small" onClick={onOpenNotes} sx={{ color: 'white' }} aria-label={`Open notes for timer ${index}`}><NoteAddIcon fontSize="small" /></IconButton>}
      </Box>
    </Box>
  );
});