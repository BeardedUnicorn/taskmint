import { useState, useEffect, useMemo } from 'react';
import {
  CssBaseline,
  Box,
} from '@mui/material';

/**
 * Main Application Component
 *
 * This is the root component that orchestrates the entire time tracking application.
 * It manages:
 * - Global state for time entries, active timers, and navigation
 * - Integration with system tray functionality
 * - Routing between different pages (Dashboard, Tasks, Reports, Settings)
 * - Timer operations (start, stop, persistence)
 * - Task management integration
 */
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider, useNotification } from './contexts/NotificationContext';
import { NewTaskDialog } from './components/pages';
import { DashboardPage } from './components/pages/DashboardPage';
import { TasksPage } from './components/pages/TasksPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { Sidebar, GlobalTimerBar, type SidebarView } from './components/layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimeEntry } from './types/timer';

import { useSystemTray } from './hooks/useSystemTray';
import { useTaskManagement } from './hooks/useTaskManagement';
import { TimerService } from './services/TimerService';
import { StorageService } from './services/StorageService';


function App() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Timer and time entry state
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);

  // Navigation state
  const [activeView, setActiveView] = useState<SidebarView>('dashboard');
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);

  // Initialize services
  const storageService = useMemo(() => StorageService.getInstance(), []);
  const timerService = useMemo(() => new TimerService(storageService), [storageService]);

  // ============================================================================
  // EFFECTS & INITIALIZATION
  // ============================================================================

  // Load time entries on app start
  useEffect(() => {
    const loadTimeEntries = async () => {
      try {
        const entries = await timerService.getTimeEntries();
        setTimeEntries(entries);

        // Find and set active entry
        const runningEntry = entries.find(entry => entry.isRunning);
        if (runningEntry) {
          setActiveEntry(runningEntry);
        }
      } catch (error) {
        console.error('Failed to load time entries:', error);
      }
    };

    loadTimeEntries();
  }, [timerService]);

  // ============================================================================
  // TIMER MANAGEMENT HANDLERS
  // ============================================================================

  const handleSaveEntry = async (entry: TimeEntry) => {
    try {
      await timerService.saveTimeEntry(entry);

      // Update local state
      setTimeEntries(prev => {
        const existingIndex = prev.findIndex(e => e.id === entry.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = entry;
          return updated;
        } else {
          return [...prev, entry];
        }
      });

      setActiveEntry(null);
    } catch (error) {
      console.error('Failed to save time entry:', error);
    }
  };

  const handleUpdateActiveEntry = async (entry: TimeEntry | null) => {
    setActiveEntry(entry);
    if (entry) {
      try {
        await timerService.saveTimeEntry(entry);

        // Update local state
        setTimeEntries(prev => {
          const existingIndex = prev.findIndex(e => e.id === entry.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = entry;
            return updated;
          } else {
            return [...prev, entry];
          }
        });
      } catch (error) {
        console.error('Failed to update active entry:', error);
      }
    }
  };

  const handleStopActiveTimer = () => {
    if (activeEntry && activeEntry.startTime) {
      const now = new Date();
      const duration = now.getTime() - new Date(activeEntry.startTime).getTime();

      const finalEntry: TimeEntry = {
        ...activeEntry,
        endTime: now,
        duration: duration,
        isRunning: false,
        date: new Date(activeEntry.startTime).toISOString().split('T')[0],
      };

      handleSaveEntry(finalEntry);
    }
  };

  // ============================================================================
  // SYSTEM TRAY HANDLERS
  // ============================================================================

  // System tray handlers
  const handleStartTimerFromTray = (taskName: string, startTime: Date) => {
    const entry: TimeEntry = {
      id: Date.now().toString(),
      taskName,
      startTime,
      isRunning: true,
      date: startTime.toISOString().split('T')[0],
    };

    setActiveEntry(entry);
    handleUpdateActiveEntry(entry);
  };

  const handleStopTimerFromTray = () => {
    handleStopActiveTimer();
  };

  const handleShowNewTaskDialog = () => {
    console.log('handleShowNewTaskDialog called - opening new task dialog');
    setNewTaskDialogOpen(true);
  };

  const handleStartNewTask = (taskName: string) => {
    const startTime = new Date();
    handleStartTimerFromTray(taskName, startTime);
  };

  // ============================================================================
  // UI EVENT HANDLERS
  // ============================================================================

  // Handle view changes from sidebar
  const handleViewChange = (view: SidebarView) => {
    setActiveView(view);
  };

  // Handle timer start from global timer bar
  const handleStartTimer = (taskName: string) => {
    const startTime = new Date();
    handleStartTimerFromTray(taskName, startTime);
  };

  // Handle entry updates and deletions for dashboard
  const handleUpdateEntry = async (updatedEntry: TimeEntry) => {
    try {
      await timerService.updateTimeEntry(updatedEntry.id, updatedEntry);

      // Update local state
      setTimeEntries(prev => {
        const existingIndex = prev.findIndex(entry => entry.id === updatedEntry.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = updatedEntry;
          return updated;
        } else {
          return [...prev, updatedEntry];
        }
      });
    } catch (error) {
      console.error('Failed to update time entry:', error);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await timerService.deleteTimeEntry(entryId);

      // Update local state only after successful deletion
      setTimeEntries(prev => prev.filter(entry => entry.id !== entryId));
    } catch (error) {
      console.error('Failed to delete time entry:', error);
      // Note: Error handling will be improved in AppContent component
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NotificationProvider>
          <AppContent
            timeEntries={timeEntries}
            activeEntry={activeEntry}
            activeView={activeView}
            newTaskDialogOpen={newTaskDialogOpen}
            setNewTaskDialogOpen={setNewTaskDialogOpen}
            handleStopActiveTimer={handleStopActiveTimer}
            handleStartTimerFromTray={handleStartTimerFromTray}
            handleStopTimerFromTray={handleStopTimerFromTray}
            handleShowNewTaskDialog={handleShowNewTaskDialog}
            handleStartNewTask={handleStartNewTask}
            handleViewChange={handleViewChange}
            handleStartTimer={handleStartTimer}
            handleUpdateEntry={handleUpdateEntry}
            handleDeleteEntry={handleDeleteEntry}
          />
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// Separate component that uses hooks requiring NotificationProvider
interface AppContentProps {
  timeEntries: TimeEntry[];
  activeEntry: TimeEntry | null;
  activeView: SidebarView;
  newTaskDialogOpen: boolean;
  setNewTaskDialogOpen: (open: boolean) => void;
  handleStopActiveTimer: () => void;
  handleStartTimerFromTray: (taskName: string, startTime: Date) => void;
  handleStopTimerFromTray: () => void;
  handleShowNewTaskDialog: () => void;
  handleStartNewTask: (taskName: string) => void;
  handleViewChange: (view: SidebarView) => void;
  handleStartTimer: (taskName: string) => void;
  handleUpdateEntry: (entry: TimeEntry) => Promise<void>;
  handleDeleteEntry: (entryId: string) => Promise<void>;
}

function AppContent({
  timeEntries,
  activeEntry,
  activeView,
  newTaskDialogOpen,
  setNewTaskDialogOpen,
  handleStopActiveTimer,
  handleStartTimerFromTray,
  handleStopTimerFromTray,
  handleShowNewTaskDialog,
  handleStartNewTask,
  handleViewChange,
  handleStartTimer,
  handleUpdateEntry,
  handleDeleteEntry,
}: AppContentProps) {
  // Task management - now inside NotificationProvider
  const { tasks, addTask, updateTask, deleteTask } = useTaskManagement();

  // Notification context for error handling
  const { showSuccess, showError } = useNotification();

  // Enhanced delete handler with user feedback
  const handleDeleteEntryWithFeedback = async (entryId: string) => {
    try {
      await handleDeleteEntry(entryId);
      showSuccess('Time entry deleted successfully');
    } catch (error) {
      console.error('Failed to delete time entry:', error);
      showError('Failed to delete time entry. Please try again.');
    }
  };

  // Enhanced update handler with user feedback
  const handleUpdateEntryWithFeedback = async (updatedEntry: TimeEntry) => {
    try {
      await handleUpdateEntry(updatedEntry);
      showSuccess('Time entry updated successfully');
    } catch (error) {
      console.error('Failed to update time entry:', error);
      showError('Failed to update time entry. Please try again.');
    }
  };

  // Initialize system tray
  useSystemTray({
    activeEntry,
    timeEntries,
    onStartTimer: handleStartTimerFromTray,
    onStopTimer: handleStopTimerFromTray,
    onShowNewTaskDialog: handleShowNewTaskDialog,
  });

  // Prepare data for components
  const existingTasks = tasks.map(task => task.name);

  return (
    <>
      <CssBaseline />
      <Box sx={{ height: '100vh', display: 'flex' }}>
          {/* Sidebar Navigation */}
          <Sidebar
            activeView={activeView}
            onViewChange={handleViewChange}
          />

          {/* Main Content Area */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Global Timer Bar */}
            <Box sx={{ p: 2 }}>
              <GlobalTimerBar
                activeEntry={activeEntry}
                predefinedTasks={tasks}
                onStart={handleStartTimer}
                onStop={handleStopActiveTimer}
              />
            </Box>

            {/* Page Content */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {activeView === 'dashboard' && (
                <DashboardPage
                  timeEntries={timeEntries}
                  tasks={tasks}
                  onUpdateEntry={handleUpdateEntryWithFeedback}
                  onDeleteEntry={handleDeleteEntryWithFeedback}
                />
              )}

              {activeView === 'tasks' && (
                <TasksPage
                  tasks={tasks}
                  timeEntries={timeEntries}
                  onAddTask={addTask}
                  onUpdateTask={updateTask}
                  onDeleteTask={deleteTask}
                />
              )}

              {activeView === 'reports' && (
                <ReportsPage
                  timeEntries={timeEntries}
                  tasks={tasks}
                  onDeleteEntry={handleDeleteEntryWithFeedback}
                />
              )}

              {activeView === 'settings' && (
                <SettingsPage />
              )}
            </Box>
          </Box>

          {/* New Task Dialog */}
        <NewTaskDialog
          open={newTaskDialogOpen}
          onClose={() => setNewTaskDialogOpen(false)}
          onStartTask={handleStartNewTask}
          existingTasks={existingTasks}
        />
        </Box>
      </>
    );
}

export default App;
