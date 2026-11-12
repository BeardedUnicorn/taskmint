import { useState, useMemo, useCallback, useLayoutEffect, useRef, Suspense } from 'react';
import { CssBaseline, Box } from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ActiveTimerProvider } from './contexts/ActiveTimerContext';
import { StartWorkDialog } from './components/ui/dialogs/StartWorkDialog';
import { AddTimeDialog } from './components/ui/dialogs/AddTimeDialog';
import { IdleReturnDialog } from './components/ui/dialogs/IdleReturnDialog';
import { useIdleReturn } from './hooks/useIdleReturn';
import { Sidebar } from './components/layout';
import { CompactTopBar } from './components/layout/CompactTopBar';
import { BottomNavBar } from './components/layout/BottomNavBar';
import { GoalFooter } from './components/layout/GoalFooter';
import { PageSkeleton } from './components/layout/PageLayout';
import { CommandCenter } from './components/command/CommandCenter';
import { NotificationBell } from './components/notifications/NotificationBell';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { DailyGoalProvider } from './contexts/DailyGoalContext';
import { DailyGoalProgressProvider } from './contexts/DailyGoalProgressContext';
import { TaskNotesProvider } from './contexts/TaskNotesContext';
import { NoteTemplatesProvider } from './contexts/NoteTemplatesContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HideSplashScreen } from './components/HideSplashScreen';
import { useEnhancedSystemTray } from './hooks/useEnhancedSystemTray';
import { useRecordConflictNotice } from './hooks/useRecordConflictNotice';
import { useUpdatedNotice } from './hooks/useUpdatedNotice';
import { useDailySummary } from './hooks/useDailySummary';
import { SessionManagementProvider, useSessionManagementContext } from './contexts/SessionManagementContext';
import { WorkLogProvider } from './contexts/WorkLogContext';
import { WithdrawalsProvider } from './contexts/WithdrawalsContext';
import { PayoutDataProvider } from './contexts/PayoutDataContext';
import { useTrayWithdrawalLabel } from './hooks/useTrayWithdrawalLabel';
import { useWithdrawalReminder } from './hooks/useWithdrawalReminder';
import { usePayoutForecastPublisher } from './hooks/usePayoutForecastPublisher';
import { useSystemBarsTheme } from './hooks/useSystemBarsTheme';
import { useAnalyticsScreens } from './utils/analytics';
import { BackupSettingsProvider } from './contexts/BackupSettingsContext';
import { TaskManagementProvider, useTaskManagementContext } from './contexts/TaskManagementContext';
import { PAGES } from './app/routes';
import { useAppExtensions } from './app/extensions';
import { useCompactLayout } from './hooks/useCompactLayout';
import { VIEW_LABELS } from './navigation/views';

/**
 * Work that runs whatever page is open: the tray's "Choose Task…", saying
 * when a save lost to a change made on another device, pointing to what's
 * new after an update, a scheduled withdrawal's reminder, a phone's status
 * bar following the theme, and the pages opened, for usage analytics.
 */
function BackgroundJobs({ onShowStartDialog }: { onShowStartDialog: () => void }) {
  const { sessions, hasLoaded } = useSessionManagementContext();
  const { tasks, isLoading: tasksLoading } = useTaskManagementContext();

  useEnhancedSystemTray({ onShowStartDialog });
  useTrayWithdrawalLabel();
  useWithdrawalReminder();
  usePayoutForecastPublisher();
  useSystemBarsTheme();
  useRecordConflictNotice();
  useUpdatedNotice();
  useDailySummary({ sessions, tasks, ready: hasLoaded && !tasksLoading });
  useAnalyticsScreens();
  return null;
}

