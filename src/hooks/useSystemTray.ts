import { useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useNotification } from '../contexts/NotificationContext';
import { UseSystemTrayProps } from '../types/timer';

export function useSystemTray({
  activeEntry,
  timeEntries,
  onStartTimer,
  onStopTimer,
  onShowNewTaskDialog,
}: UseSystemTrayProps) {
  // Use refs to track previous values and prevent unnecessary updates
  const prevActiveEntryRef = useRef(activeEntry);
  const prevTimeEntriesLengthRef = useRef(timeEntries.length);
  const lastUpdateRef = useRef(0);
  const { showError } = useNotification();
  // Update tray menu with daily totals
  const updateTrayMenuWithDailyTotal = useCallback(async () => {
    try {
      // Skip if running in browser (development mode)
      if (typeof window !== 'undefined' && !window.__TAURI__) {
        return;
      }

      // Convert timeEntries to the format expected by the backend
      const timeEntriesData = timeEntries.map(entry => ({
        date: entry.date,
        duration: entry.duration || 0,
        isRunning: entry.isRunning,
        taskName: entry.taskName,
      }));

      await invoke('update_tray_menu_command', {
        timeEntries: timeEntriesData,
      });
    } catch (error) {
      // Only log errors in Tauri environment
      if (typeof window !== 'undefined' && window.__TAURI__) {
        console.error('Failed to update tray menu with daily total:', error);
      }
    }
  }, [timeEntries]);

  // Update timer state in backend when activeEntry changes
  const updateTimerState = useCallback(async () => {
    try {
      // Skip if running in browser (development mode)
      if (typeof window !== 'undefined' && !window.__TAURI__) {
        return;
      }

      if (activeEntry && activeEntry.isRunning) {
        await invoke('update_timer_state', {
          isRunning: true,
          taskName: activeEntry.taskName,
          startTime: activeEntry.startTime.toISOString(),
          elapsedMs: Date.now() - activeEntry.startTime.getTime(),
        });
      } else {
        await invoke('update_timer_state', {
          isRunning: false,
          taskName: '',
          startTime: null,
          elapsedMs: 0,
        });
      }

      // Update tray menu to reflect new state
      await updateTrayMenuWithDailyTotal();
    } catch (error) {
      // Only log errors in Tauri environment
      if (typeof window !== 'undefined' && window.__TAURI__) {
        console.error('Failed to update timer state:', error);
        // Propagate specific error from Rust backend
        const errorMessage = error instanceof Error ? error.message : 'Failed to update system tray timer state';
        showError(`System tray update failed: ${errorMessage}`);
      }
    }
  }, [activeEntry, updateTrayMenuWithDailyTotal, showError]);

  // Update tasks list in backend when timeEntries change
  const updateTasks = useCallback(async () => {
    try {
      // Skip if running in browser (development mode)
      if (typeof window !== 'undefined' && !window.__TAURI__) {
        return;
      }

      // Extract unique task names from time entries
      const uniqueTasks = Array.from(
        new Set(timeEntries.map(entry => entry.taskName))
      ).map((taskName, index) => ({
        name: taskName,
        id: `task_${index}_${taskName.replace(/\s+/g, '_').toLowerCase()}`,
      }));

      // Convert to the format expected by the backend
      const tasks = uniqueTasks.map(task => ({
        id: task.id,
        name: task.name,
        hourlyRate: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      await invoke('update_tasks', {
        newTasks: tasks,
      });

      // Update tray menu with daily totals
      await updateTrayMenuWithDailyTotal();
    } catch (error) {
      // Only log errors in Tauri environment
      if (typeof window !== 'undefined' && window.__TAURI__) {
        console.error('Failed to update tasks:', error);
        // Propagate specific error from Rust backend
        const errorMessage = error instanceof Error ? error.message : 'Failed to update system tray tasks';
        showError(`System tray task update failed: ${errorMessage}`);
      }
    }
  }, [timeEntries, updateTrayMenuWithDailyTotal, showError]);

  // Listen for tray events
  useEffect(() => {
    const setupEventListeners = async () => {
      try {
        // Skip if running in browser (development mode)
        if (typeof window !== 'undefined' && !window.__TAURI__) {
          return () => {};
        }

        // Listen for timer started from tray
        const unlistenTimerStarted = await listen<{
          taskName: string;
          startTime: string;
        }>('timer-started-from-tray', (event) => {
          const { taskName, startTime } = event.payload;
          onStartTimer(taskName, new Date(startTime));
        });

        // Listen for timer stopped from tray
        const unlistenTimerStopped = await listen<{
          taskName: string;
          startTime: string | null;
          elapsedMs: number;
        }>('timer-stopped-from-tray', (_event) => {
          onStopTimer();
        });

        // Listen for new task dialog request
        const unlistenNewTaskDialog = await listen(
          'show-new-task-dialog',
          (event) => {
            console.log('Received show-new-task-dialog event:', event);
            onShowNewTaskDialog();
          }
        );

        // Return cleanup function
        return () => {
          unlistenTimerStarted();
          unlistenTimerStopped();
          unlistenNewTaskDialog();
        };
      } catch (error) {
        // Only log errors in Tauri environment
        if (typeof window !== 'undefined' && window.__TAURI__) {
          console.error('Failed to setup event listeners:', error);
          // Propagate specific error from Rust backend
          const errorMessage = error instanceof Error ? error.message : 'Failed to setup system tray event listeners';
          showError(`System tray initialization failed: ${errorMessage}`);
        }
        return () => {};
      }
    };

    let cleanup: (() => void) | undefined;
    setupEventListeners().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [onStartTimer, onStopTimer, onShowNewTaskDialog, showError]);

  // Update backend state when frontend state changes
  useEffect(() => {
    // Only update if activeEntry actually changed
    const activeEntryChanged =
      prevActiveEntryRef.current?.id !== activeEntry?.id ||
      prevActiveEntryRef.current?.isRunning !== activeEntry?.isRunning;

    if (activeEntryChanged) {
      updateTimerState();
      prevActiveEntryRef.current = activeEntry;
      lastUpdateRef.current = Date.now();
    }
  }, [activeEntry, updateTimerState]);

  useEffect(() => {
    // Only update tasks if the number of entries changed (new task added)
    if (prevTimeEntriesLengthRef.current !== timeEntries.length) {
      updateTasks();
      prevTimeEntriesLengthRef.current = timeEntries.length;
    }
  }, [timeEntries.length, updateTasks]);

  // Real-time updates are now handled by the backend timer thread

  return {
    // Utility functions for manual tray operations if needed
    updateTimerState,
    updateTasks,
    updateTrayMenuWithDailyTotal,
  };
}
