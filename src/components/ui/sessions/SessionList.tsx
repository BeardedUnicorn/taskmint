/**
 * Session List Component
 * 
 * Displays a list of task sessions with management capabilities,
 * filtering, and detailed session information.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Button,
  Stack,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
} from '@mui/material';
import {
  Search as SearchIcon,
  MoreVert as MoreIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Notes as NotesIcon,
  Timer as TimerIcon,
  Today as DateIcon,
} from '@mui/icons-material';
import { TaskSession, TimerState } from '../../../types/timer';
import { formatTime, formatDate } from '../../../utils/formatters';
import { getSessionElapsedMs } from '../../../utils/timerHelpers';

interface SessionListProps {
  sessions: TaskSession[];
  onSelectSession: (session: TaskSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartSession: (session: TaskSession) => void;
  onStopSession: () => void;
  selectedSessionId?: string;
  isLoading?: boolean;
  onEditSession: (session: TaskSession) => void;
  onOpenNotes: (sessionId: string) => void;
  /** Task names hidden from the filter chips (their sessions still render) */
  archivedTaskNames?: string[];
}

export function SessionList({
  sessions,
  onSelectSession,
  onDeleteSession,
  onStartSession,
  onStopSession,
  selectedSessionId,
  isLoading = false,
  onEditSession,
  onOpenNotes,
  archivedTaskNames = [],
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [taskFilters, setTaskFilters] = useState<string[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedSession, setSelectedSession] = useState<TaskSession | null>(null);

  // Live durations: the backend's session.totalDuration only sums finalized
  // instances (running/paused contribute 0), so derive each card's duration
  // from instance state via getSessionElapsedMs and tick once a second while
  // any timer is running.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasRunningTimer = sessions.some((session) =>
    session.timerInstances?.some((instance) => instance.state === TimerState.running)
  );

  useEffect(() => {
    if (!hasRunningTimer) return;
    setNowMs(Date.now()); // catch up immediately when a timer starts
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  // Unique task names for task filter chips. Archived tasks' names are
  // hidden to keep the chip row manageable, but a chip stays visible while
  // it is selected so an active filter can always be cleared.
  const uniqueTaskNames = useMemo(() => {
    const archived = new Set(archivedTaskNames);
    return Array.from(new Set(sessions.map(s => s.taskName)))
      .filter(name => !archived.has(name) || taskFilters.includes(name))
      .sort();
  }, [sessions, archivedTaskNames, taskFilters]);

  // Filter sessions based on search query and filters
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(session =>
        session.taskName.toLowerCase().includes(query) ||
        session.notes?.toLowerCase().includes(query) ||
        session.date.includes(query)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(session =>
        statusFilter === 'active' ? session.isActive : !session.isActive
      );
    }

    if (taskFilters.length > 0) {
      result = result.filter(session => taskFilters.includes(session.taskName));
    }

    return result;
  }, [sessions, searchQuery, statusFilter, taskFilters]);

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    const grouped = filteredSessions.reduce((acc, session) => {
      const date = session.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(session);
      return acc;
    }, {} as Record<string, TaskSession[]>);

    // Sort dates in descending order
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    
    return sortedDates.map(date => ({
      date,
      sessions: grouped[date].sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }));
  }, [filteredSessions]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, session: TaskSession) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedSession(session);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedSession(null);
  };

  const handleDeleteSession = () => {
    if (selectedSession) {
      onDeleteSession(selectedSession.id);
      handleMenuClose();
    }
  };

  const handleToggleActive = () => {
    if (selectedSession) {
      if (selectedSession.isActive) {
        onStopSession();
      } else {
        onStartSession(selectedSession);
      }
      handleMenuClose();
    }
  };

  const handleEditSession = () => {
    if (selectedSession) {
      onEditSession(selectedSession);
      handleMenuClose();
    }
  };

  const handleOpenNotes = () => {
    if (selectedSession) {
      onOpenNotes(selectedSession.id);
      handleMenuClose();
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading sessions...</Typography>
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          No sessions found. Create your first session to get started!
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Search and filters */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 2,
        }}
      >
        <TextField
          fullWidth
          label="Search sessions"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }
          }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="session-status-label">Status</InputLabel>
          <Select
            labelId="session-status-label"
            value={statusFilter}
            label="Status"
            onChange={(e: SelectChangeEvent) =>
              setStatusFilter(e.target.value as 'all' | 'active' | 'completed')
            }
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {uniqueTaskNames.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap' }}>
          {uniqueTaskNames.map(name => {
            const selected = taskFilters.includes(name);
            return (
              <Chip
                key={name}
                label={name}
                size="small"
                clickable
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                onClick={() =>
                  setTaskFilters(prev =>
                    selected ? prev.filter(t => t !== name) : [...prev, name]
                  )
                }
              />
            );
          })}
          {taskFilters.length > 0 && (
            <Chip
              label="Clear"
              size="small"
              onClick={() => setTaskFilters([])}
            />
          )}
        </Stack>
      )}

      {/* Sessions grouped by date */}
      {sessionsByDate.length === 0 ? (
        <Alert severity="info">
          No sessions match your search criteria.
        </Alert>
      ) : (
        <Stack spacing={3}>
          {sessionsByDate.map(({ date, sessions: dateSessions }) => (
            <Box key={date}>
              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'text.secondary',
                  fontWeight: 600,
                }}
              >
                <DateIcon />
                {formatDate(new Date(date))}
              </Typography>

              <Stack spacing={2}>
                {dateSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    nowMs={nowMs}
                    isSelected={session.id === selectedSessionId}
                    onSelect={() => onSelectSession(session)}
                    onMenuOpen={(e) => handleMenuOpen(e, session)}
                    onStart={() => onStartSession(session)}
                    onStop={() => onStopSession()}
                    onOpenNotes={() => onOpenNotes(session.id)}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleToggleActive}>
          <ListItemIcon>
            {selectedSession?.isActive ? <StopIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>
            {selectedSession?.isActive ? 'Stop Session' : 'Start Session'}
          </ListItemText>
        </MenuItem>
        
        <MenuItem onClick={handleEditSession}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Session Notes</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={handleOpenNotes}>
          <ListItemIcon>
            <NotesIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Detailed Notes</ListItemText>
        </MenuItem>
        
        <Divider />
        
        <MenuItem onClick={handleDeleteSession} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon color="error" fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete Session</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}



// Session Card Component
interface SessionCardProps {
  session: TaskSession;
  /** Timestamp the duration is rendered at, ticked by the list while timers run */
  nowMs: number;
  isSelected: boolean;
  onSelect: () => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
  onStart: () => void;
  onStop: () => void;
  onOpenNotes: () => void;
}

function SessionCard({
  session,
  nowMs,
  isSelected,
  onSelect,
  onMenuOpen,
  onStart,
  onStop,
  onOpenNotes,
}: SessionCardProps) {

  const runningInstances = session.timerInstances?.filter(i => i.state === TimerState.running) || [];
  const totalInstances = session.timerInstances?.length || 0;

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
      onClick={onSelect}
    >
      <CardContent sx={{ pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              {session.taskName}
            </Typography>
            
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Chip
                icon={<TimerIcon />}
                label={formatTime(getSessionElapsedMs(session, nowMs))}
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
                <Chip
                  label={`${runningInstances.length} running`}
                  size="small"
                  color="success"
                />
              )}
              
              {session.isActive && (
                <Chip
                  label="Active"
                  size="small"
                  color="primary"
                />
              )}
            </Stack>
            
            {session.notes && (
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
                {session.notes}
              </Typography>
            )}
          </Box>
          
          <Stack direction="row" spacing={1} sx={{ mt: -1, mr: -1 }}>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                session.isActive ? onStop() : onStart();
              }}
              size="small"
              startIcon={session.isActive ? <StopIcon /> : <PlayIcon />}
              aria-label={session.isActive ? 'Stop session' : 'Start session'}
            >
              {session.isActive ? 'Stop' : 'Start'}
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onOpenNotes();
              }}
              size="small"
              startIcon={<NotesIcon />}
              aria-label="Open session notes"
            >
              Notes
            </Button>
            <IconButton
              onClick={onMenuOpen}
              size="small"
              aria-label="More options"
            >
              <MoreIcon />
            </IconButton>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
