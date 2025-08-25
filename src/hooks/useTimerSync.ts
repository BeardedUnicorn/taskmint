/**
 * Timer Synchronization Hook
 *
 * This hook acts as a bridge between the session-based timer system and a global
 * timer state. It listens for events from both systems and emits standardized
 * events to keep them synchronized, handling conflicts gracefully.
 */
import { useEffect, useCallback } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { useSessionManagement } from './useSessionManagement';
import { useNotification } from '../contexts/NotificationContext';
import { TaskSession, TimerInstance, TimerState } from '../types/timer';
import { useActiveTimer } from '../contexts/ActiveTimerContext';

// Define TimerSyncEvent type locally since it's not exported from types
interface TimerSyncEvent<T = any> {
  payload: T;
}

/**
 * Custom hook to synchronize session timers with a global timer state.
 */
export function useTimerSync() {
  const { activeSession, sessions } = useSessionManagement();
  const { showWarning } = useNotification();
  const { activeTimer, setActiveTimer } = useActiveTimer();

  // Effect to sync global timer state when active session changes
  useEffect(() => {
    const runningInstance = activeSession?.timerInstances.find(t => t.state === TimerState.running) || null;
    setActiveTimer(runningInstance);
  }, [activeSession, setActiveTimer]);

  /**
   * Handles the start of a session timer.
   * If a global timer is already active, it flags a conflict.
   * Otherwise, it ensures the global timer state is also set to active.
   */
  const handleSessionTimerStarted = useCallback((event: TimerSyncEvent<{ session: TaskSession; instance: TimerInstance }>) => {
    if (activeTimer) {
      showWarning('Conflict: A global timer is already running. Session timer will take priority.');
    }
    const { session, instance } = event.payload;
    console.log(`Sync: Session timer started for task "${session.taskName}" (Instance: ${instance.id})`);
    setActiveTimer(instance);
  }, [activeTimer, showWarning, setActiveTimer]);

  /**
   * Handles the stopping or pausing of a session timer.
   * If no other session timers are running, it deactivates the global timer state.
   */
  const handleSessionTimerStopped = useCallback(() => {
    const runningInstance = sessions
      .flatMap(s => s.timerInstances)
      .find(t => t.state === TimerState.running) || null;
    if (!runningInstance) {
      console.log('Sync: All session timers stopped. Deactivating global timer.');
    }
    setActiveTimer(runningInstance);
  }, [sessions, setActiveTimer]);

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

  return { isGlobalTimerActive: !!activeTimer };
}
