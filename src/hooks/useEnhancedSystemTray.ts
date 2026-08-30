/**
 * Enhanced System Tray Hook for Session-Based Timers
 * 
 * Provides system tray integration that works with the SessionTimer system
 * instead of the legacy global timer system.
 */

import { useEffect, useCallback, useRef } from 'react';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import { Task } from '../types/task';
import { safeInvoke, safeListen, isTauriEnvironment } from '../utils/tauri';
import { getInstanceElapsedMs } from '../utils/timerHelpers';

export interface UseEnhancedSystemTrayProps {
  activeSession: TaskSession | null;
  sessions: TaskSession[];
  tasks: Task[];
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession>;
  onCreateTimerInstance: (sessionId: string) => Promise<TimerInstance>;
  onStartTimer: (instanceId: string) => Promise<void>;
  // Resolves with the updated session (or null on failure); ignored here.
  onStopTimer: (instanceId: string) => Promise<unknown>;
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
  const hasSyncedTimerStateRef = useRef(false);

  // Safe notification function that doesn't require NotificationProvider
  const showError = useCallback((message: string) => {
    console.error('System Tray Error:', message);
    // In a real app, you might want to use a different notification system
    // or make this hook accept an optional error handler
  }, []);

  // Update timer state in backend when active session changes
  const updateTimerState = useCallback(async () => {
    try {
      // Skip if running in browser (development mode). Checked via
      // isTauriEnvironment(): Tauri v2 defines __TAURI_INTERNALS__, and
      // window.__TAURI__ exists only with app.withGlobalTauri — gating on it
      // made all tray wiring dead code in real builds.
      if (!isTauriEnvironment()) {
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
    } catch (error) {
      // Only log errors in Tauri environment
      if (isTauriEnvironment()) {
        console.error('Failed to update timer state:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update system tray timer state';
        showError(`System tray update failed: ${errorMessage}`);
      }
    }
  }, [activeSession, showError]);

  // Handle timer start from tray
  const handleStartTimerFromTray = useCallback(async (taskName: string, _startTime: Date) => {
    try {
      // Find existing task or use the first active one as fallback
      let task = tasks.find(t => t.name === taskName);
      if (!task) {
        task = tasks.find(t => !t.isArchived);
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

  // Update timer state when active session changes. Sync once on mount and
  // then only on real changes: a time-based fallback here used to re-sync on
  // every render once 5s had passed, which rebuilt the tray menu forever even
  // while idle. The backend skips no-op rebuilds, and its own update thread
  // keeps the elapsed display fresh while a timer runs, so nothing needs a
  // periodic push from here.
  useEffect(() => {
    const hasActiveSessionChanged = prevActiveSessionRef.current !== activeSession;
    const hasSessionsChanged = prevSessionsLengthRef.current !== sessions.length;

    if (!hasSyncedTimerStateRef.current || hasActiveSessionChanged || hasSessionsChanged) {
      hasSyncedTimerStateRef.current = true;
      updateTimerState();
      prevActiveSessionRef.current = activeSession;
      prevSessionsLengthRef.current = sessions.length;
    }
  }, [activeSession, sessions, updateTimerState]);

  // Keep the backend's task list current so the tray's task submenu is
  // correct at startup and after task edits; the backend rebuilds the menu
  // only when the list actually changed.
  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }
    safeInvoke('update_tasks', { tasks });
  }, [tasks]);

  // Listen for tray events
  useEffect(() => {
    const setupEventListeners = async () => {
      try {
        // Skip if running in browser (development mode)
        if (!isTauriEnvironment()) {
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
        if (isTauriEnvironment()) {
          console.error('Failed to setup event listeners:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to setup system tray event listeners';
          showError(`System tray initialization failed: ${errorMessage}`);
        }
        return () => {};
      }
    };

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setupEventListeners().then((cleanupFn) => {
      // The effect may have been torn down while the listeners were still
      // registering — unlisten immediately instead of leaking a duplicate
      // set (each leaked set would fire tray handlers once more per click).
      if (cancelled) {
        cleanupFn();
      } else {
        cleanup = cleanupFn;
      }
    });

    return () => {
      cancelled = true;
      if (cleanup) {
        cleanup();
      }
    };
  }, [handleStartTimerFromTray, handleStopTimerFromTray, onShowNewTaskDialog, showError]);

  return {
    updateTimerState,
  };
}
