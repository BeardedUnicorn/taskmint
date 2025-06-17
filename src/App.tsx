import React, { useState, useEffect } from 'react';
import {
  CssBaseline,
  Box,
} from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { TimeEntryForm, CalendarView, TaskManagement, NewTaskDialog, NoteTemplates } from './components/pages';
import { Navbar } from './components/layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimeEntry } from './types/timer';
import { Task } from './types/task';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSystemTray } from './hooks/useSystemTray';
import { useTaskManagement } from './hooks/useTaskManagement';
import { TAB_INDICES, STORAGE_KEYS } from './constants';


function App() {
  const [timeEntries, setTimeEntries] = useLocalStorage<TimeEntry[]>(STORAGE_KEYS.TIME_ENTRIES, []);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [currentTab, setCurrentTab] = useState<number>(TAB_INDICES.DAILY_TIME_ENTRIES);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);

  // Task management
  const { tasks, addTask, updateTask, deleteTask } = useTaskManagement();



  // Restore active entry on app start
  useEffect(() => {
    const runningEntry = timeEntries.find(entry => entry.isRunning);
    if (runningEntry) {
      // Convert string dates back to Date objects
      const restoredEntry: TimeEntry = {
        ...runningEntry,
        startTime: new Date(runningEntry.startTime),
        endTime: runningEntry.endTime ? new Date(runningEntry.endTime) : undefined,
      };
      setActiveEntry(restoredEntry);
    }
  }, [timeEntries]);

  const handleSaveEntry = (entry: TimeEntry) => {
    setTimeEntries(prev => {
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
      setTimeEntries(prev => {
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

  const handleUpdateEntry = (updatedEntry: TimeEntry) => {
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
  };

  const handleDeleteEntry = (entryId: string) => {
    setTimeEntries(prev => {
      return prev.filter(entry => entry.id !== entryId);
    });
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

  const handleCreateNewTaskFromForm = async (taskName: string): Promise<Task> => {
    const result = await addTask({ name: taskName });
    if (!result) {
      throw new Error('Failed to create task');
    }
    return result;
  };





  // Get existing task names for the dialog
  const existingTasks = Array.from(new Set(timeEntries.map(entry => entry.taskName)));

  // Initialize system tray
  useSystemTray({
    activeEntry,
    timeEntries,
    onStartTimer: handleStartTimerFromTray,
    onStopTimer: handleStopTimerFromTray,
    onShowNewTaskDialog: handleShowNewTaskDialog,
  });





  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // Convert stored entries back to proper Date objects for display
  const processedEntries: TimeEntry[] = timeEntries.map(entry => ({
    ...entry,
    startTime: new Date(entry.startTime),
    endTime: entry.endTime ? new Date(entry.endTime) : undefined,
  }));

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <CssBaseline />
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Navbar
            activeEntry={activeEntry}
            onStopActiveTimer={handleStopActiveTimer}
            currentTab={currentTab}
            onTabChange={handleTabChange}
          />



        {/* Main Content Area */}
        {currentTab === 0 && (
          /* Daily Time Entries */
          <Box sx={{
            flex: 1,
            display: 'flex',
            p: 3,
            overflow: 'hidden',
            gap: 3
          }}>
            {/* Left Panel - Timer Form */}
            <Box sx={{
              width: '400px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column'
            }}>
              <TimeEntryForm
                onSave={handleSaveEntry}
                predefinedTasks={tasks}
                activeEntry={activeEntry}
                onUpdateActiveEntry={handleUpdateActiveEntry}
                onCreateNewTask={handleCreateNewTaskFromForm}
                timeEntries={processedEntries}
              />
            </Box>

            {/* Right Panel - Calendar View (Full Width) */}
            <Box sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0, // Important for flex item to shrink
              overflow: 'hidden'
            }}>
              <CalendarView
                entries={processedEntries}
                tasks={tasks}
                onUpdateEntry={handleUpdateEntry}
                onDeleteEntry={handleDeleteEntry}
              />
            </Box>
          </Box>
        )}

        {currentTab === TAB_INDICES.TASK_MANAGEMENT && (
          /* Task Management */
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <TaskManagement
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
            />
          </Box>
        )}

        {currentTab === TAB_INDICES.NOTE_TEMPLATES && (
          /* Note Templates */
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <NoteTemplates />
          </Box>
        )}



        {/* New Task Dialog */}
        <NewTaskDialog
          open={newTaskDialogOpen}
          onClose={() => setNewTaskDialogOpen(false)}
          onStartTask={handleStartNewTask}
          existingTasks={existingTasks}
        />
        </Box>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
