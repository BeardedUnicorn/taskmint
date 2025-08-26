import { Box, Typography, Chip, Tooltip, IconButton } from '@mui/material';
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
import { useTimer } from '../../../hooks/useTimer';

export interface TimerRowProps {
  instance: TimerInstance;
  index: number;
  startTime?: Date;
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
  isSessionActive: boolean;
}

export function TimerRow({
  instance,
  index,
  startTime,
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
  isSessionActive,
}: TimerRowProps) {
  const currentElapsed = useTimer(instance.state === TimerState.running, startTime);
  const displayTime = instance.state === TimerState.running ? currentElapsed : instance.duration || 0;
  const isSmall = size === 'small';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        bgcolor: instance.state === TimerState.running
          ? 'success.light'
          : instance.state === TimerState.paused
            ? 'warning.light'
            : isSessionActive
              ? 'primary.dark'
              : 'grey.100',
        color: instance.state === TimerState.running || instance.state === TimerState.paused || isSessionActive
          ? 'white'
          : 'text.primary',
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

      {instance.state === TimerState.running && (
        <Chip
          size="small"
          label="Running"
          color="success"
          sx={{ fontSize: '0.7rem' }}
        />
      )}

      {instance.state === TimerState.paused && (
        <Chip
          size="small"
          label="Paused"
          color="warning"
          sx={{ fontSize: '0.7rem' }}
        />
      )}

      {showControls && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {instance.state !== TimerState.running && instance.state !== TimerState.paused && (
            <Tooltip title="Start Timer">
              <IconButton size="small" onClick={onStart} sx={{ color: 'inherit' }}>
                <PlayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {instance.state === TimerState.running && (
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

          {instance.state === TimerState.paused && (
            <Tooltip title="Resume Timer">
              <IconButton size="small" onClick={onResume} sx={{ color: 'inherit' }}>
                <PlayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Edit and Delete buttons - only show for stopped timers */}
          {instance.state !== TimerState.running && instance.state !== TimerState.paused && (
            <>
              <Tooltip title="Edit Timer">
                <IconButton size="small" onClick={onEdit} sx={{ color: 'inherit' }}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete Timer">
                <IconButton size="small" onClick={onDelete} sx={{ color: 'inherit' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
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

