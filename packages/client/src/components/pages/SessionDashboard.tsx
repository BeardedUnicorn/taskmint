/**
 * Session Dashboard Component
 * 
 * Main dashboard that integrates all session-based functionality including
 * session management, timer instances, and notes. (Idle detection runs in
 * the backend; its "you were away" question is an app-level dialog.)
 */

import { useState, useCallback, useMemo } from 'react';
import { Box, Typography, Button, Skeleton, Stack } from '@mui/material';
import {
  Timer as TimerIcon,
  AttachMoney as MoneyIcon,
  MoreTime as AddTimeIcon,
} from '@mui/icons-material';
import { SessionTimerToolbar } from '../layout/SessionTimerToolbar';
import { PageContainer } from '../layout/PageLayout';
import { SessionList } from '../ui/sessions/SessionList';
import { SessionTimerDisplay } from '../ui/display/SessionTimerDisplay';
import { SessionNotesDialog } from '../ui/dialogs/SessionNotesDialog';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { TaskSession, TimerInstance } from '../../types/timer';
import type { EditTimeEntryData, EditTimeEntryDialogProps } from '../../types/form';
import { StatsCard } from '../ui/display/StatsCard';
import { formatCurrency, formatTime } from '../../utils/formatters';
import { getInstanceElapsedMs, getSessionElapsedMs, hasRunningTimer } from '../../utils/timerHelpers';
import { useNowMs } from '../../hooks/useNowMs';
import { useTimerEntryEdit } from '../../hooks/useTimerEntryEdit';
import { orderTasksForStart } from '../../utils/taskOrdering';
import { sessionEarnings, sessionRate } from '../../utils/earnings';
import { newestFirst, noteText } from '../../utils/notes';
import { useTaskNotes } from '../../hooks/useTaskNotes';

interface SessionDashboardProps {
  /** Opens the app's Start Work dialog (the + button, an empty list). */
  onStartWork: () => void;
  /** Opens the app's Add Time dialog. */
  onAddTime: () => void;
}

