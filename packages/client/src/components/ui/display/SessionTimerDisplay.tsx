/**
 * Session Timer Display Component
 *
 * The detailed view of a session: header with the live session total,
 * per-timer rows with controls, and an Add Timer affordance. This panel is
 * the single surface for managing the active session's timers — the toolbar
 * above it only carries session-level actions.
 */

import {
  Box,
  Typography,
  Chip,
  Stack,
  Paper,
  IconButton,
  Button,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  PlayArrow as PlayIcon,
  FolderOpen as SessionIcon,
  Notes as NotesIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { memo } from 'react';
import { TaskSession, TimerInstance, TimerState } from '../../../types/timer';
import { formatTime } from '../../../utils/formatters';
import { getSessionElapsedMs } from '../../../utils/timerHelpers';
import { SESSION_CONSTANTS } from '../../../constants';
import { TimerRow } from './TimerRow';

interface SessionTimerDisplayProps {
  session: TaskSession;
  /** Shared page clock — the total and running rows tick off this value. */
  nowMs: number;
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
  onAddTimer?: () => void;
  sx?: SxProps<Theme>;
}

// Memoized so dashboard state changes (dialogs, selection) don't re-render
// the panel; while a timer runs, the shared nowMs prop changes once a second
// and deliberately re-renders it — that tick is the panel's clock.
export const SessionTimerDisplay = memo(function SessionTimerDisplay({
  session,
  nowMs,
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
  onAddTimer,
  sx,
}: SessionTimerDisplayProps) {
  const runningInstance = session.timerInstances?.find(i => i.state === TimerState.running);
  const timerCount = session.timerInstances?.length || 0;
  const atTimerLimit = timerCount >= SESSION_CONSTANTS.MAX_TIMER_INSTANCES_PER_SESSION;

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
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: runningInstance ? 'success.main' : 'divider',
        borderLeft: '4px solid',
        borderLeftColor: runningInstance
          ? 'success.main'
          : session.isActive
            ? 'primary.main'
            : 'divider',
        ...sx,
      }}
    >
      {/* Session Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: displayConfig.spacing, mb: 2 }}>
        <SessionIcon fontSize={displayConfig.iconSize} color="primary" />
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
              label={`${timerCount} timer${timerCount !== 1 ? 's' : ''}`}
              variant="outlined"
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

        <Typography
          variant={displayConfig.sessionTime}
          component="span"
          aria-label="Session total time"
          sx={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 700 }}
        >
          {formatTime(getSessionElapsedMs(session, nowMs))}
        </Typography>

        {showNotes && (
          <IconButton
            size="small"
            onClick={() => onOpenNotes?.(session.id)}
            aria-label="Session notes"
          >
            <NotesIcon />
          </IconButton>
        )}
      </Box>

      {/* Timers */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, color: 'text.secondary' }}
          >
            Timers
          </Typography>
          {onAddTimer && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={onAddTimer}
              disabled={atTimerLimit}
            >
              Add Timer
            </Button>
          )}
        </Box>

        {timerCount === 0 ? (
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'divider',
              textAlign: 'center',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No timers yet — add one to start tracking.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {(session.timerInstances || []).map((instance, index) => (
              <TimerRow
                key={instance.id}
                instance={instance}
                index={index + 1}
                nowMs={nowMs}
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
              />
            ))}
          </Stack>
        )}
      </Box>

    </Paper>
  );

});
