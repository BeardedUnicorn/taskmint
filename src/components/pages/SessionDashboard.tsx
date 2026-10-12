/**
 * Session Dashboard Component
 * 
 * Main dashboard that integrates all session-based functionality including
 * session management, timer instances, and notes. (Idle detection runs in
 * the backend; its "you were away" question is an app-level dialog.)
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Alert,
  Button,
  Fab,
  Backdrop,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Timer as TimerIcon,
  AttachMoney as MoneyIcon,
  MoreTime as AddTimeIcon,
} from '@mui/icons-material';
import { SessionTimerToolbar } from '../layout/SessionTimerToolbar';
import { SessionList } from '../ui/sessions/SessionList';
import { SessionTimerDisplay } from '../ui/display/SessionTimerDisplay';
import { EnhancedNotesDialog } from '../ui/dialogs/EnhancedNotesDialog';
import { StartWorkDialog } from '../ui/dialogs/StartWorkDialog';
import { AddTimeDialog } from '../ui/dialogs/AddTimeDialog';
import { EditSessionDialog } from '../ui/dialogs/EditSessionDialog';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog } from '../ui/dialogs/ConfirmDialog';
import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useDashboardSettings } from '../../hooks/useDashboardSettings';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useNotification } from '../../contexts/NotificationContext';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { EditTimeEntryData } from '../../types/form';
import { StatsCard } from '../ui/display/StatsCard';
import { formatCurrency, formatDuration, formatTime } from '../../utils/formatters';
import { getInstanceElapsedMs, getSessionElapsedMs, buildTimerEditUpdates } from '../../utils/timerHelpers';
import { orderTasksForStart } from '../../utils/taskOrdering';
import { sessionEarnings, sessionRate } from '../../utils/earnings';

interface SessionDashboardProps {
  /** Opens the Tasks page (work starts from existing tasks only). */
  onOpenTasks?: () => void;
}