export function SessionDashboard({ onStartWork, onAddTime }: SessionDashboardProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  // Whose notes are open: a session, or one of its timers
  const [notesTarget, setNotesTarget] = useState<{
    sessionId: string;
    timerInstanceId?: string;
  } | null>(null);
  // The timer being edited (its id is the instance's)
  const [editingTimerData, setEditingTimerData] = useState<EditTimeEntryDialogProps['entry'] | null>(null);

  // Hooks
  const {
    sessions,
    activeSession,
    startTask,
    deleteSession,
    setActiveSession,
    endActiveSession,
    pauseAllTimersInActiveSession,
    resumeAllTimersInActiveSession,
    createTimerInstance,
    startTimerInstance,
    stopTimerInstance,
    pauseTimerInstance,
    resumeTimerInstance,
    deleteTimerInstance,
    isLoading: sessionsLoading,
  } = useSessionManagementContext();

  const { tasks, archivedTasks, isLoading: tasksLoading } = useTaskManagementContext();

  // Every start surface lists tasks the same way (and as the tray does):
  // favorites, then most recently used, then the rest; never archived ones.
  const startOptions = useMemo(() => orderTasksForStart(tasks, sessions), [tasks, sessions]);

  // Archived tasks keep their session history visible, but their names are
  // hidden from the session list's task filter chips
  const archivedTaskNames = useMemo(() => archivedTasks.map(t => t.name), [archivedTasks]);

  // The page's single clock: the backend's session.totalDuration only sums
  // finalized instances (running/paused contribute 0) and sessions state only
  // changes on discrete timer events, so live durations are derived from
  // instance state via getSessionElapsedMs. This nowMs feeds the score cards,
  // the Active Session panel, and the session list so they never disagree on
  // the displayed second; it ticks only while a timer is running.
  // Totals only accrue while a timer runs (paused time is frozen, idle time
  // is stored), so the clock only needs to tick during a run.
  const nowMs = useNowMs(hasRunningTimer(sessions), 1000);

  const stats = useMemo(() => {
    // Totals cover every timer in the active session, regardless of the day
    // it ran; with no active session both cards read zero.
    // The session's own rate (captured when it started), so a rate change
    // mid-session doesn't rewrite what it has earned.
    const totalTime = activeSession ? getSessionElapsedMs(activeSession, nowMs) : 0;
    const hourlyRate = activeSession ? sessionRate(activeSession, tasks) : 0;
    const totalEarnings = activeSession ? sessionEarnings(activeSession, tasks, nowMs) : 0;

    return { totalTime, totalEarnings, hourlyRate };
  }, [activeSession, tasks, nowMs]);

  const handleEditTimer = useCallback((instance: TimerInstance, session: TaskSession) => {
    setEditingTimerData({
      id: instance.id,
      taskId: session.taskId,
      durationMs: getInstanceElapsedMs(instance),
      startTime: new Date(instance.startTime).toISOString(),
    });
  }, []);

  // Deletes straight away: a finished timer's toast offers Undo
  const handleDeleteTimer = useCallback((instanceId: string) => {
    void deleteTimerInstance(instanceId);
  }, [deleteTimerInstance]);

  const handleCloseEditTimerDialog = useCallback(() => setEditingTimerData(null), []);

  // Saves the duration, and moves the timer when another task was picked
  const saveTimerEdit = useTimerEntryEdit();
  const handleSaveTimerEdit = useCallback(async (data: EditTimeEntryData) => {
    if (await saveTimerEdit(data)) handleCloseEditTimerDialog();
  }, [saveTimerEdit, handleCloseEditTimerDialog]);

  // Notes handlers - memoized to prevent re-renders
  const handleOpenSessionNotes = useCallback((sessionId: string) => {
    setNotesTarget({ sessionId });
  }, []);

  const handleOpenTimerNotes = useCallback((sessionId: string, instanceId?: string) => {
    setNotesTarget({ sessionId, timerInstanceId: instanceId });
  }, []);

  // Each session's note texts (newest first) for the list's previews and search
  const { notes } = useTaskNotes();
  const sessionNotes = useMemo(() => {
    const bySession = new Map<string, string[]>();
    for (const note of [...notes].sort(newestFirst)) {
      if (!note.sessionId || note.isArchived) continue;
      const text = noteText(note);
      if (!text) continue;
      bySession.set(note.sessionId, [...(bySession.get(note.sessionId) ?? []), text]);
    }
    return bySession;
  }, [notes]);

  const handleSelectSession = useCallback((session: TaskSession) => {
    setSelectedSessionId(session.id);
  }, []);

  const handleStartSelectedSession = useCallback(async (session: TaskSession) => {
    await setActiveSession(session);
  }, [setActiveSession]);

  // Memoized dialog callbacks (the start and add-time dialogs are the app's)
  const handleCloseNotesDialog = useCallback(() => setNotesTarget(null), []);
  const notesSession = notesTarget && sessions.find(session => session.id === notesTarget.sessionId);

  // The page's shape while it first loads. Only the first load: every timer
  // action toggles isLoading briefly, and swapping the page out on each
  // start/stop would flash and unmount the ticking timers.
  if ((sessionsLoading && sessions.length === 0) || tasksLoading) {
    return (
      <PageContainer>
        <Box aria-busy="true" aria-label="Loading sessions">
          <Skeleton variant="rounded" height={64} sx={{ mb: 4 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3, mb: 4 }}>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={120} />
          </Box>
          <Stack spacing={2}>
            {[0, 1, 2].map(i => (
              <Skeleton key={i} variant="rounded" height={110} />
            ))}
          </Stack>
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* The toolbar is the page's visible header; the title is for screen readers */}
      <Typography
        component="h1"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
      >
        Sessions
      </Typography>
      {/* Session Timer Bar */}
      <Box sx={{ mb: 4 }}>
        <SessionTimerToolbar
          activeSession={activeSession}
          startOptions={startOptions}
          onStartTask={startTask}
          onEndSession={endActiveSession}
          onSwitchTask={onStartWork}
          onPauseAll={pauseAllTimersInActiveSession}
          onResumeAll={resumeAllTimersInActiveSession}
          onOpenSessionNotes={handleOpenSessionNotes}
        />
      </Box>

      {/* Overview Stats: the active session's time and earnings */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3, mb: 4 }}>
        <StatsCard
          title="Session Time"
          value={activeSession ? formatTime(stats.totalTime) : '—'}
          subtitle={activeSession ? activeSession.taskName : 'No active session'}
          icon={<TimerIcon sx={{ fontSize: 40 }} />}
          color="primary"
        />
        <StatsCard
          title="Session Earnings"
          value={activeSession ? formatCurrency(stats.totalEarnings) : '—'}
          subtitle={
            activeSession
              ? stats.hourlyRate > 0
                ? `At ${formatCurrency(stats.hourlyRate)}/hr`
                : 'Set an hourly rate on this task'
              : 'Start a session to track earnings'
          }
          icon={<MoneyIcon sx={{ fontSize: 40 }} />}
          color="success"
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 4, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Active Session Display */}
        {activeSession && (
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Active Session
            </Typography>
            <SessionTimerDisplay
              session={activeSession}
              nowMs={nowMs}
              showControls
              showNotes
              // New timers start idle: the user starts them (failures are the context's to report)
              onAddTimer={() => void createTimerInstance(activeSession.id)}
              onStartTimer={startTimerInstance}
              onStopTimer={stopTimerInstance}
              onPauseTimer={pauseTimerInstance}
              onResumeTimer={resumeTimerInstance}
              onDeleteTimer={handleDeleteTimer}
              onEditTimer={handleEditTimer}
              onOpenNotes={handleOpenTimerNotes}
            />
          </Box>
        )}

        {/* Session List */}
        <Box sx={{ flex: activeSession ? 1 : 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              All Sessions
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddTimeIcon />}
              onClick={onAddTime}
            >
              Add time
            </Button>
          </Box>
          <SessionList
            sessions={sessions}
            nowMs={nowMs}
            onSelectSession={handleSelectSession}
            onCreateSession={onStartWork}
            onDeleteSession={deleteSession}
            onStartSession={handleStartSelectedSession}
            onStopSession={endActiveSession}
            selectedSessionId={selectedSessionId ?? undefined}
            // Initial load only: every timer action toggles isLoading, and an
            // unguarded pass-through blanked the whole list on each of them.
            isLoading={sessionsLoading && sessions.length === 0}
            onOpenNotes={handleOpenSessionNotes}
            sessionNotes={sessionNotes}
            archivedTaskNames={archivedTaskNames}
          />
        </Box>
      </Box>

      {/* (A session deleted meanwhile, on another device too, closes its notes) */}
      {notesSession && (
        <SessionNotesDialog
          onClose={handleCloseNotesDialog}
          session={notesSession}
          timerInstanceId={notesTarget?.timerInstanceId ?? null}
          tasks={tasks}
        />
      )}

      {editingTimerData && (
        <EditTimeEntryDialog
          onClose={handleCloseEditTimerDialog}
          onSave={handleSaveTimerEdit}
          entry={editingTimerData}
          tasks={tasks}
        />
      )}

    </PageContainer>
  );
}
