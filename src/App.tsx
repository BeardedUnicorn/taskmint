import { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import {
  CssBaseline,
  Box,
  CircularProgress,
} from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ActiveTimerProvider, useActiveTimer } from './contexts/ActiveTimerContext';
import { StartTaskDialog } from './components/pages';
import { Sidebar, type SidebarView } from './components/layout';

const TasksPage = lazy(() => import('./components/pages/TasksPage').then(module => ({ default: module.TasksPage })));
const NotesPage = lazy(() => import('./components/pages/NotesPage').then(module => ({ default: module.NotesPage })));
const TimeEntriesPage = lazy(() => import('./components/pages/TimeEntriesPage').then(module => ({ default: module.TimeEntriesPage })));
const ReportsPage = lazy(() => import('./components/pages/ReportsPage').then(module => ({ default: module.ReportsPage })));
const CalendarPage = lazy(() => import('./components/pages/CalendarPage'));
const SettingsPage = lazy(() => import('./components/pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
const AdminPage = lazy(() => import('./components/pages/AdminPage').then(module => ({ default: module.AdminPage })));
import { SessionDashboard } from './components/pages/SessionDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimeEntry, TimerState } from './types/timer';
import { useEnhancedSystemTray } from './hooks/useEnhancedSystemTray';
import { useSessionManagement } from './hooks/useSessionManagement';
import { useTaskManagement } from './hooks/useTaskManagement';
import { useDailyGoalProgressMonitor } from './hooks/useDailyGoalProgressMonitor';
import { useTimerSync } from './hooks/useTimerSync';
import { createServiceErrorHandler } from './utils/errorHandler';
import { listen } from '@tauri-apps/api/event';

// AppContent component contains the main application logic and UI.
// It is wrapped by all necessary context providers in the App component.
function AppContent() {
  const [activeView, setActiveView] = useState<SidebarView>('sessions');
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [notesPageState, setNotesPageState] = useState<{ filterTaskId: string | null; openNoteId: string | null }>({ filterTaskId: null, openNoteId: null });

  const appErrorHandler = useMemo(() => createServiceErrorHandler('AppContent'), []);

  // Centralized session management
  const sessionManager = useSessionManagement();
  
  // Task management hook
  const { tasks, addTask, updateTask, deleteTask } = useTaskManagement();

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
      date: sessionManager.activeSession.date,
    };
  }, [sessionManager.activeSession, activeTimer]);

  // All time entries derived from sessions
  const allTimeEntries = useMemo(() => 
    sessionManager.sessions
      .filter(s => s && Array.isArray(s.timerInstances)) // Add this line to filter out invalid session objects
      .flatMap(s => 
        s.timerInstances.map((i: any) => ({
          ...i, 
          taskName: s.taskName, 
          taskId: s.taskId, 
          date: s.date
        }))
      ), [sessionManager.sessions]);

  // Timer sync hook
  useTimerSync();

  // Setup listeners for global events
  useEffect(() => {
    const setupListeners = async () => {
      await listen('create-session-from-global', async (event: any) => {
        const { taskName } = event.payload;
        await appErrorHandler.handleAsync(async () => {
          const task = tasks.find(t => t.name === taskName);
          await sessionManager.createSession(task?.id ?? 'new-task', taskName);
        }, 'createSessionFromGlobal', { taskName });
      });
    };
    setupListeners();
  }, [appErrorHandler, sessionManager, tasks]);

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

  const handleUpdateEntry = async (entry: TimeEntry) => {
    const session = sessionManager.sessions.find(s => s.timerInstances.some((i: any) => `session_${i.id}` === entry.id));
    if (session) {
      await sessionManager.updateSession(session.id, {
        taskName: entry.taskName,
        // Other fields can be updated here
      });
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    const instanceId = entryId.replace('session_', '');
    const session = sessionManager.sessions.find(s => s.timerInstances.some((i: any) => i.id === instanceId));
    if (session) {
      // Logic to delete the specific timer instance would go here, via sessionManager
      // e.g., sessionManager.deleteTimerInstance(instanceId);
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
              {activeView === 'settings' && <SettingsPage />}
              {activeView === 'admin' && <AdminPage />}
            </Suspense>
          </Box>
        </Box>
        <StartTaskDialog
          open={newTaskDialogOpen}
          onClose={() => setNewTaskDialogOpen(false)}
          onStartTask={handleStartNewTask}
          existingTasks={tasks.map(t => t.name)}
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
            <ActiveTimerProvider>
              <AppContent />
            </ActiveTimerProvider>
          </SubscriptionProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;