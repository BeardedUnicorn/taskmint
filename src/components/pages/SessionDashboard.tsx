/**
 * Session Dashboard Component
 * 
 * Main dashboard that integrates all session-based functionality including
 * session management, timer instances, inactivity detection, and notes.
 */

import { useState, useCallback } from 'react';
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
} from '@mui/icons-material';
import { SessionTimerBar } from '../layout/SessionTimerBar';
import { SessionList } from '../ui/sessions/SessionList';
import { SessionTimerDisplay } from '../ui/display/SessionTimerDisplay';
import { InactivityWarningDialog } from '../ui/dialogs/InactivityWarningDialog';
import { EnhancedNotesDialog } from '../ui/dialogs/EnhancedNotesDialog';
import { QuickSessionDialog } from '../ui/dialogs/QuickSessionDialog';
import { EditSessionDialog } from '../ui/dialogs/EditSessionDialog';
import { useSessionManagement } from '../../hooks/useSessionManagement';
import { useInactivityDetection } from '../../hooks/useInactivityDetection';
import { useTasks } from '../../hooks/useTasks';
import { useNotification } from '../../contexts/NotificationContext';
import { TaskSession } from '../../types/timer';

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
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useSessionManagement();

  const {
    isWarningShown,
    warningTimeRemaining,

  } = useInactivityDetection();

  const { tasks, isLoading: tasksLoading } = useTasks();
  const { showError, showSuccess } = useNotification();

  // Determine currently running timer instance for inactivity handling
  const activeTimerInstance = activeSession?.timerInstances.find(
    instance => instance.isRunning && !instance.isPaused
  );

  // Handle inactivity warning - memoized to prevent re-renders
  const handleContinueWork = useCallback(() => {
    window.dispatchEvent(new CustomEvent('timer-continue-activity', {
      detail: { reason: 'user-action', timestamp: new Date() }
    }));
  }, []);

  const handlePauseFromInactivity = useCallback(() => {
    window.dispatchEvent(new CustomEvent('timer-pause-inactivity', {
      detail: { reason: 'user-action', timestamp: new Date() }
    }));
  }, []);

  const handleSaveSessionUpdate = useCallback(async (sessionId: string, updates: { notes?: string }) => {
    await updateSession(sessionId, updates);
    showSuccess("Session notes updated successfully.");
  }, [updateSession, showSuccess]);

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

  // Show loading state
  if (sessionsLoading || tasksLoading) {
    return (
      <Backdrop open sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <CircularProgress color="inherit" />
      </Backdrop>
    );
  }

  // Show error state
  if (sessionsError) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {sessionsError}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Session Timer Bar */}
      <Box sx={{ mb: 4 }}>
        <SessionTimerBar
          activeSession={activeSession}
          predefinedTasks={tasks}
          onStartSession={createSession}
          onEndSession={endActiveSession}
          onPauseAll={pauseAllTimersInActiveSession}
          onResumeAll={resumeAllTimersInActiveSession}
          onCreateTimerInstance={createTimerInstance}
          onStartTimer={startTimerInstance}
          onStopTimer={stopTimerInstance}
          onPauseTimer={pauseTimerInstance}
          onResumeTimer={resumeTimerInstance}
          onOpenSessionNotes={handleOpenSessionNotes}
          onOpenTimerNotes={handleOpenTimerNotesForActiveSession}
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

      <QuickSessionDialog
        open={quickSessionDialogOpen}
        onClose={handleCloseQuickSessionDialog}
        onStartSession={handleStartQuickSession}
        tasks={tasks}
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
