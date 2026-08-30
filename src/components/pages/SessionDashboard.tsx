/**
 * Session Dashboard Component
 * 
 * Main dashboard that integrates all session-based functionality including
 * session management, timer instances, inactivity detection, and notes.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Alert,
  Fab,
  Backdrop,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Timer as TimerIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { SessionTimerToolbar } from '../layout/SessionTimerToolbar';
import { SessionList } from '../ui/sessions/SessionList';
import { SessionTimerDisplay } from '../ui/display/SessionTimerDisplay';
import { InactivityWarningDialog } from '../ui/dialogs/InactivityWarningDialog';
import { EnhancedNotesDialog } from '../ui/dialogs/EnhancedNotesDialog';
import { QuickSessionDialog } from '../ui/dialogs/QuickSessionDialog';
import { EditSessionDialog } from '../ui/dialogs/EditSessionDialog';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useInactivityDetection } from '../../hooks/useInactivityDetection';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useNotification } from '../../contexts/NotificationContext';
import { TaskSession, TimerInstance, TimerState } from '../../types/timer';
import { useActiveTimer } from '../../contexts/ActiveTimerContext';
import { EditTimeEntryData } from '../../types/form';
import { StatsCard } from '../ui/display/StatsCard';
import { formatDuration } from '../../utils/formatters';
import { formatDateString } from '../../utils/dateHelpers';
import { getInstanceElapsedMs, getSessionElapsedMs, buildTimerEditUpdates } from '../../utils/timerHelpers';

export function SessionDashboard() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesContext, setNotesContext] = useState<{
    activeTaskId?: string;
    activeSessionId?: string;
    activeTimerInstanceId?: string;
    taskName?: string;
  }>({});
  const [quickSessionDialogOpen, setQuickSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TaskSession | null>(null);
  const [editingTimerData, setEditingTimerData] = useState<EditTimeEntryData | null>(null);
  const [editingTimerInstanceId, setEditingTimerInstanceId] = useState<string | null>(null);


  // Hooks
  const {
    sessions,
    activeSession,
    createSession,
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

  const {
    isWarningShown,
    warningTimeRemaining,
    resetActivity,
  } = useInactivityDetection();

  const { tasks, activeTasks, archivedTasks, isLoading: tasksLoading } = useTaskManagementContext();
  const { showError, showSuccess } = useNotification();

  // Archived tasks keep their session history visible, but their names are
  // hidden from the session list's task filter chips
  const archivedTaskNames = useMemo(() => archivedTasks.map(t => t.name), [archivedTasks]);

  // Live stats: the backend's session.totalDuration only sums finalized
  // instances (running/paused contribute 0) and sessions state only changes
  // on discrete timer events, so derive totals from instance state via
  // getSessionElapsedMs and tick once a second while any timer is running.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasRunningTimer = sessions.some((session) =>
    session.timerInstances.some((instance) => instance.state === TimerState.running)
  );

  useEffect(() => {
    if (!hasRunningTimer) return;
    setNowMs(Date.now()); // catch up immediately when a timer starts
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  const stats = useMemo(() => {
    const today = formatDateString(new Date(nowMs));

    // No totalDuration > 0 filter: a session whose only timer is still
    // running has totalDuration 0 but must count toward today's totals.
    const todaysSessions = sessions.filter((s) => s.date === today);

    let totalTimeToday = 0;
    let earningsToday = 0;
    for (const session of todaysSessions) {
      const elapsed = getSessionElapsedMs(session, nowMs);
      totalTimeToday += elapsed;

      const task = tasks.find((t) => t.id === session.taskId);
      if (task?.hourlyRate && task.hourlyRate > 0) {
        earningsToday += (elapsed / (1000 * 60 * 60)) * task.hourlyRate;
      }
    }

    return { totalTimeToday, earningsToday };
  }, [sessions, tasks, nowMs]);

  // Determine currently running timer instance for inactivity handling
  const { activeTimer: activeTimerInstance } = useActiveTimer();

  // Handle inactivity warning - memoized to prevent re-renders
  const handleContinueWork = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  const handlePauseFromInactivity = useCallback(() => {
    // The session layer listens for this on the window event bus
    window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
      detail: { reason: 'user-action', timestamp: new Date() }
    }));
    // Dismiss the warning — activity over the dialog no longer auto-clears
    // it, so the button must close it explicitly.
    resetActivity();
  }, [resetActivity]);

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
  
  const handleStartQuickSession = useCallback(async (taskId: string, taskName: string): Promise<TaskSession> => {
    const session = await createSession(taskId, taskName);
    if (!session) {
      throw new Error("Failed to start session from quick dialog.");
    }
    return session;
  }, [createSession]);

  // Memoized callback for timer notes with proper typing
  const handleOpenTimerNotesForActiveSession = useCallback((instanceId: string) => {
    handleOpenTimerNotes(activeSession?.id || '', instanceId);
  }, [activeSession?.id, handleOpenTimerNotes]);

  // Memoized dialog close callbacks
  const handleCloseNotesDialog = useCallback(() => setNotesDialogOpen(false), []);
  const handleCloseQuickSessionDialog = useCallback(() => setQuickSessionDialogOpen(false), []);
  const handleCloseEditSessionDialog = useCallback(() => setEditingSession(null), []);
  const handleOpenQuickSessionDialog = useCallback(() => setQuickSessionDialogOpen(true), []);

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
          predefinedTasks={activeTasks}
          onStartSession={createSession}
          onEndSession={endActiveSession}
          onPauseAll={pauseAllTimersInActiveSession}
          onResumeAll={resumeAllTimersInActiveSession}
          onCreateTimerInstance={createTimerInstance}
          onStartTimer={startTimerInstance}
          onStopTimer={stopTimerInstance}
          onPauseTimer={pauseTimerInstance}
          onResumeTimer={resumeTimerInstance}
          onDeleteTimer={deleteTimerInstance}
          onEditTimer={(instance) => activeSession && handleEditTimer(instance, activeSession)}
          onOpenSessionNotes={handleOpenSessionNotes}
          onOpenTimerNotes={handleOpenTimerNotesForActiveSession}
        />
      </Box>

      {/* Overview Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 3, mb: 4 }}>
        <StatsCard
          title="Total Time Today"
          value={formatDuration(stats.totalTimeToday)}
          subtitle={stats.totalTimeToday > 0 ? 'Keep up the great work!' : 'Start tracking your time'}
          icon={<TimerIcon sx={{ fontSize: 40 }} />}
          color="primary"
        />
        <StatsCard
          title="Earnings Today"
          value={stats.earningsToday}
          subtitle={stats.earningsToday > 0 ? 'Based on hourly rates' : 'Set hourly rates to track earnings'}
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
              showControls
              showNotes
              size="large"
              onStartTimer={startTimerInstance}
              onStopTimer={stopTimerInstance}
              onPauseTimer={pauseTimerInstance}
              onResumeTimer={resumeTimerInstance}
              onDeleteTimer={deleteTimerInstance}
              onEditTimer={handleEditTimer}
              onOpenNotes={handleOpenTimerNotes}
            />
          </Box>
        )}

        {/* Session List */}
        <Box sx={{ flex: activeSession ? 1 : 2 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            All Sessions
          </Typography>
          <SessionList
            sessions={sessions}
            onSelectSession={handleSelectSession}
            onDeleteSession={deleteSession}
            onStartSession={handleStartSelectedSession}
            onStopSession={endActiveSession}
            selectedSessionId={selectedSessionId || undefined}
            isLoading={sessionsLoading}
            onEditSession={handleEditSession}
            onOpenNotes={handleOpenSessionNotes}
            archivedTaskNames={archivedTaskNames}
          />
        </Box>
      </Box>

      {/* Inactivity Warning Dialog */}
      {isWarningShown && activeSession && activeTimerInstance && (
        <InactivityWarningDialog
          remainingSeconds={warningTimeRemaining}
          onContinue={handleContinueWork}
          onPause={handlePauseFromInactivity}
          timerInstance={activeTimerInstance}
        />
      )}

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

      <QuickSessionDialog
        open={quickSessionDialogOpen}
        onClose={handleCloseQuickSessionDialog}
        onStartSession={handleStartQuickSession}
        tasks={activeTasks}
      />

      <EditSessionDialog
        open={!!editingSession}
        onClose={handleCloseEditSessionDialog}
        session={editingSession}
        onSave={handleSaveSessionUpdate}
      />

      {/* Floating Action Button for Quick Session Creation */}
      <Fab
        color="primary"
        aria-label="create session"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
        }}
        onClick={handleOpenQuickSessionDialog}
      >
        <AddIcon />
      </Fab>
    </Container>
  );
}
