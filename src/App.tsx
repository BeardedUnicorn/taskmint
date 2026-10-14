import { useState, useMemo, useCallback, Suspense, lazy } from 'react';
import {
  CssBaseline,
  Box,
  CircularProgress,
} from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ActiveTimerProvider, useActiveTimer } from './contexts/ActiveTimerContext';
import { StartWorkDialog } from './components/ui/dialogs/StartWorkDialog';
import { AddTimeDialog } from './components/ui/dialogs/AddTimeDialog';
import { IdleReturnDialog } from './components/ui/dialogs/IdleReturnDialog';
import { useIdleReturn } from './hooks/useIdleReturn';
import { Sidebar } from './components/layout';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { GoalProgress } from './components/layout/GoalProgress';
import { DailyGoalProvider } from './contexts/DailyGoalContext';
import { TaskNotesProvider } from './contexts/TaskNotesContext';
import { NoteTemplatesProvider } from './contexts/NoteTemplatesContext';
import { useSessionNotesMigration } from './hooks/useSessionNotesMigration';

const TasksPage = lazy(() => import('./components/pages/TasksPage').then(module => ({ default: module.TasksPage })));
const NotesPage = lazy(() => import('./components/pages/NotesPage').then(module => ({ default: module.NotesPage })));
const HistoryPage = lazy(() => import('./components/pages/history/HistoryPage').then(module => ({ default: module.HistoryPage })));
const CalendarPage = lazy(() => import('./components/pages/CalendarPage'));
const PayoutsPage = lazy(() => import('./components/pages/payouts/PayoutsPage').then(module => ({ default: module.PayoutsPage })));
const SettingsPage = lazy(() => import('./components/pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
import { SessionDashboard } from './components/pages/SessionDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimeEntry } from './types/timer';
import { EditTimeEntryData } from './types/form';
import { useEnhancedSystemTray } from './hooks/useEnhancedSystemTray';
import { SessionManagementProvider, useSessionManagementContext } from './contexts/SessionManagementContext';
import { WorkLogProvider } from './contexts/WorkLogContext';
import { BackupSettingsProvider } from './contexts/BackupSettingsContext';
import { useDailyGoalProgressMonitor } from './hooks/useDailyGoalProgressMonitor';
import { sessionsToTimeEntries, getInstanceDateString } from './utils/timerHelpers';
import { useTimerEntryEdit } from './hooks/useTimerEntryEdit';
import { createServiceErrorHandler } from './utils/errorHandler';
import { TaskManagementProvider, useTaskManagementContext } from './contexts/TaskManagementContext';

// AppContent component contains the main application logic and UI.
// It is wrapped by all necessary context providers in the App component.
function AppContent() {
  const { view: activeView, params: viewParams, navigate, clearParams } = useNavigation();
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [addTimeDialogOpen, setAddTimeDialogOpen] = useState(false);

  const appErrorHandler = useMemo(() => createServiceErrorHandler('AppContent'), []);

  // Centralized session management (single shared instance via provider)
  const sessionManager = useSessionManagementContext();

  // Task management context
  const { tasks, activeTasks, addTask, updateTask, deleteTask, archiveTask, unarchiveTask, toggleFavorite, isLoading: tasksLoading } = useTaskManagementContext();

  // Sessions' old plain-text notes move into the notes store (once)
  useSessionNotesMigration({
    sessions: sessionManager.sessions,
    tasks,
    isLoading: sessionManager.isLoading || tasksLoading,
    clearSessionNotes: sessionManager.clearSessionNotes,
  });

  const { activeTimer } = useActiveTimer();
  // Derived global active entry for backward compatibility with older pages
  const activeEntry: TimeEntry | null = useMemo(() => {
    if (!sessionManager.activeSession || !activeTimer) return null;

    return {
      id: `session_${activeTimer.id}`,
      taskName: sessionManager.activeSession.taskName,
      taskId: sessionManager.activeSession.taskId,
      startTime: new Date(activeTimer.startTime),
      isRunning: true,
      // Same per-instance day bucketing as sessionsToTimeEntries.
      date: getInstanceDateString(activeTimer, sessionManager.activeSession.date),
    };
  }, [sessionManager.activeSession, activeTimer]);

  // All time entries derived from sessions
  const allTimeEntries = useMemo(
    () => sessionsToTimeEntries(sessionManager.sessions),
    [sessionManager.sessions]
  );

  // System tray: task-list mirror + the tray's "Choose Task…" / "Add a
  // Task…". Work starts from existing tasks only, so with none to start the
  // tray's request lands on the Tasks page instead of an empty picker.
  const hasActiveTasks = activeTasks.length > 0;
  const showStartDialog = useCallback(() => {
    if (hasActiveTasks) {
      setStartDialogOpen(true);
    } else {
      navigate('tasks');
    }
  }, [hasActiveTasks, navigate]);
  useEnhancedSystemTray({ tasks, onShowStartDialog: showStartDialog });
  const openTasksPage = useCallback(() => navigate('tasks'), [navigate]);
  // A task whose entries History should open on (Tasks → View all in History)
  const historyFocusTask = useMemo(
    () => (viewParams.focusTaskId ? tasks.find(task => task.id === viewParams.focusTaskId) ?? null : null),
    [viewParams.focusTaskId, tasks]
  );

  // Idle detection runs in the backend; this sends it the saved settings and
  // holds its "you were away" question.
  const idleReturn = useIdleReturn();

  // Daily goal monitoring
  // Daily goal: live progress for the sidebar, plus milestone notifications
  const goalProgress = useDailyGoalProgressMonitor({
    sessions: sessionManager.sessions,
    tasks,
  });

  // Duration edits, and moves to another task when one was picked
  const saveTimerEdit = useTimerEntryEdit();
  const handleUpdateEntry = async (data: EditTimeEntryData) => {
    await saveTimerEdit(data);
  };

  const handleDeleteEntry = async (entryId: string) => {
    const instanceId = entryId.replace(/^session_/, '');
    const session = sessionManager.sessions.find(s =>
      s.timerInstances.some(i => i.id === instanceId)
    );
    if (session) {
      await appErrorHandler.handleAsync(async () => {
        await sessionManager.deleteTimerInstance(instanceId);
      }, 'deleteTimeEntry', { entryId });
    }
  };

  return (
    <>
      <CssBaseline />
      <Box sx={{ height: '100vh', display: 'flex' }}>
        <Sidebar
          activeView={activeView}
          onViewChange={navigate}
          footer={
            goalProgress.enabled
              ? (collapsed) => <GoalProgress progress={goalProgress} collapsed={collapsed} />
              : undefined
          }
        />
        {/* minWidth 0: a wide table scrolls inside its page instead of
            stretching the content past the window */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            }>
              {activeView === 'sessions' && (
                <SessionDashboard
                  onStartWork={showStartDialog}
                  onAddTime={() => setAddTimeDialogOpen(true)}
                />
              )}
              {activeView === 'tasks' && (
                <TasksPage
                  tasks={tasks}
                  timeEntries={allTimeEntries}
                  onAddTask={addTask}
                  onUpdateTask={updateTask}
                  onDeleteTask={deleteTask}
                  onArchiveTask={archiveTask}
                  onUnarchiveTask={unarchiveTask}
                  onToggleFavorite={toggleFavorite}
                  onUpdateEntry={handleUpdateEntry}
                  onDeleteEntry={handleDeleteEntry}
                  onStartTask={(task) => { void sessionManager.startTask(task.id, task.name); }}
                  runningTaskId={activeEntry?.taskId ?? null}
                  onViewHistory={(task) => navigate('history', { focusTaskId: task.id })}
                />
              )}
              {activeView === 'notes' && (
                <NotesPage
                  tasks={tasks}
                  sessions={sessionManager.sessions}
                  activeEntry={activeEntry}
                />
              )}
              {activeView === 'history' && (
                <HistoryPage
                  timeEntries={allTimeEntries}
                  tasks={tasks}
                  onUpdateEntry={handleUpdateEntry}
                  onDeleteEntry={handleDeleteEntry}
                  onAddTime={() => setAddTimeDialogOpen(true)}
                  focusTask={historyFocusTask}
                  onFocusApplied={clearParams}
                />
              )}
              {activeView === 'calendar' && <CalendarPage />}
              {activeView === 'payouts' && <PayoutsPage />}
              {activeView === 'settings' && <SettingsPage />}
            </Suspense>
          </Box>
        </Box>
        <StartWorkDialog
          open={startDialogOpen}
          onClose={() => setStartDialogOpen(false)}
          tasks={tasks}
          sessions={sessionManager.sessions}
          onStart={sessionManager.startTask}
          onAddTask={openTasksPage}
        />
        <IdleReturnDialog
          pending={idleReturn.pending}
          onResolve={idleReturn.resolve}
          isResolving={idleReturn.isResolving}
          error={idleReturn.error}
        />
        <AddTimeDialog
          open={addTimeDialogOpen}
          onClose={() => setAddTimeDialogOpen(false)}
          tasks={tasks}
          sessions={sessionManager.sessions}
          onAdd={sessionManager.addManualTime}
        />
      </Box>
    </>
  );
}


// App component now only sets up providers
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NavigationProvider>
          <NotificationProvider>
            <TaskManagementProvider>
              <DailyGoalProvider>
                <ActiveTimerProvider>
                  <SessionManagementProvider>
                    <TaskNotesProvider>
                      <NoteTemplatesProvider>
                        <WorkLogProvider>
                          <BackupSettingsProvider>
                            <AppContent />
                          </BackupSettingsProvider>
                        </WorkLogProvider>
                      </NoteTemplatesProvider>
                    </TaskNotesProvider>
                  </SessionManagementProvider>
                </ActiveTimerProvider>
              </DailyGoalProvider>
            </TaskManagementProvider>
          </NotificationProvider>
        </NavigationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
