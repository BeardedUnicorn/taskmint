import { useState, useEffect } from 'react';
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
import { NotificationProvider } from './contexts/NotificationContext';
import { NewTaskDialog } from './components/pages';
import { DashboardPage } from './components/pages/DashboardPage';
import { TasksPage } from './components/pages/TasksPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { Sidebar, GlobalTimerBar, type SidebarView } from './components/layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimeEntry } from './types/timer';

import { useLocalStorage } from './hooks/useLocalStorage';
import { useSystemTray } from './hooks/useSystemTray';
import { useTaskManagement } from './hooks/useTaskManagement';
import { STORAGE_KEYS } from './constants';
import { convertTimeEntriesDates } from './utils/dateHelpers';


function App() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Timer and time entry state
  const [rawTimeEntries, setRawTimeEntries] = useLocalStorage<TimeEntry[]>(STORAGE_KEYS.TIME_ENTRIES, []);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);

  // Convert time entries to ensure proper Date objects
  const timeEntries = convertTimeEntriesDates(rawTimeEntries);

  // Navigation state
  const [activeView, setActiveView] = useState<SidebarView>('dashboard');
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);

  // ============================================================================
  // EFFECTS & INITIALIZATION
  // ============================================================================

  // Restore active entry on app start
  useEffect(() => {
    const runningEntry = timeEntries.find(entry => entry.isRunning);
    if (runningEntry) {
      // Time entries are already converted to proper Date objects
      setActiveEntry(runningEntry);
    }
  }, [timeEntries]);

  // ============================================================================
  // TIMER MANAGEMENT HANDLERS
  // ============================================================================

  const handleSaveEntry = (entry: TimeEntry) => {
    setRawTimeEntries(prev => {
      const existingIndex = prev.findIndex(e => e.id === entry.id);
      if (existingIndex >= 0) {
        // Update existing entry
        const updated = [...prev];
        updated[existingIndex] = entry;
        return updated;
      } else {
        // Add new entry
        return [...prev, entry];
      }
    });

    setActiveEntry(null);
  };

  const handleUpdateActiveEntry = (entry: TimeEntry | null) => {
    setActiveEntry(entry);
    if (entry) {
      setRawTimeEntries(prev => {
        const existingIndex = prev.findIndex(e => e.id === entry.id);
        if (existingIndex >= 0) {
          // Update existing entry
          const updated = [...prev];
          updated[existingIndex] = entry;
          return updated;
        } else {
          // Add new entry (for running timers)
          return [...prev, entry];
        }
      });
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
  const handleUpdateEntry = (updatedEntry: TimeEntry) => {
    setRawTimeEntries(prev => {
      const existingIndex = prev.findIndex(entry => entry.id === updatedEntry.id);

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = updatedEntry;
        return updated;
      } else {
        return [...prev, updatedEntry];
      }
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    setRawTimeEntries(prev => {
      return prev.filter(entry => entry.id !== entryId);
    });
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
  handleUpdateEntry: (entry: TimeEntry) => void;
  handleDeleteEntry: (entryId: string) => void;
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
                  onUpdateEntry={handleUpdateEntry}
                  onDeleteEntry={handleDeleteEntry}
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
                  onDeleteEntry={handleDeleteEntry}
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
