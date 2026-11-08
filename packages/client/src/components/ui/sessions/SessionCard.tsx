/**
 * One session in the list: its tasks, time (ticking while it's live), each
 * task's time when it ran several, timers, source and newest note, with
 * Activate/End, Notes and a menu.
 */

import { memo, MouseEvent } from 'react';
import { Box, Button, Card, CardContent, Chip, IconButton, Stack, Typography } from '@mui/material';
import {
  MoreVert as MoreIcon,
  Notes as NotesIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { MANUAL_SOURCE, TaskSession, TimerState } from '../../../types/timer';
import { formatDuration, formatTime } from '../../../utils/formatters';
import { getSessionElapsedMs, sessionTaskTotals, sessionTitle } from '../../../utils/timerHelpers';
import { isImportedSession } from './useSessionFilters';

interface SessionCardProps {
  session: TaskSession;
  /** Timestamp the duration is rendered at, ticked by the list while timers run */
  nowMs: number;
  isSelected: boolean;
  // Stable handlers taking the session, so memo can skip unchanged cards
  onSelect: (session: TaskSession) => void;
  onMenuOpen: (event: MouseEvent<HTMLElement>, session: TaskSession) => void;
  onStart: (session: TaskSession) => void;
  onStop: () => void;
  onOpenNotes: (sessionId: string) => void;
  /** The newest note's text, previewed under the title. */
  notePreview?: string;
}

export const SessionCard = memo(function SessionCard({
  session,
  nowMs,
  isSelected,
  onSelect,
  onMenuOpen,
  onStart,
  onStop,
  onOpenNotes,
  notePreview,
}: SessionCardProps) {
  const runningInstances = session.timerInstances.filter(i => i.state === TimerState.running);
  const totalInstances = session.timerInstances?.length || 0;
  const title = sessionTitle(session);
  const taskTotals = sessionTaskTotals(session, nowMs);
  // Live sessions tick in HH:MM:SS; finished ones read as a plain duration:
  // one glance separates now from history.
  const formatElapsed = session.isActive ? formatTime : formatDuration;

  return (
    <Card
      sx={{
        cursor: 'pointer',
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? 'primary.main' : 'divider',
        bgcolor: session.isActive ? 'action.selected' : 'background.paper',
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
      onClick={() => onSelect(session)}
    >
      <CardContent sx={{ pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* width 0 + minWidth 100%: fills the card, and a long name truncates
                instead of widening the page's column */}
            <Typography variant="h6" noWrap title={title} sx={{ fontWeight: 600, mb: 1, width: 0, minWidth: '100%' }}>
              {title}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Chip
                icon={<TimerIcon />}
                label={formatElapsed(getSessionElapsedMs(session, nowMs))}
                size="small"
                color={session.isActive ? 'primary' : 'default'}
                variant={session.isActive ? 'filled' : 'outlined'}
              />

              <Chip
                label={`${totalInstances} timer${totalInstances !== 1 ? 's' : ''}`}
                size="small"
                variant="outlined"
              />

              {runningInstances.length > 0 && (
                <Chip label={`${runningInstances.length} running`} size="small" color="success" />
              )}

              {session.isActive && <Chip label="Active" size="small" color="primary" />}

              {isImportedSession(session) && (
                <Chip label="Imported" size="small" color="secondary" variant="outlined" />
              )}

              {session.source === MANUAL_SOURCE && <Chip label="Manual" size="small" variant="outlined" />}
            </Stack>

            {/* With one task, the title and the time above already say this */}
            {taskTotals.length > 1 && (
              <Box
                component="ul"
                aria-label="Time by task"
                sx={{ listStyle: 'none', m: 0, p: 0, mb: notePreview ? 1 : 0 }}
              >
                {taskTotals.map(total => (
                  <Box component="li" key={total.taskId} sx={{ display: 'flex', gap: 2 }}>
                    <Typography
                      variant="body2"
                      noWrap
                      title={total.taskName}
                      color="text.secondary"
                      sx={{ flexGrow: 1, width: 0 }}
                    >
                      {total.taskName}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        flexShrink: 0,
                        fontWeight: 600,
                        fontFamily: session.isActive ? '"Roboto Mono", monospace' : undefined,
                      }}
                    >
                      {formatElapsed(total.elapsedMs)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {notePreview && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {notePreview}
              </Typography>
            )}
          </Box>

          <Stack direction="row" spacing={1} sx={{ mt: -1, mr: -1 }}>
            {/* Imported days change only by importing again */}
            {!isImportedSession(session) && (
              <Button
                onClick={e => {
                  e.stopPropagation();
                  session.isActive ? onStop() : onStart(session);
                }}
                size="small"
                startIcon={session.isActive ? <StopIcon /> : <PlayIcon />}
                aria-label={session.isActive ? 'End session' : 'Activate session'}
              >
                {session.isActive ? 'End' : 'Activate'}
              </Button>
            )}
            <Button
              onClick={e => {
                e.stopPropagation();
                onOpenNotes(session.id);
              }}
              size="small"
              startIcon={<NotesIcon />}
              aria-label="Open session notes"
            >
              Notes
            </Button>
            <IconButton onClick={event => onMenuOpen(event, session)} size="small" aria-label="More options">
              <MoreIcon />
            </IconButton>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
});
