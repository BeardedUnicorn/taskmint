/**
 * Enhanced SessionTimerToolbar Component
 * 
 * Improved version with pause/resume functionality, multiple timer instances,
 * better visual feedback, and proper error handling.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Snackbar,
  LinearProgress,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Add as AddIcon,
  Notes as NotesIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { TaskSession, TimerInstance } from '../../types/timer';
import { Task } from '../../types/task';
import { useNotification } from '../../contexts/NotificationContext';
import { invoke } from '@tauri-apps/api/tauri';

interface EnhancedSessionTimerToolbarProps {
  activeSession: TaskSession | null;
  predefinedTasks: Task[];
  onStartSession: (taskId: string | null, taskName: string) => Promise<void>;
  onStopSession: (sessionId: string) => Promise<void>;
  onCreateTimerInstance: (sessionId: string) => Promise<void>;
  onStartTimer: (instanceId: string) => Promise<void>;
  onStopTimer: (instanceId: string) => Promise<void>;
  onPauseTimer: (instanceId: string) => Promise<void>;
  onResumeTimer: (instanceId: string) => Promise<void>;
  onOpenNotes: (instanceId?: string) => void;
}

// Timer status indicator component
const TimerStatusIndicator: React.FC<{ 
  status: 'running' | 'paused' | 'stopped';
  count?: number;
}> = ({ status, count }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'running':
        return { 
          color: 'success' as const, 
          icon: <PlayArrowIcon fontSize="small" />, 
          label: 'Running',
          pulse: true 
        };
      case 'paused':
        return { 
          color: 'warning' as const, 
          icon: <PauseIcon fontSize="small" />, 
          label: 'Paused',
          pulse: false 
        };
      case 'stopped':
        return { 
          color: 'default' as const, 
          icon: <StopIcon fontSize="small" />, 
          label: 'Stopped',
          pulse: false 
        };
    }
  };

  const config = getStatusConfig();
  const displayLabel = count ? `${config.label} (${count})` : config.label;

  return (
    <Chip
      icon={config.icon}
      label={displayLabel}
      color={config.color}
      size="small"
      sx={{
        animation: config.pulse ? 'pulse 2s infinite' : 'none',
        '@keyframes pulse': {
          '0%': { opacity: 1 },
          '50%': { opacity: 0.7 },
          '100%': { opacity: 1 },
        },
      }}
    />
  );
};

// Individual timer instance card
const TimerInstanceCard: React.FC<{
  instance: TimerInstance;
  index: number;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenNotes: () => void;
}> = ({ instance, index, elapsed, onStart, onStop, onPause, onResume, onOpenNotes }) => {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getTimerStatus = (): 'running' | 'paused' | 'stopped' => {
    if (instance.isRunning) return 'running';
    if (instance.isPaused) return 'paused';
    return 'stopped';
  };

  return (
    <Box
      data-testid="timer-instance"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        p: 2,
        borderRadius: 2,
        backgroundColor: instance.isRunning ? 'success.dark' : 'grey.800',
        color: 'white',
        minWidth: 140,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
      }}
    >
      <Typography variant="caption" fontWeight="bold">
        Timer {index}
      </Typography>
      
      <Typography
        variant="h6"
        fontFamily="monospace"
        fontWeight="bold"
        data-testid="timer-display"
      >
        {formatTime(elapsed)}
      </Typography>

      <TimerStatusIndicator status={getTimerStatus()} />

      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
        {instance.isRunning ? (
          <>
            <Tooltip title="Pause Timer">
              <IconButton size="small" onClick={onPause} color="inherit">
                <PauseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Stop Timer">
              <IconButton size="small" onClick={onStop} color="inherit">
                <StopIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ) : instance.isPaused ? (
          <>
            <Tooltip title="Resume Timer">
              <IconButton size="small" onClick={onResume} color="inherit">
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Stop Timer">
              <IconButton size="small" onClick={onStop} color="inherit">
                <StopIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Tooltip title="Start Timer">
            <IconButton size="small" onClick={onStart} color="inherit">
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        
        <Tooltip title="Timer Notes">
          <IconButton size="small" onClick={onOpenNotes} color="inherit">
            <NotesIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

// Main enhanced session timer bar component
export const EnhancedSessionTimerToolbar: React.FC<EnhancedSessionTimerToolbarProps> = ({
  activeSession,
  predefinedTasks,
  onStartSession,
  onStopSession,
  onCreateTimerInstance,
  onStartTimer,
  onStopTimer,
  onPauseTimer,
  onResumeTimer,
  onOpenNotes,
}) => {
  const { showError, showSuccess } = useNotification();
  const [selectedTask, setSelectedTask] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [timerElapsed, setTimerElapsed] = useState<Record<string, number>>({});

  // Update timer elapsed times
  useEffect(() => {
    if (!activeSession) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const newElapsed: Record<string, number> = {};

      activeSession.timerInstances.forEach(instance => {
        if (instance.isRunning && instance.startTime) {
          newElapsed[instance.id] = now - new Date(instance.startTime).getTime();
        } else {
          newElapsed[instance.id] = instance.duration || 0;
        }
      });

      setTimerElapsed(newElapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const handleStartSession = useCallback(async () => {
    if (!selectedTask.trim()) return;

    setIsLoading(true);
    try {
      const task = predefinedTasks.find(t => t.name === selectedTask);
      await onStartSession(task?.id || null, selectedTask);
      setSelectedTask('');
      showSuccess('Session started successfully');
    } catch (error) {
      showError('Failed to start session');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTask, predefinedTasks, onStartSession, showError, showSuccess]);

  const handleStopSession = useCallback(async () => {
    if (!activeSession) return;

    setIsLoading(true);
    try {
      await onStopSession(activeSession.id);
      showSuccess('Session ended successfully');
    } catch (error) {
      showError('Failed to end session');
    } finally {
      setIsLoading(false);
    }
  }, [activeSession, onStopSession, showError, showSuccess]);

  const handleAddTimerInstance = useCallback(async () => {
    if (!activeSession) return;

    try {
      await onCreateTimerInstance(activeSession.id);
      showSuccess('Timer instance added');
    } catch (error) {
      showError('Failed to add timer instance');
    }
  }, [activeSession, onCreateTimerInstance, showError, showSuccess]);

  // Timer operation handlers with error handling
  const createTimerHandler = (operation: string, handler: (id: string) => Promise<void>) => 
    async (instanceId: string) => {
      try {
        await handler(instanceId);
        showSuccess(`Timer ${operation} successfully`);
      } catch (error) {
        showError(`Failed to ${operation} timer`);
      }
    };

  const handleStartTimer = createTimerHandler('started', onStartTimer);
  const handleStopTimer = createTimerHandler('stopped', onStopTimer);
  const handlePauseTimer = createTimerHandler('paused', onPauseTimer);
  const handleResumeTimer = createTimerHandler('resumed', onResumeTimer);

  // Calculate session statistics
  const getSessionStats = () => {
    if (!activeSession) return null;

    const runningCount = activeSession.timerInstances.filter(i => i.isRunning).length;
    const pausedCount = activeSession.timerInstances.filter(i => i.isPaused).length;
    const totalInstances = activeSession.timerInstances.length;

    return { runningCount, pausedCount, totalInstances };
  };

  const stats = getSessionStats();

  if (!activeSession) {
    // No active session - show session creation interface
    return (
      <Box sx={{ p: 2, backgroundColor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Start New Session
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Select or enter task name..."
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '16px',
            }}
            list="task-suggestions"
          />
          
          <datalist id="task-suggestions">
            {predefinedTasks.map(task => (
              <option key={task.id} value={task.name} />
            ))}
          </datalist>
          
          <Button
            variant="contained"
            onClick={handleStartSession}
            disabled={!selectedTask.trim() || isLoading}
            startIcon={<PlayArrowIcon />}
          >
            Start Session
          </Button>
        </Box>

        {isLoading && <LinearProgress sx={{ mt: 1 }} />}
      </Box>
    );
  }

  // Active session interface
  return (
    <Box sx={{ p: 2, backgroundColor: 'background.paper', borderRadius: 2 }}>
      {/* Session header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6">
            {activeSession.taskName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {stats && (
              <>
                {stats.totalInstances} timer{stats.totalInstances !== 1 ? 's' : ''} • 
                Total: {Math.floor(activeSession.totalDuration / 1000 / 60)}m
              </>
            )}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {stats && stats.runningCount > 0 && (
            <TimerStatusIndicator status="running" count={stats.runningCount} />
          )}
          {stats && stats.pausedCount > 0 && (
            <TimerStatusIndicator status="paused" count={stats.pausedCount} />
          )}
          
          <Button
            variant="outlined"
            color="error"
            onClick={handleStopSession}
            disabled={isLoading}
            size="small"
          >
            End Session
          </Button>
        </Box>
      </Box>

      {/* Timer instances */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        {activeSession.timerInstances.map((instance, index) => (
          <TimerInstanceCard
            key={instance.id}
            instance={instance}
            index={index + 1}
            elapsed={timerElapsed[instance.id] || 0}
            onStart={() => handleStartTimer(instance.id)}
            onStop={() => handleStopTimer(instance.id)}
            onPause={() => handlePauseTimer(instance.id)}
            onResume={() => handleResumeTimer(instance.id)}
            onOpenNotes={() => onOpenNotes(instance.id)}
          />
        ))}
        
        <Button
          variant="outlined"
          onClick={handleAddTimerInstance}
          startIcon={<AddIcon />}
          sx={{
            minWidth: 140,
            minHeight: 120,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          Add Timer
        </Button>
      </Box>

      {/* Session actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={() => onOpenNotes()}
          startIcon={<NotesIcon />}
          size="small"
        >
          Session Notes
        </Button>
      </Box>

      {isLoading && <LinearProgress sx={{ mt: 1 }} />}
    </Box>
  );
};