export function SessionDashboard({ onOpenTasks }: SessionDashboardProps = {}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesContext, setNotesContext] = useState<{
    activeTaskId?: string;
    activeSessionId?: string;
    activeTimerInstanceId?: string;
    taskName?: string;
  }>({});
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [addTimeDialogOpen, setAddTimeDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TaskSession | null>(null);
  const [editingTimerData, setEditingTimerData] = useState<EditTimeEntryData | null>(null);
  const [editingTimerInstanceId, setEditingTimerInstanceId] = useState<string | null>(null);
  // A finished timer holds tracked time, so deleting one waits for a confirm
  const [timerPendingDelete, setTimerPendingDelete] = useState<TimerInstance | null>(null);


  // Hooks
  const {
    sessions,
    activeSession,
    startTask,
    addManualTime,
    updateSession,
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
    updateTimerInstance,
    isLoading: sessionsLoading,
    error: sessionsError,
    clearError: clearSessionsError,
  } = useSessionManagementContext();

  const { tasks, archivedTasks, isLoading: tasksLoading } = useTaskManagementContext();
  const { showError, showSuccess } = useNotification();
  const { isWidgetEnabled } = useDashboardSettings();

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
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasRunningTimer = sessions.some((session) =>
    session.timerInstances?.some((instance) => instance.state === TimerState.running)
  );

  // Totals only accrue while a timer runs (paused time is frozen, idle time
  // is stored), so the clock only needs to tick during a run.
  useEffect(() => {
    setNowMs(Date.now()); // catch up immediately when the rate changes
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

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

  const handleSaveSessionUpdate = useCallback(async (sessionId: string, updates: { notes?: string }) => {
    await updateSession(sessionId, updates);
    showSuccess("Session notes updated successfully.");
  }, [updateSession, showSuccess]);

  const handleEditTimer = useCallback((instance: TimerInstance, session: TaskSession) => {
    setEditingTimerInstanceId(instance.id);
    setEditingTimerData({
      id: instance.id,
      taskName: session.taskName,
      durationMs: getInstanceElapsedMs(instance),
      startTime: new Date(instance.startTime).toISOString(),
    });
  }, []);

  const handleAddTimer = useCallback(async () => {
    if (!activeSession) return;
    try {
      await createTimerInstance(activeSession.id);
      // New timers start idle — the user starts them explicitly.
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to add timer');
    }
  }, [activeSession, createTimerInstance, showError]);

  // Idle timers hold no time and delete straight away; a finished timer's
  // tracked time would be lost, so ask first.
  const handleRequestDeleteTimer = useCallback((instanceId: string) => {
    const instance = activeSession?.timerInstances.find(i => i.id === instanceId);
    if (instance?.state === TimerState.stopped) {
      setTimerPendingDelete(instance);
      return;
    }
    void deleteTimerInstance(instanceId);
  }, [activeSession, deleteTimerInstance]);

  const handleConfirmDeleteTimer = useCallback(() => {
    if (timerPendingDelete) {
      void deleteTimerInstance(timerPendingDelete.id);
    }
  }, [timerPendingDelete, deleteTimerInstance]);

  const handleCloseEditTimerDialog = useCallback(() => {
    setEditingTimerData(null);
    setEditingTimerInstanceId(null);
  }, []);

  const handleSaveTimerEdit = useCallback(async (data: EditTimeEntryData) => {
    if (!editingTimerInstanceId) return;
    const parentSession = sessions.find(s =>
      s.timerInstances.some(i => i.id === editingTimerInstanceId)
    );
    const instance = parentSession?.timerInstances.find(i => i.id === editingTimerInstanceId);
    if (!instance) return;

    await updateTimerInstance(
      editingTimerInstanceId,
      buildTimerEditUpdates(instance, data.durationMs)
    );

    // The dialog renders Task Name as editable (and requires it) — the name
    // lives on the session, so persist a change there.
    const editedName = data.taskName.trim();
    if (parentSession && editedName && editedName !== parentSession.taskName) {
      await updateSession(parentSession.id, { taskName: editedName });
    }

    handleCloseEditTimerDialog();
  }, [editingTimerInstanceId, sessions, updateTimerInstance, updateSession, handleCloseEditTimerDialog]);

  // Notes handlers - memoized to prevent re-renders
  const handleOpenSessionNotes = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setNotesContext({
        activeTaskId: session.taskId,
        activeSessionId: session.id,
        taskName: session.taskName
      });
      setNotesDialogOpen(true);
    }
  }, [sessions]);

  const handleOpenTimerNotes = useCallback((sessionId: string, instanceId?: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setNotesContext({
        activeTaskId: session.taskId,
        activeSessionId: session.id,
        activeTimerInstanceId: instanceId,
        taskName: session.taskName
      });
      setNotesDialogOpen(true);
    }
  }, [sessions]);

  const handleSelectSession = useCallback((session: TaskSession) => {
    setSelectedSessionId(session.id);
  }, []);

  const handleStartSelectedSession = useCallback(async (session: TaskSession) => {
    try {
      await setActiveSession(session);
    } catch (error) {
      showError('Failed to activate session');
    }
  }, [setActiveSession, showError]);

  const handleEditSession = useCallback((session: TaskSession) => {
    setEditingSession(session);
  }, []);
  
  // Memoized dialog close callbacks
  const handleCloseNotesDialog = useCallback(() => setNotesDialogOpen(false), []);
  const handleCloseStartDialog = useCallback(() => setStartDialogOpen(false), []);
  const handleCloseEditSessionDialog = useCallback(() => setEditingSession(null), []);
  const handleOpenStartDialog = useCallback(() => setStartDialogOpen(true), []);
  const handleOpenTasks = useCallback(() => onOpenTasks?.(), [onOpenTasks]);

  // Show the blocking loader only for the initial load — every timer action
  // toggles isLoading briefly, and a full-screen backdrop on each start/stop
  // would flash and unmount the ticking timers.
  if ((sessionsLoading && sessions.length === 0) || tasksLoading) {
    return (
      <Backdrop open sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <CircularProgress color="inherit" />
      </Backdrop>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* A failed operation must not replace the whole dashboard (the shared
          provider outlives navigation, so the error would persist with the
          timers running invisibly) — surface it inline and dismissible. */}
      {sessionsError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearSessionsError}>
          {sessionsError}
        </Alert>
      )}

      {/* Session Timer Bar */}
      <Box sx={{ mb: 4 }}>
        <SessionTimerToolbar
          activeSession={activeSession}
          startOptions={startOptions}
          onStartTask={startTask}
          onEndSession={endActiveSession}
          onPauseAll={pauseAllTimersInActiveSession}
          onResumeAll={resumeAllTimersInActiveSession}
          onOpenSessionNotes={handleOpenSessionNotes}
        />
      </Box>

      {/* Overview Stats — visibility follows the dashboard widget settings */}
      {(isWidgetEnabled('total-time-today') || isWidgetEnabled('earnings-today')) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3, mb: 4 }}>
          {isWidgetEnabled('total-time-today') && (
            <StatsCard
              title="Session Time"
              value={activeSession ? formatTime(stats.totalTime) : '—'}
              subtitle={activeSession ? activeSession.taskName : 'No active session'}
              icon={<TimerIcon sx={{ fontSize: 40 }} />}
              color="primary"
            />
          )}
          {isWidgetEnabled('earnings-today') && (
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
          )}
        </Box>
      )}

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
              size="large"
              onAddTimer={handleAddTimer}
              onStartTimer={startTimerInstance}
              onStopTimer={stopTimerInstance}
              onPauseTimer={pauseTimerInstance}
              onResumeTimer={resumeTimerInstance}
              onDeleteTimer={handleRequestDeleteTimer}
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
              onClick={() => setAddTimeDialogOpen(true)}
            >
              Add time
            </Button>
          </Box>
          <SessionList
            sessions={sessions}
            nowMs={nowMs}
            onSelectSession={handleSelectSession}
            onCreateSession={handleOpenStartDialog}
            onDeleteSession={deleteSession}
            onStartSession={handleStartSelectedSession}
            onStopSession={endActiveSession}
            selectedSessionId={selectedSessionId || undefined}
            // Initial load only: every timer action toggles isLoading, and an
            // unguarded pass-through blanked the whole list on each of them.
            isLoading={sessionsLoading && sessions.length === 0}
            onEditSession={handleEditSession}
            onOpenNotes={handleOpenSessionNotes}
            archivedTaskNames={archivedTaskNames}
          />
        </Box>
      </Box>

      {/* Enhanced Notes Dialog */}
      <EnhancedNotesDialog
        open={notesDialogOpen}
        onClose={handleCloseNotesDialog}
        activeTaskId={notesContext.activeTaskId}
        activeSessionId={notesContext.activeSessionId}
        activeTimerInstanceId={notesContext.activeTimerInstanceId}
        taskName={notesContext.taskName}
      />

      <EditTimeEntryDialog
        open={!!editingTimerData}
        onClose={handleCloseEditTimerDialog}
        onSave={handleSaveTimerEdit}
        entry={editingTimerData}
      />

      <ConfirmDialog
        open={timerPendingDelete !== null}
        title="Delete Timer"
        message={
          timerPendingDelete
            ? `Delete this timer? Its ${formatDuration(getInstanceElapsedMs(timerPendingDelete))} of tracked time will be removed permanently.`
            : ''
        }
        confirmLabel="Delete"
        severity="error"
        onConfirm={handleConfirmDeleteTimer}
        onClose={() => setTimerPendingDelete(null)}
      />

      <StartWorkDialog
        open={startDialogOpen}
        onClose={handleCloseStartDialog}
        tasks={tasks}
        sessions={sessions}
        onStart={startTask}
        onAddTask={handleOpenTasks}
      />

      <AddTimeDialog
        open={addTimeDialogOpen}
        onClose={() => setAddTimeDialogOpen(false)}
        tasks={tasks}
        sessions={sessions}
        onAdd={addManualTime}
      />

      <EditSessionDialog
        open={!!editingSession}
        onClose={handleCloseEditSessionDialog}
        session={editingSession}
        onSave={handleSaveSessionUpdate}
      />

      {/* Floating Action Button: start work on a task */}
      <Fab
        color="primary"
        aria-label="start work"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
        }}
        onClick={handleOpenStartDialog}
      >
        <AddIcon />
      </Fab>
    </Container>
  );
}
