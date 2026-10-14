import { useState, useMemo, useCallback, Suspense } from 'react';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ActiveTimerProvider } from './contexts/ActiveTimerContext';
import { StartWorkDialog } from './components/ui/dialogs/StartWorkDialog';
import { AddTimeDialog } from './components/ui/dialogs/AddTimeDialog';
import { IdleReturnDialog } from './components/ui/dialogs/IdleReturnDialog';
import { useIdleReturn } from './hooks/useIdleReturn';
import { Sidebar } from './components/layout';
import { GoalFooter } from './components/layout/GoalFooter';
import { NotificationBell } from './components/notifications/NotificationBell';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { DailyGoalProvider } from './contexts/DailyGoalContext';
import { TaskNotesProvider } from './contexts/TaskNotesContext';
import { NoteTemplatesProvider } from './contexts/NoteTemplatesContext';
import { useSessionNotesMigration } from './hooks/useSessionNotesMigration';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useEnhancedSystemTray } from './hooks/useEnhancedSystemTray';
import { useDailySummary } from './hooks/useDailySummary';
import { SessionManagementProvider, useSessionManagementContext } from './contexts/SessionManagementContext';
import { WorkLogProvider } from './contexts/WorkLogContext';
import { BackupSettingsProvider } from './contexts/BackupSettingsContext';
import { TaskManagementProvider, useTaskManagementContext } from './contexts/TaskManagementContext';
import { PAGES } from './app/routes';

/**
 * Work that runs whatever page is open: the tray's task list (and its "Choose
 * Task…"), and moving sessions' old plain-text notes into the notes store.
 */
function BackgroundJobs({ onShowStartDialog }: { onShowStartDialog: () => void }) {
  const { sessions, isLoading: sessionsLoading, hasLoaded, clearSessionNotes } = useSessionManagementContext();
  const { tasks, isLoading: tasksLoading } = useTaskManagementContext();

  useSessionNotesMigration({
    sessions,
    tasks,
    isLoading: sessionsLoading || tasksLoading,
    clearSessionNotes,
  });
  useEnhancedSystemTray({ tasks, onShowStartDialog });
  useDailySummary({ sessions, tasks, ready: hasLoaded && !tasksLoading });
  return null;
}

/** The dialogs any page (or the tray) can open. */
function GlobalDialogs({
  startOpen,
  onCloseStart,
  addTimeOpen,
  onCloseAddTime,
}: {
  startOpen: boolean;
  onCloseStart: () => void;
  addTimeOpen: boolean;
  onCloseAddTime: () => void;
}) {
  const { navigate } = useNavigation();
  const { sessions, startTask, addManualTime } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  // Idle detection runs in the backend; this sends it the saved settings and
  // holds its "you were away" question.
  const idleReturn = useIdleReturn();

  return (
    <>
      <StartWorkDialog
        open={startOpen}
        onClose={onCloseStart}
        tasks={tasks}
        sessions={sessions}
        onStart={startTask}
        onAddTask={() => navigate('tasks')}
      />
      <IdleReturnDialog
        pending={idleReturn.pending}
        onResolve={idleReturn.resolve}
        isResolving={idleReturn.isResolving}
        error={idleReturn.error}
      />
      <AddTimeDialog
        open={addTimeOpen}
        onClose={onCloseAddTime}
        tasks={tasks}
        sessions={sessions}
        onAdd={addManualTime}
      />
    </>
  );
}

const pageFallback = (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
    <CircularProgress />
  </Box>
);

/** The window: sidebar, the current page, and the app-wide dialogs. */
function AppContent() {
  const { view: activeView, navigate } = useNavigation();
  const { activeTasks } = useTaskManagementContext();
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [addTimeDialogOpen, setAddTimeDialogOpen] = useState(false);

  // Work starts from existing tasks only, so with none to start, a request
  // (here or from the tray) lands on the Tasks page instead of an empty picker.
  const hasActiveTasks = activeTasks.length > 0;
  const showStartDialog = useCallback(() => {
    if (hasActiveTasks) {
      setStartDialogOpen(true);
    } else {
      navigate('tasks');
    }
  }, [hasActiveTasks, navigate]);
  const showAddTime = useCallback(() => setAddTimeDialogOpen(true), []);
  const closeStartDialog = useCallback(() => setStartDialogOpen(false), []);
  const closeAddTime = useCallback(() => setAddTimeDialogOpen(false), []);
  const renderGoalFooter = useCallback((collapsed: boolean) => <GoalFooter collapsed={collapsed} />, []);
  const renderBell = useCallback((collapsed: boolean) => <NotificationBell collapsed={collapsed} />, []);

  // The same element until the page or its actions change, so re-rendering
  // the shell (a dialog opening) doesn't re-render the page.
  const Page = PAGES[activeView];
  const page = useMemo(
    () => (
      // Keyed by view: a page that crashed starts fresh when you come back
      <ErrorBoundary key={activeView} level="page">
        <Suspense fallback={pageFallback}>
          <Page onStartWork={showStartDialog} onAddTime={showAddTime} />
        </Suspense>
      </ErrorBoundary>
    ),
    [Page, activeView, showStartDialog, showAddTime]
  );

  return (
    <>
      <CssBaseline />
      <BackgroundJobs onShowStartDialog={showStartDialog} />
      <Box sx={{ height: '100vh', display: 'flex' }}>
        <Sidebar
          activeView={activeView}
          onViewChange={navigate}
          footer={renderGoalFooter}
          headerAction={renderBell}
        />
        {/* minWidth 0: a wide table scrolls inside its page instead of
            stretching the content past the window */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, overflow: 'auto' }}>{page}</Box>
        </Box>
        <GlobalDialogs
          startOpen={startDialogOpen}
          onCloseStart={closeStartDialog}
          addTimeOpen={addTimeDialogOpen}
          onCloseAddTime={closeAddTime}
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
