import { Box, Typography, Chip, Tooltip, IconButton } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Timer as TimerIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { TimerInstance, TimerState } from '../../../types/timer';
import { formatTime } from '../../../utils/formatters';
import { getInstanceElapsedMs } from '../../../utils/timerHelpers';

export interface TimerRowProps {
  instance: TimerInstance;
  index: number;
  /** Shared page clock — running rows derive their live elapsed from it. */
  nowMs: number;
  showControls: boolean;
  showNotes: boolean;
  size: 'small' | 'medium' | 'large';
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpenNotes: () => void;
}

export function TimerRow({
  instance,
  index,
  nowMs,
  showControls,
  showNotes,
  size,
  onStart,
  onStop,
  onPause,
  onResume,
  onDelete,
  onEdit,
  onOpenNotes,
}: TimerRowProps) {
  // getInstanceElapsedMs covers every state: running counts from nowMs,
  // paused shows its frozen elapsed, stopped its recorded duration.
  const displayTime = getInstanceElapsedMs(instance, nowMs);
  const isSmall = size === 'small';
  const isRunning = instance.state === TimerState.running;
  const isPaused = instance.state === TimerState.paused;
  const isStopped = instance.state === TimerState.stopped;

  return (
    <Box
      data-testid="timer-instance"
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        border: '1px solid',
        borderLeft: '3px solid',
        ...(isRunning
          ? {
              bgcolor: alpha(theme.palette.success.main, 0.15),
              borderColor: alpha(theme.palette.success.main, 0.4),
              borderLeftColor: theme.palette.success.main,
            }
          : isPaused
            ? {
                bgcolor: alpha(theme.palette.warning.main, 0.15),
                borderColor: alpha(theme.palette.warning.main, 0.4),
                borderLeftColor: theme.palette.warning.main,
              }
            : {
                bgcolor: 'background.default',
                borderColor: 'divider',
                borderLeftColor: 'divider',
              }),
      })}
    >
      <TimerIcon fontSize={isSmall ? 'small' : 'medium'} sx={{ color: 'text.secondary' }} />

      <Typography variant={isSmall ? 'caption' : 'body2'} sx={{ minWidth: 60, color: 'text.secondary' }}>
        Timer {index}
      </Typography>

      <Typography
        variant={isSmall ? 'body2' : 'body1'}
        sx={{
          fontFamily: '"Roboto Mono", monospace',
          fontWeight: 600,
          flex: 1,
          color: isStopped ? 'text.secondary' : 'text.primary',
        }}
      >
        {formatTime(displayTime)}
      </Typography>

      {isRunning && (
        <Chip
          size="small"
          label="Running"
          color="success"
          sx={{ fontSize: '0.7rem' }}
        />
      )}

      {isPaused && (
        <Chip
          size="small"
          label="Paused"
          color="warning"
          sx={{ fontSize: '0.7rem' }}
        />
      )}

      {showControls && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {/* A completed (stopped) timer is final: Start only appears on fresh timers */}
          {instance.state === TimerState.idle && (
            <Tooltip title="Start Timer">
              <IconButton size="small" onClick={onStart}>
                <PlayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {isRunning && (
            <>
              <Tooltip title="Pause Timer">
                <IconButton size="small" onClick={onPause}>
                  <PauseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Stop Timer">
                <IconButton size="small" onClick={onStop}>
                  <StopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {isPaused && (
            <>
              <Tooltip title="Resume Timer">
                <IconButton size="small" onClick={onResume}>
                  <PlayIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Stop Timer">
                <IconButton size="small" onClick={onStop}>
                  <StopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {isStopped && (
            <Tooltip title="Edit Timer">
              <IconButton size="small" onClick={onEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {(instance.state === TimerState.idle || isStopped) && (
            <Tooltip title="Delete Timer">
              <IconButton size="small" onClick={onDelete}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {showNotes && (
        <Tooltip title="Timer Notes">
          <IconButton size="small" onClick={onOpenNotes}>
            <NotesIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
