import { useState, useMemo, Suspense, lazy } from 'react';
import {
  CssBaseline,
  Box,
  CircularProgress,
} from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ActiveTimerProvider, useActiveTimer } from './contexts/ActiveTimerContext';
import { StartTaskDialog } from './components/pages/StartTaskDialog';
import { Sidebar, type SidebarView } from './components/layout';

const TasksPage = lazy(() => import('./components/pages/TasksPage').then(module => ({ default: module.TasksPage })));
const NotesPage = lazy(() => import('./components/pages/NotesPage').then(module => ({ default: module.NotesPage })));
const TimeEntriesPage = lazy(() => import('./components/pages/TimeEntriesPage').then(module => ({ default: module.TimeEntriesPage })));
const ReportsPage = lazy(() => import('./components/pages/ReportsPage').then(module => ({ default: module.ReportsPage })));
const CalendarPage = lazy(() => import('./components/pages/CalendarPage'));
const PayoutsPage = lazy(() => import('./components/pages/payouts/PayoutsPage').then(module => ({ default: module.PayoutsPage })));
const SettingsPage = lazy(() => import('./components/pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
const AdminPage = lazy(() => import('./components/pages/AdminPage').then(module => ({ default: module.AdminPage })));
import { SessionDashboard } from './components/pages/SessionDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimeEntry } from './types/timer';
import { EditTimeEntryData } from './types/form';
import { useEnhancedSystemTray } from './hooks/useEnhancedSystemTray';
import { SessionManagementProvider, useSessionManagementContext } from './contexts/SessionManagementContext';
import { WorkLogProvider } from './contexts/WorkLogContext';
import { useDailyGoalProgressMonitor } from './hooks/useDailyGoalProgressMonitor';
import { sessionsToTimeEntries, buildTimerEditUpdates, getInstanceDateString } from './utils/timerHelpers';
import { createServiceErrorHandler } from './utils/errorHandler';
import { TaskManagementProvider, useTaskManagementContext } from './contexts/TaskManagementContext';

// AppContent component contains the main application logic and UI.
// It is wrapped by all necessary context providers in the App component.
function AppContent() {
  const [activeView, setActiveView] = useState<SidebarView>('sessions');
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [notesPageState, setNotesPageState] = useState<{ filterTaskId: string | null; openNoteId: string | null }>({ filterTaskId: null, openNoteId: null });

  const appErrorHandler = useMemo(() => createServiceErrorHandler('AppContent'), []);

  // Centralized session management (single shared instance via provider)
  const sessionManager = useSessionManagementContext();

  // Task management context
  const { tasks, activeTasks, addTask, updateTask, deleteTask, archiveTask, unarchiveTask } = useTaskManagementContext();

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

  // System Tray integration
  useEnhancedSystemTray({
    activeSession: sessionManager.activeSession,
    sessions: sessionManager.sessions,
    tasks,
    onStartSession: async (taskId, taskName) => {
      const session = await sessionManager.createSession(taskId, taskName);
      if (!session) {
        throw new Error("Failed to create session from system tray.");
      }
      return session;
    },
    onCreateTimerInstance: async (sessionId) => {
      const instance = await sessionManager.createTimerInstance(sessionId);
      if (!instance) {
        throw new Error("Failed to create timer instance from system tray.");
      }
      return instance;
    },
    onStartTimer: sessionManager.startTimerInstance,
    onStopTimer: sessionManager.stopTimerInstance,
    onShowNewTaskDialog: () => setNewTaskDialogOpen(true),
  });

  // Daily goal monitoring
  useDailyGoalProgressMonitor({
    timeEntries: allTimeEntries,
    tasks,
  });

  const handleStartNewTask = async (taskName: string) => {
    await appErrorHandler.handleAsync(async () => {
      const task = tasks.find(t => t.name === taskName);
      await sessionManager.createSession(task?.id ?? 'new-task', taskName);
    }, 'startNewTask', { taskName });
  };

  const handleViewChange = (view: SidebarView) => {
    setActiveView(view);
    if (view !== 'notes') {
      setNotesPageState({ filterTaskId: null, openNoteId: null });
    }
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
        />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            }>
              {activeView === 'sessions' && <SessionDashboard />}
              {activeView === 'tasks' && (
                <TasksPage
                  tasks={tasks}
                  timeEntries={allTimeEntries}
                  onAddTask={addTask}
                  onUpdateTask={updateTask}
                  onDeleteTask={deleteTask}
                  onArchiveTask={archiveTask}
                  onUnarchiveTask={unarchiveTask}
                  onUpdateEntry={handleUpdateEntry}
                  onDeleteEntry={handleDeleteEntry}
                />
              )}
              {activeView === 'notes' && (
                <NotesPage
                  tasks={tasks}
                  activeEntry={activeEntry}
                  notesPageState={notesPageState}
                />
              )}
              {activeView === 'time-entries' && (
                <TimeEntriesPage
                  timeEntries={allTimeEntries}
                  tasks={tasks}
                  onUpdateEntry={handleUpdateEntry}
                  onDeleteEntry={handleDeleteEntry}
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
              {activeView === 'admin' && <AdminPage />}
            </Suspense>
          </Box>
        </Box>
        <StartTaskDialog
          open={newTaskDialogOpen}
          onClose={() => setNewTaskDialogOpen(false)}
          onStartTask={handleStartNewTask}
          existingTasks={activeTasks.map(t => t.name)}
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
          <SubscriptionProvider>
            <TaskManagementProvider>
              <ActiveTimerProvider>
                <SessionManagementProvider>
                  <WorkLogProvider>
                    <AppContent />
                  </WorkLogProvider>
                </SessionManagementProvider>
              </ActiveTimerProvider>
            </TaskManagementProvider>
          </SubscriptionProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;