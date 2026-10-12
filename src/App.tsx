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
import { Sidebar, type SidebarView } from './components/layout';
import { GoalProgress } from './components/layout/GoalProgress';
import { DailyGoalProvider } from './contexts/DailyGoalContext';
import { TaskNotesProvider } from './contexts/TaskNotesContext';
import { useSessionNotesMigration } from './hooks/useSessionNotesMigration';

const TasksPage = lazy(() => import('./components/pages/TasksPage').then(module => ({ default: module.TasksPage })));
const NotesPage = lazy(() => import('./components/pages/NotesPage').then(module => ({ default: module.NotesPage })));
const TimeEntriesPage = lazy(() => import('./components/pages/TimeEntriesPage').then(module => ({ default: module.TimeEntriesPage })));
const ReportsPage = lazy(() => import('./components/pages/ReportsPage').then(module => ({ default: module.ReportsPage })));
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
import { sessionsToTimeEntries, buildTimerEditUpdates, getInstanceDateString } from './utils/timerHelpers';
import { createServiceErrorHandler } from './utils/errorHandler';
import { TaskManagementProvider, useTaskManagementContext } from './contexts/TaskManagementContext';

// AppContent component contains the main application logic and UI.
// It is wrapped by all necessary context providers in the App component.
function AppContent() {
  const [activeView, setActiveView] = useState<SidebarView>('sessions');
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
      setActiveView('tasks');
    }
  }, [hasActiveTasks]);
  useEnhancedSystemTray({ tasks, onShowStartDialog: showStartDialog });
  const openTasksPage = useCallback(() => setActiveView('tasks'), []);

  // Idle detection runs in the backend; this sends it the saved settings and
  // holds its "you were away" question.
  const idleReturn = useIdleReturn();

  // Daily goal monitoring
  // Daily goal: live progress for the sidebar, plus milestone notifications
  const goalProgress = useDailyGoalProgressMonitor({
    sessions: sessionManager.sessions,
    tasks,
  });

  const handleViewChange = (view: SidebarView) => {
    setActiveView(view);
  };

  const handleUpdateEntry = async (data: EditTimeEntryData) => {
    // Entry ids are raw timer-instance ids (the "session_" prefix is only
    // used by the derived activeEntry).
    const instanceId = data.id.replace(/^session_/, '');
    const session = sessionManager.sessions.find(s =>
      s.timerInstances.some(i => i.id === instanceId)
    );
    if (!session) return;
    const instance = session.timerInstances.find(i => i.id === instanceId);
    if (!instance) return;

    await sessionManager.updateTimerInstance(
      instanceId,
      buildTimerEditUpdates(instance, data.durationMs)
    );

    // Task name lives on the session, so renaming applies to every entry of
    // the session — only send it when it actually changed.
    const name = data.taskName.trim();
    if (name && name !== session.taskName) {
      await sessionManager.updateSession(session.id, { taskName: name });
    }
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
          onViewChange={handleViewChange}
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
              {activeView === 'sessions' && <SessionDashboard onOpenTasks={openTasksPage} />}
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
                />
              )}
              {activeView === 'notes' && (
                <NotesPage
                  tasks={tasks}
                  sessions={sessionManager.sessions}
                  activeEntry={activeEntry}
                />
              )}
              {activeView === 'time-entries' && (
                <TimeEntriesPage
                  timeEntries={allTimeEntries}
                  tasks={tasks}
                  onUpdateEntry={handleUpdateEntry}
                  onDeleteEntry={handleDeleteEntry}
                  onAddTime={() => setAddTimeDialogOpen(true)}
                />
              )}
              {activeView === 'reports' && (
                <ReportsPage
                  timeEntries={allTimeEntries}
                  tasks={tasks}
                  onDeleteEntry={handleDeleteEntry}
                  onUpdateEntry={handleUpdateEntry}
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
        <NotificationProvider>
          <TaskManagementProvider>
            <DailyGoalProvider>
              <ActiveTimerProvider>
                <SessionManagementProvider>
                  <TaskNotesProvider>
                    <WorkLogProvider>
                      <BackupSettingsProvider>
                        <AppContent />
                      </BackupSettingsProvider>
                    </WorkLogProvider>
                  </TaskNotesProvider>
                </SessionManagementProvider>
              </ActiveTimerProvider>
            </DailyGoalProvider>
          </TaskManagementProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;