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
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  FolderOpen as SessionIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { TaskSession, TimerInstance, TimerState } from '../../../types/timer';
import { TimerRow } from './TimerRow';

interface SessionTimerDisplayProps {
  session: TaskSession;
  showControls?: boolean;
  showNotes?: boolean;
  size?: 'small' | 'medium' | 'large';
  onStartTimer?: (instanceId: string) => void;
  onStopTimer?: (instanceId: string) => void;
  onPauseTimer?: (instanceId: string) => void;
  onResumeTimer?: (instanceId: string) => void;
  onDeleteTimer?: (instanceId: string) => void;
  onEditTimer?: (instance: TimerInstance, session: TaskSession) => void;
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
  onDeleteTimer,
  onEditTimer,
  onOpenNotes,
  sx,
}: SessionTimerDisplayProps) {
  const runningInstance = session.timerInstances?.find(i => i.state === TimerState.running);


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
            {(session.timerInstances || []).map((instance, index) => {
              const startTime = instance.startTime
                ? (instance.startTime instanceof Date
                    ? instance.startTime
                    : new Date(instance.startTime))
                : undefined;

              return (
                <TimerRow
                  key={instance.id}
                  instance={instance}
                  index={index + 1}
                  startTime={startTime}
                  showControls={showControls}
                  showNotes={showNotes}
                  size={size}
                  onStart={() => onStartTimer?.(instance.id)}
                  onStop={() => onStopTimer?.(instance.id)}
                  onPause={() => onPauseTimer?.(instance.id)}
                  onResume={() => onResumeTimer?.(instance.id)}
                  onDelete={() => onDeleteTimer?.(instance.id)}
                  onEdit={() => onEditTimer?.(instance, session)}
                  onOpenNotes={() => onOpenNotes?.(session.id, instance.id)}
                  isSessionActive={session.isActive}
                />
              );
            })}
          </Stack>
        </Box>
      )}

    </Paper>
  );