/** The dialogs any page (or the tray) can open, and the shell's own background work. */
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
  const { Background } = useAppExtensions();
  // Idle detection runs in the backend; this sends it the saved settings and
  // holds its "you were away" question.
  const idleReturn = useIdleReturn();

  return (
    <>
      {startOpen && (
        <StartWorkDialog
          onClose={onCloseStart}
          tasks={tasks}
          sessions={sessions}
          onStart={startTask}
          onAddTask={() => navigate('tasks')}
        />
      )}
      <IdleReturnDialog
        pending={idleReturn.pending}
        onResolve={idleReturn.resolve}
        isResolving={idleReturn.isResolving}
        error={idleReturn.error}
      />
      {addTimeOpen && (
        <AddTimeDialog onClose={onCloseAddTime} tasks={tasks} sessions={sessions} onAdd={addManualTime} />
      )}
      {Background && <Background />}
    </>
  );
}

const pageFallback = <PageSkeleton />;

/**
 * A phone's launch screen stays until the page (not its skeleton) and the
 * session list every page starts from are on screen. (A list that fails to
 * load leaves it to the launch screen's own time limit.)
 */
function AppDrawn() {
  const { hasLoaded } = useSessionManagementContext();
  return <HideSplashScreen when={hasLoaded} />;
}

/**
 * The window: sidebar, the current page, and the app-wide dialogs. On a
 * phone a top bar takes the sidebar's place, the sidebar slides in as a
 * menu, and the main pages have tabs along the bottom.
 */
function AppContent() {
  const { view: activeView, visit, navigate } = useNavigation();
  const { activeTasks } = useTaskManagementContext();
  const compact = useCompactLayout();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const openNavigation = useCallback(() => setNavigationOpen(true), []);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
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

  // Each page opened (the one showing too, as a tab tapped again) starts at
  // the top. A layout effect: it runs before the page's own effects, so a
  // page that scrolls to a part of itself (a Settings section) still does.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    scrollerRef.current!.scrollTop = 0;
  }, [visit]);

  // The same element until the page or its actions change, so re-rendering
  // the shell (a dialog opening) doesn't re-render the page.
  const Page = PAGES[activeView];
  const page = useMemo(
    () => (
      // Keyed by view: a page that crashed starts fresh when you come back
      <ErrorBoundary key={activeView} level="page">
        <Suspense fallback={pageFallback}>
          <Page onStartWork={showStartDialog} onAddTime={showAddTime} />
          <AppDrawn />
        </Suspense>
      </ErrorBoundary>
    ),
    [Page, activeView, showStartDialog, showAddTime]
  );

  return (
    <>
      <CssBaseline enableColorScheme />
      <BackgroundJobs onShowStartDialog={showStartDialog} />
      <CommandCenter onStartWork={showStartDialog} onAddTime={showAddTime} />
      {/* dvh: a phone's browser bars and keyboard don't hide the bottom */}
      <Box sx={{ height: '100vh', '@supports (height: 100dvh)': { height: '100dvh' }, display: 'flex' }}>
        {compact ? (
          <Sidebar
            variant="temporary"
            open={navigationOpen}
            onClose={closeNavigation}
            activeView={activeView}
            onViewChange={navigate}
            footer={renderGoalFooter}
          />
        ) : (
          <Sidebar
            activeView={activeView}
            onViewChange={navigate}
            footer={renderGoalFooter}
            headerAction={renderBell}
          />
        )}
        {/* minWidth 0: a wide table scrolls inside its page instead of
            stretching the content past the window */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {compact && <CompactTopBar title={VIEW_LABELS[activeView]} onOpenNavigation={openNavigation} />}
          {/* Clear of the gesture bar on an edge-to-edge phone screen (a
              phone's bottom bar keeps clear of it itself) */}
          <Box
            component="main"
            ref={scrollerRef}
            sx={{ flex: 1, overflow: 'auto', pb: compact ? 0 : 'env(safe-area-inset-bottom)' }}
          >
            {page}
          </Box>
          {compact && <BottomNavBar activeView={activeView} onViewChange={navigate} />}
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
                          <WithdrawalsProvider>
                            <PayoutDataProvider>
                              <BackupSettingsProvider>
                                <DailyGoalProgressProvider>
                                  <AppContent />
                                </DailyGoalProgressProvider>
                              </BackupSettingsProvider>
                            </PayoutDataProvider>
                          </WithdrawalsProvider>
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
