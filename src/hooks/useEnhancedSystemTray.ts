/**
 * Enhanced System Tray Hook for Session-Based Timers
 * 
 * Provides system tray integration that works with the SessionTimer system
 * instead of the legacy global timer system.
 */

import { useEffect, useCallback, useRef } from 'react';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import { Task } from '../types/task';
import { safeInvoke, safeListen } from '../utils/tauri';
import { getInstanceElapsedMs } from '../utils/timerHelpers';

export interface UseEnhancedSystemTrayProps {
  activeSession: TaskSession | null;
  sessions: TaskSession[];
  tasks: Task[];
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession>;
  onCreateTimerInstance: (sessionId: string) => Promise<TimerInstance>;
  onStartTimer: (instanceId: string) => Promise<void>;
  onStopTimer: (instanceId: string) => Promise<void>;
  onShowNewTaskDialog: () => void;
}

export function useEnhancedSystemTray({
  activeSession,
  sessions,
  tasks,
  onStartSession,
  onCreateTimerInstance,
  onStartTimer,
  onStopTimer,
  onShowNewTaskDialog,
}: UseEnhancedSystemTrayProps) {
  const prevActiveSessionRef = useRef(activeSession);
  const prevSessionsLengthRef = useRef(sessions.length);
  const lastUpdateRef = useRef(0);

  // Safe notification function that doesn't require NotificationProvider
  const showError = useCallback((message: string) => {
    console.error('System Tray Error:', message);
    // In a real app, you might want to use a different notification system
    // or make this hook accept an optional error handler
  }, []);

  // Update tray menu with session data
  const updateTrayMenuWithSessions = useCallback(async () => {
    try {
      // Skip if running in browser (development mode)
      if (typeof window !== 'undefined' && !window.__TAURI__) {
        return;
      }

      // Convert sessions to the format expected by the backend
      const sessionData = sessions.map(session => {
        const totalDuration = session.timerInstances?.reduce((total, instance) => {
          return total + (instance.duration || 0);
        }, 0) || 0;

        const isRunning = session.timerInstances?.some(instance => instance.state === TimerState.running) || false;

        return {
          date: new Date().toISOString().split('T')[0], // Today's date
          duration: totalDuration,
          isRunning,
          taskName: session.taskName,
        };
      });

      await safeInvoke('update_tray_menu_command', {
        timeEntries: sessionData,
      });
    } catch (error) {
      // Only log errors in Tauri environment
      if (typeof window !== 'undefined' && window.__TAURI__) {
        console.error('Failed to update tray menu with session data:', error);
      }
    }
  }, [sessions]);

  // Update timer state in backend when active session changes
  const updateTimerState = useCallback(async () => {
    try {
      // Skip if running in browser (development mode)
      if (typeof window !== 'undefined' && !window.__TAURI__) {
        return;
      }

      const runningInstance = activeSession?.timerInstances?.find(i => i.state === TimerState.running);

      if (activeSession && runningInstance) {
        const startTime = runningInstance.startTime instanceof Date
          ? runningInstance.startTime
          : new Date(runningInstance.startTime);

        // The Rust tray thread recomputes elapsed each tick as
        // (now - startTime), so shift the reported start forward by the
        // accumulated pause time to keep the tray clock pause-aware.
        const pausedMs = runningInstance.pausedDuration || 0;
        const effectiveStart = new Date(startTime.getTime() + pausedMs);

        await safeInvoke('update_timer_state', {
          isRunning: true,
          taskName: activeSession.taskName,
          startTime: effectiveStart.toISOString(),
          elapsedMs: getInstanceElapsedMs(runningInstance),
        });
      } else {
        await safeInvoke('update_timer_state', {
          isRunning: false,
          taskName: '',
          startTime: null,
          elapsedMs: 0,
        });
      }

      // Update tray menu to reflect new state
      await updateTrayMenuWithSessions();
    } catch (error) {
      // Only log errors in Tauri environment
      if (typeof window !== 'undefined' && window.__TAURI__) {
        console.error('Failed to update timer state:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update system tray timer state';
        showError(`System tray update failed: ${errorMessage}`);
      }
    }
  }, [activeSession, updateTrayMenuWithSessions, showError]);

  // Handle timer start from tray
  const handleStartTimerFromTray = useCallback(async (taskName: string, _startTime: Date) => {
    try {
      // Find existing task or use the first one as fallback
      let task = tasks.find(t => t.name === taskName);
      if (!task && tasks.length > 0) {
        task = tasks[0];
      }

      const taskId = task?.id || 'default';
      
      // Check if there's already an active session for this task
      let session = activeSession;
      if (!session || session.taskName !== taskName) {
        // Create new session
        session = await onStartSession(taskId, taskName);
      }

      // Create and start a new timer instance
      const instance = await onCreateTimerInstance(session.id);
      await onStartTimer(instance.id);
    } catch (error) {
      console.error('Failed to start timer from tray:', error);
      showError('Failed to start timer from system tray');
    }
  }, [tasks, activeSession, onStartSession, onCreateTimerInstance, onStartTimer, showError]);

  // Handle timer stop from tray
  const handleStopTimerFromTray = useCallback(async () => {
    try {
      const runningInstance = activeSession?.timerInstances?.find(i => i.state === TimerState.running);
      if (runningInstance) {
        await onStopTimer(runningInstance.id);
      }
    } catch (error) {
      console.error('Failed to stop timer from tray:', error);
      showError('Failed to stop timer from system tray');
    }
  }, [activeSession, onStopTimer, showError]);

  // Update timer state when active session changes
  useEffect(() => {
    const now = Date.now();
    const hasActiveSessionChanged = prevActiveSessionRef.current !== activeSession;
    const hasSessionsChanged = prevSessionsLengthRef.current !== sessions.length;
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Update if active session changed, sessions changed, or enough time has passed
    if (hasActiveSessionChanged || hasSessionsChanged || timeSinceLastUpdate > 5000) {
      updateTimerState();
      prevActiveSessionRef.current = activeSession;
      prevSessionsLengthRef.current = sessions.length;
      lastUpdateRef.current = now;
    }
  }, [activeSession, sessions, updateTimerState]);

  // Listen for tray events
  useEffect(() => {
    const setupEventListeners = async () => {
      try {
        // Skip if running in browser (development mode)
        if (typeof window !== 'undefined' && !window.__TAURI__) {
          return () => {};
        }

        // Listen for timer started from tray
        const unlistenTimerStarted = await safeListen('timer-started-from-tray', (event: any) => {
          const { taskName, startTime } = event.payload;
          handleStartTimerFromTray(taskName, new Date(startTime));
        });

        // Listen for timer stopped from tray
        const unlistenTimerStopped = await safeListen('timer-stopped-from-tray', (_event: any) => {
          handleStopTimerFromTray();
        });

        // Listen for new task dialog request from tray
        const unlistenNewTaskDialog = await safeListen('show-new-task-dialog', (_event: any) => {
          onShowNewTaskDialog();
        });

        // Return cleanup function
        return () => {
          if (unlistenTimerStarted) unlistenTimerStarted();
          if (unlistenTimerStopped) unlistenTimerStopped();
          if (unlistenNewTaskDialog) unlistenNewTaskDialog();
        };
      } catch (error) {
        // Only log errors in Tauri environment
        if (typeof window !== 'undefined' && window.__TAURI__) {
          console.error('Failed to setup event listeners:', error);
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
  }, [handleStartTimerFromTray, handleStopTimerFromTray, onShowNewTaskDialog, showError]);

  // Initial tray menu update
  useEffect(() => {
    updateTrayMenuWithSessions();
  }, [updateTrayMenuWithSessions]);

  return {
    updateTrayMenuWithSessions,
    updateTimerState,
  };
}
