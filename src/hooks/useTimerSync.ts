/**
 * Timer Synchronization Hook
 *
 * This hook acts as a bridge between the session-based timer system and a global
 * timer state. It listens for events from both systems and emits standardized
 * events to keep them synchronized, handling conflicts gracefully.
 */
import { useEffect, useCallback, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { useSessionManagement } from './useSessionManagement';
import { useNotification } from '../contexts/NotificationContext';
import { TaskSession, TimerInstance, TimerSyncEvent } from '../types';

/**
 * Custom hook to synchronize session timers with a global timer state.
 */
export function useTimerSync() {
  const { activeSession, sessions } = useSessionManagement();
  const { showWarning } = useNotification();
  const [isGlobalTimerActive, setIsGlobalTimerActive] = useState(false);

  // Effect to sync global timer state when active session changes
  useEffect(() => {
    const isSessionTimerRunning = activeSession?.timerInstances.some(t => t.isRunning) ?? false;
    setIsGlobalTimerActive(isSessionTimerRunning);
  }, [activeSession]);

  /**
   * Handles the start of a session timer.
   * If a global timer is already active, it flags a conflict.
   * Otherwise, it ensures the global timer state is also set to active.
   */
  const handleSessionTimerStarted = useCallback((event: TimerSyncEvent<{ session: TaskSession; instance: TimerInstance }>) => {
    if (isGlobalTimerActive) {
      showWarning('Conflict: A global timer is already running. Session timer will take priority.');
    }
    const { session, instance } = event.payload;
    console.log(`Sync: Session timer started for task "${session.taskName}" (Instance: ${instance.id})`);
    setIsGlobalTimerActive(true);
  }, [isGlobalTimerActive, showWarning]);

  /**
   * Handles the stopping or pausing of a session timer.
   * If no other session timers are running, it deactivates the global timer state.
   */
  const handleSessionTimerStopped = useCallback(() => {
    const anyRunning = sessions.some(s => s.timerInstances.some(t => t.isRunning));
    if (!anyRunning) {
      console.log('Sync: All session timers stopped. Deactivating global timer.');
      setIsGlobalTimerActive(false);
    }
  }, [sessions]);

  /**
   * Handles the start of the global timer.
   * This typically signals the need to create a new session if none is active.
   */
  const handleGlobalTimerStarted = useCallback((event: TimerSyncEvent<{ taskName: string }>) => {
    if (!activeSession) {
      console.log(`Sync: Global timer started for "${event.payload.taskName}". Emitting 'create-session' event.`);
      // Emit an event to be handled by App.tsx to create a new session
      emit('create-session-from-global', { taskName: event.payload.taskName });
    }
  }, [activeSession]);

  /**
   * Sets up and cleans up all event listeners for synchronization.
   */
  useEffect(() => {
    const listeners = [
      listen('session-timer-started', handleSessionTimerStarted),
      listen('session-timer-stopped', handleSessionTimerStopped),
      listen('session-timer-paused', handleSessionTimerStopped), // Pausing also stops the timer from a global perspective
      listen('global-timer-started', handleGlobalTimerStarted),
    ];

    const cleanup = async () => {
      const unlistenFns = await Promise.all(listeners);
      unlistenFns.forEach(unlisten => unlisten());
    };

    return () => {
      cleanup();
    };
  }, [handleSessionTimerStarted, handleSessionTimerStopped, handleGlobalTimerStarted]);

  return { isGlobalTimerActive };
}