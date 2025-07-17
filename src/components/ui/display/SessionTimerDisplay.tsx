/**
 * Session Timer Display Component
 * 
 * Enhanced timer display that shows session information, multiple timer instances,
 * and provides a clear visual hierarchy between session totals and individual timers.
 */


import { 
  Box, 
  Typography, 
  Chip, 
  Stack, 
  Paper,
  LinearProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  AccessTime,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Timer as TimerIcon,
  FolderOpen as SessionIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { TaskSession, TimerInstance } from '../../../types/timer';
import { formatTime } from '../../../utils/formatters';
import { useTimer } from '../../../hooks/useTimer';

interface SessionTimerDisplayProps {
  session: TaskSession;
  showControls?: boolean;
  showNotes?: boolean;
  size?: 'small' | 'medium' | 'large';
  onStartTimer?: (instanceId: string) => void;
  onStopTimer?: (instanceId: string) => void;
  onPauseTimer?: (instanceId: string) => void;
  onResumeTimer?: (instanceId: string) => void;
  onOpenNotes?: (sessionId: string, instanceId?: string) => void;
  sx?: any;
}

export function SessionTimerDisplay({
  session,
  showControls = false,
  showNotes = false,
  size = 'medium',
  onStartTimer,
  onStopTimer,
  onPauseTimer,
  onResumeTimer,
  onOpenNotes,
  sx,
}: SessionTimerDisplayProps) {
  const runningInstance = session.timerInstances?.find(i => i.isRunning);
  const completedInstances = session.timerInstances?.filter(i => !i.isRunning && !i.isPaused && i.duration) || [];

  // Calculate current elapsed time for running timer
  // Ensure startTime is properly converted to Date object
  const startTime = runningInstance?.startTime
    ? (runningInstance.startTime instanceof Date
        ? runningInstance.startTime
        : new Date(runningInstance.startTime))
    : undefined;

  const currentElapsed = useTimer(
    runningInstance?.isRunning || false,
    startTime
  );

  // Calculate total session time including current running timer
  const totalSessionTime = session.totalDuration + (runningInstance ? currentElapsed : 0);

  const getDisplaySize = () => {
    switch (size) {
      case 'small':
        return {
          sessionTitle: 'body1' as const,
          sessionTime: 'h6' as const,
          instanceTime: 'body2' as const,
          iconSize: 'small' as const,
          spacing: 1,
          padding: 1.5,
        };
      case 'large':
        return {
          sessionTitle: 'h5' as const,
          sessionTime: 'h3' as const,
          instanceTime: 'h6' as const,
          iconSize: 'large' as const,
          spacing: 2,
          padding: 3,
        };
      default:
        return {
          sessionTitle: 'h6' as const,
          sessionTime: 'h5' as const,
          instanceTime: 'body1' as const,
          iconSize: 'medium' as const,
          spacing: 1.5,
          padding: 2,
        };
    }
  };

  const displayConfig = getDisplaySize();

  return (
    <Paper
      elevation={2}
      sx={{
        p: displayConfig.padding,
        borderRadius: 2,
        bgcolor: session.isActive ? 'primary.main' : 'background.paper',
        color: session.isActive ? 'primary.contrastText' : 'text.primary',
        border: runningInstance ? 2 : 1,
        borderColor: runningInstance ? 'success.main' : 'divider',
        ...sx,
      }}
    >
      {/* Session Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: displayConfig.spacing, mb: 2 }}>
        <SessionIcon fontSize={displayConfig.iconSize} />
        <Box sx={{ flex: 1 }}>
          <Typography 
            variant={displayConfig.sessionTitle} 
            sx={{ fontWeight: 600, mb: 0.5 }}
          >
            {session.taskName}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip
              size="small"
              label={`${session.timerInstances?.length || 0} timer${(session.timerInstances?.length || 0) !== 1 ? 's' : ''}`}
              variant="outlined"
              sx={{
                color: session.isActive ? 'primary.contrastText' : 'text.secondary',
                borderColor: session.isActive ? 'primary.contrastText' : 'divider',
              }}
            />
            {session.isActive && (
              <Chip
                size="small"
                label="Active"
                color="success"
              />
            )}
            {runningInstance && (
              <Chip
                size="small"
                label="Running"
                color="success"
                icon={<PlayIcon />}
              />
            )}
          </Stack>
        </Box>
        
        {showNotes && (
          <IconButton
            size="small"
            onClick={() => onOpenNotes?.(session.id)}
            sx={{ 
              color: session.isActive ? 'primary.contrastText' : 'text.secondary' 
            }}
          >
            <NotesIcon />
          </IconButton>
        )}
      </Box>

      {/* Session Total Time */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          p: displayConfig.spacing,
          borderRadius: 1,
          bgcolor: runningInstance ? 'success.dark' : 'grey.800',
          color: 'white',
          mb: 2,
        }}
      >
        <AccessTime fontSize={displayConfig.iconSize} />
        <Typography
          variant={displayConfig.sessionTime}
          component="div"
          sx={{
            fontFamily: '"Roboto Mono", monospace',
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          {formatTime(totalSessionTime)}
        </Typography>
        {runningInstance && (
          <Typography
            variant="caption"
            sx={{
              color: 'success.light',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              ml: 1,
            }}
          >
            Running
          </Typography>
        )}
      </Box>

      {/* Timer Instances */}
      {(session.timerInstances?.length || 0) > 0 && (
        <Box>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              mb: 1,
              color: session.isActive ? 'primary.contrastText' : 'text.secondary',
            }}
          >
            Timer Instances
          </Typography>

          <Stack spacing={1}>
            {(session.timerInstances || []).map((instance, index) => (
              <TimerInstanceRow
                key={instance.id}
                instance={instance}
                index={index + 1}
                currentElapsed={instance.isRunning ? currentElapsed : 0}
                showControls={showControls}
                showNotes={showNotes}
                size={size}
                onStart={() => onStartTimer?.(instance.id)}
                onStop={() => onStopTimer?.(instance.id)}
                onPause={() => onPauseTimer?.(instance.id)}
                onResume={() => onResumeTimer?.(instance.id)}
                onOpenNotes={() => onOpenNotes?.(session.id, instance.id)}
                isSessionActive={session.isActive}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Session Progress (if there's a goal or target) */}
      {(session.timerInstances?.length || 0) > 1 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            sx={{
              color: session.isActive ? 'primary.contrastText' : 'text.secondary',
              mb: 0.5,
              display: 'block'
            }}
          >
            Session Progress
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min((completedInstances.length / (session.timerInstances?.length || 1)) * 100, 100)}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: session.isActive ? 'primary.dark' : 'grey.200',
              '& .MuiLinearProgress-bar': {
                bgcolor: 'success.main',
                borderRadius: 3,
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: session.isActive ? 'primary.contrastText' : 'text.secondary',
              mt: 0.5,
              display: 'block'
            }}
          >
            {completedInstances.length} of {session.timerInstances?.length || 0} timers completed
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// Timer Instance Row Component
interface TimerInstanceRowProps {
  instance: TimerInstance;
  index: number;
  currentElapsed: number;
  showControls: boolean;
  showNotes: boolean;
  size: 'small' | 'medium' | 'large';
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenNotes: () => void;
  isSessionActive: boolean;
}

function TimerInstanceRow({
  instance,
  index,
  currentElapsed,
  showControls,
  showNotes,
  size,
  onStart,
  onStop,
  onPause,
  onResume,
  onOpenNotes,
  isSessionActive,
}: TimerInstanceRowProps) {
  const displayTime = instance.isRunning ? currentElapsed : (instance.duration || 0);
  const isSmall = size === 'small';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        bgcolor: instance.isRunning 
          ? 'success.light' 
          : instance.isPaused 
            ? 'warning.light' 
            : isSessionActive 
              ? 'primary.dark' 
              : 'grey.100',
        color: instance.isRunning || instance.isPaused || isSessionActive ? 'white' : 'text.primary',
      }}
    >
      <TimerIcon fontSize={isSmall ? 'small' : 'medium'} />
      
      <Typography variant={isSmall ? 'caption' : 'body2'} sx={{ minWidth: 60 }}>
        Timer {index}
      </Typography>
      
      <Typography
        variant={isSmall ? 'body2' : 'body1'}
        sx={{
          fontFamily: 'monospace',
          fontWeight: 600,
          flex: 1,
        }}
      >
        {formatTime(displayTime)}
      </Typography>

      {instance.isRunning && (
        <Chip
          size="small"
          label="Running"
          color="success"
          sx={{ fontSize: '0.7rem' }}
        />
      )}

      {instance.isPaused && (
        <Chip
          size="small"
          label="Paused"
          color="warning"
          sx={{ fontSize: '0.7rem' }}
        />
      )}

      {showControls && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {!instance.isRunning && !instance.isPaused && (
            <Tooltip title="Start Timer">
              <IconButton size="small" onClick={onStart} sx={{ color: 'inherit' }}>
                <PlayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          
          {instance.isRunning && (
            <>
              <Tooltip title="Pause Timer">
                <IconButton size="small" onClick={onPause} sx={{ color: 'inherit' }}>
                  <PauseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Stop Timer">
                <IconButton size="small" onClick={onStop} sx={{ color: 'inherit' }}>
                  <StopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          
          {instance.isPaused && (
            <Tooltip title="Resume Timer">
              <IconButton size="small" onClick={onResume} sx={{ color: 'inherit' }}>
                <PlayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {showNotes && (
        <Tooltip title="Timer Notes">
          <IconButton size="small" onClick={onOpenNotes} sx={{ color: 'inherit' }}>
            <NotesIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
