/**
 * Session List
 *
 * Sessions grouped by day, newest first, with search and filters
 * (useSessionFilters, SessionFilterBar) and a menu per session.
 */

import { memo, useCallback, useState, MouseEvent } from 'react';
import {
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Notes as NotesIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Timer as TimerIcon,
  Today as DateIcon,
} from '@mui/icons-material';
import { TaskSession, TimerState } from '../../../types/timer';
import { formatDate } from '../../../utils/formatters';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { EmptyState } from '../display/EmptyState';
import { SessionCard } from './SessionCard';
import { SessionFilterBar } from './SessionFilterBar';
import { RECENT_SESSION_DAYS, isImportedSession, notesFor, useSessionFilters } from './useSessionFilters';

interface SessionListProps {
  sessions: TaskSession[];
  /** Shared page clock — the active session's card duration ticks off it. */
  nowMs: number;
  onSelectSession: (session: TaskSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartSession: (session: TaskSession) => void;
  onStopSession: () => void;
  /** Opens the create-session flow from the list's empty state. */
  onCreateSession?: () => void;
  selectedSessionId?: string;
  isLoading?: boolean;
  onOpenNotes: (sessionId: string) => void;
  /** Each session's notes text, newest note first (from the notes store). */
  sessionNotes?: Map<string, string[]>;
  /** Task names hidden from the filter chips (their sessions still render) */
  archivedTaskNames?: string[];
}

// Memoized so unrelated dashboard state changes (dialogs, selection) don't
// re-render the list; the shared nowMs prop changes once a second while a
// timer runs and deliberately re-renders it — that tick is the list's clock.
export const SessionList = memo(function SessionList({
  sessions,
  nowMs,
  onSelectSession,
  onDeleteSession,
  onStartSession,
  onStopSession,
  onCreateSession,
  selectedSessionId,
  isLoading = false,
  onOpenNotes,
  sessionNotes,
  archivedTaskNames,
}: SessionListProps) {
  const filters = useSessionFilters({ sessions, sessionNotes, archivedTaskNames });
  const { byDate, olderCount, showOlder, setShowOlder } = filters;
  const [menu, setMenu] = useState<{ anchor: HTMLElement; session: TaskSession } | null>(null);

  const handleMenuOpen = useCallback((event: MouseEvent<HTMLElement>, session: TaskSession) => {
    event.stopPropagation();
    setMenu({ anchor: event.currentTarget, session });
  }, []);
  const fromMenu = (action: (session: TaskSession) => void) => () => {
    if (menu) action(menu.session);
    setMenu(null);
  };
  // Imported days are rebuilt by every import: notes only, no activate/delete
  const menuIsImported = isImportedSession(menu?.session ?? null);

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Stack spacing={2}>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} variant="rounded" height={110} />
          ))}
        </Stack>
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <EmptyState
          icon={<TimerIcon />}
          title="No sessions yet"
          description="Start a session to begin tracking your time."
          action={
            onCreateSession && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={onCreateSession}>
                Start a session
              </Button>
            )
          }
        />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <SessionFilterBar filters={filters} />

      {byDate.length === 0 ? (
        olderCount > 0 && !showOlder ? (
          <EmptyState
            title={`Nothing in the last ${RECENT_SESSION_DAYS} days`}
            description="Older sessions are still here, and in History."
            action={
              <Button variant="outlined" onClick={() => setShowOlder(true)}>
                Show older ({olderCount})
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No matching sessions"
            description="Nothing matches your current search and filters."
            action={
              <Button variant="outlined" onClick={filters.clearFilters}>
                Clear filters
              </Button>
            }
          />
        )
      ) : (
        <Stack spacing={3}>
          {byDate.map(({ date, sessions: daySessions }) => (
            <Box key={date}>
              <Typography
                variant="h6"
                sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontWeight: 600 }}
              >
                <DateIcon />
                {/* new Date('YYYY-MM-DD') parses as UTC midnight, which is
                    the previous local day west of UTC — parse as local. */}
                {formatDate(parseDateStringLocal(date))}
              </Typography>

              <Stack spacing={2}>
                {daySessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    // Only the active session's time moves; the others keep a
                    // fixed clock so their memoized cards skip the tick.
                    nowMs={
                      session.isActive || session.timerInstances?.some(i => i.state === TimerState.running) ? nowMs : 0
                    }
                    isSelected={session.id === selectedSessionId}
                    onSelect={onSelectSession}
                    onMenuOpen={handleMenuOpen}
                    onStart={onStartSession}
                    onStop={onStopSession}
                    onOpenNotes={onOpenNotes}
                    notePreview={notesFor(session, sessionNotes)[0]}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {byDate.length > 0 && (olderCount > 0 || showOlder) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Button variant="text" onClick={() => setShowOlder(previous => !previous)}>
            {showOlder ? `Show the last ${RECENT_SESSION_DAYS} days only` : `Show older (${olderCount})`}
          </Button>
        </Box>
      )}

      <Menu anchorEl={menu?.anchor} open={menu !== null} onClose={() => setMenu(null)}>
        {!menuIsImported && (
          <MenuItem onClick={fromMenu(session => (session.isActive ? onStopSession() : onStartSession(session)))}>
            <ListItemIcon>
              {menu?.session.isActive ? <StopIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>
              {/* "Activate" is honest: it makes the session current (finalizing
                  any timer running elsewhere) without starting a timer. */}
              {menu?.session.isActive ? 'End Session' : 'Activate Session'}
            </ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={fromMenu(session => onOpenNotes(session.id))}>
          <ListItemIcon>
            <NotesIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Notes</ListItemText>
        </MenuItem>

        {!menuIsImported && <Divider />}

        {/* Deletes straight away; the toast offers Undo */}
        {!menuIsImported && (
          <MenuItem onClick={fromMenu(session => onDeleteSession(session.id))} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <DeleteIcon color="error" fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete Session</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
});
