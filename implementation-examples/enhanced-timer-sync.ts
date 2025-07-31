/**
 * Enhanced Timer Synchronization System
 * 
 * Improved synchronization between global timer and session-based timers
 * with proper event handling, conflict resolution, and state management.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { TimeEntry } from '../types/timeEntry';
import { TaskSession, TimerInstance } from '../types/timer';
import { useNotification } from '../contexts/NotificationContext';

// Event types for timer synchronization
interface TimerSyncEvents {
  'timer-instance-started': {
    instance: TimerInstance;
    session: TaskSession;
  };
  'timer-instance-stopped': {
    instance: TimerInstance;
    session: TaskSession;
  };
  'timer-instance-paused': {
    instance: TimerInstance;
    session: TaskSession;
  };
  'timer-instance-resumed': {
    instance: TimerInstance;
    session: TaskSession;
  };
  'global-timer-started': {
    entry: TimeEntry;
  };
  'global-timer-stopped': {
    entry: TimeEntry;
  };
  'global-timer-paused': {
    entry: TimeEntry;
  };
  'global-timer-resumed': {
    entry: TimeEntry;
  };
  'sync-conflict-detected': {
    globalTimer: TimeEntry | null;
    sessionTimer: TimerInstance | null;
    conflictType: 'both-running' | 'state-mismatch' | 'data-inconsistency';
  };
}

// Sync state types
type SyncState = 
  | 'idle'
  | 'global-priority'
  | 'session-priority'
  | 'conflict'
  | 'syncing';

interface TimerSyncConfig {
  conflictResolution: 'global-priority' | 'session-priority' | 'user-choice';
  autoSync: boolean;
  syncInterval: number;
  maxRetries: number;
}

interface UseTimerSyncProps {
  activeEntry: TimeEntry | null;
  setActiveEntry: (entry: TimeEntry | null) => void;
  activeSession: TaskSession | null;
  setActiveSession: (session: TaskSession | null) => void;
  config?: Partial<TimerSyncConfig>;
}

const defaultConfig: TimerSyncConfig = {
  conflictResolution: 'session-priority',
  autoSync: true,
  syncInterval: 5000, // 5 seconds
  maxRetries: 3,
};

export const useEnhancedTimerSync = ({
  activeEntry,
  setActiveEntry,
  activeSession,
  setActiveSession,
  config = {},
}: UseTimerSyncProps) => {
  const { showError, showWarning, showSuccess } = useNotification();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const finalConfig = { ...defaultConfig, ...config };
  const syncInProgress = useRef(false);
  const eventListeners = useRef<Array<() => void>>([]);

  // Determine current sync state based on active timers
  const determineSyncState = useCallback((): SyncState => {
    const hasGlobalTimer = activeEntry?.isRunning;
    const hasSessionTimer = activeSession?.timerInstances.some(i => i.isRunning);

    if (hasGlobalTimer && hasSessionTimer) {
      return 'conflict';
    } else if (hasGlobalTimer) {
      return 'global-priority';
    } else if (hasSessionTimer) {
      return 'session-priority';
    } else {
      return 'idle';
    }
  }, [activeEntry, activeSession]);

  // Update sync state when timers change
  useEffect(() => {
    const newState = determineSyncState();
    setSyncState(newState);
  }, [determineSyncState]);

  // Conflict resolution handler
  const resolveConflict = useCallback(async (
    globalTimer: TimeEntry | null,
    sessionTimer: TimerInstance | null,
    conflictType: TimerSyncEvents['sync-conflict-detected']['conflictType']
  ) => {
    if (syncInProgress.current) return;
    
    syncInProgress.current = true;
    setSyncState('syncing');

    try {
      switch (finalConfig.conflictResolution) {
        case 'global-priority':
          if (sessionTimer && globalTimer) {
            // Stop session timer, keep global timer
            await invoke('pause_timer_instance', { instanceId: sessionTimer.id });
            showWarning('Session timer paused due to global timer priority');
          }
          break;

        case 'session-priority':
          if (globalTimer && sessionTimer) {
            // Stop global timer, keep session timer
            setActiveEntry({ ...globalTimer, isRunning: false });
            showWarning('Global timer paused due to session timer priority');
          }
          break;

        case 'user-choice':
          // Emit event for user to choose
          await emit('sync-conflict-detected', {
            globalTimer,
            sessionTimer,
            conflictType,
          });
          break;
      }

      setRetryCount(0);
      setLastSyncTime(new Date());
      
    } catch (error) {
      console.error('Failed to resolve timer conflict:', error);
      
      if (retryCount < finalConfig.maxRetries) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => resolveConflict(globalTimer, sessionTimer, conflictType), 1000);
      } else {
        showError('Failed to resolve timer synchronization conflict');
        setSyncState('conflict');
      }
    } finally {
      syncInProgress.current = false;
    }
  }, [finalConfig.conflictResolution, finalConfig.maxRetries, retryCount, setActiveEntry, showError, showWarning]);

  // Session timer event handlers
  const handleSessionTimerStarted = useCallback(async (event: CustomEvent<TimerSyncEvents['timer-instance-started']>) => {
    const { instance, session } = event.detail;
    
    try {
      // If no global timer is running, create one
      if (!activeEntry?.isRunning) {
        const newEntry: TimeEntry = {
          id: `sync-${instance.id}`,
          taskName: session.taskName,
          startTime: instance.startTime,
          endTime: undefined,
          isRunning: true,
          date: new Date().toISOString().split('T')[0],
          sessionId: session.id,
          timerInstanceId: instance.id,
        };
        
        setActiveEntry(newEntry);
        await emit('global-timer-started', { entry: newEntry });
        
      } else if (activeEntry.taskName !== session.taskName) {
        // Different task - potential conflict
        await resolveConflict(activeEntry, instance, 'both-running');
      }
      
    } catch (error) {
      console.error('Failed to sync session timer start:', error);
      showError('Timer synchronization failed');
    }
  }, [activeEntry, setActiveEntry, resolveConflict, showError]);

  const handleSessionTimerStopped = useCallback(async (event: CustomEvent<TimerSyncEvents['timer-instance-stopped']>) => {
    const { instance, session } = event.detail;
    
    try {
      // If this was the last running timer in the session, stop global timer
      const otherRunningTimers = session.timerInstances.filter(
        i => i.id !== instance.id && i.isRunning
      );
      
      if (otherRunningTimers.length === 0 && activeEntry?.sessionId === session.id) {
        const stoppedEntry = {
          ...activeEntry,
          endTime: instance.endTime || new Date(),
          isRunning: false,
        };
        
        setActiveEntry(null);
        await emit('global-timer-stopped', { entry: stoppedEntry });
      }
      
    } catch (error) {
      console.error('Failed to sync session timer stop:', error);
    }
  }, [activeEntry, setActiveEntry]);

  const handleSessionTimerPaused = useCallback(async (event: CustomEvent<TimerSyncEvents['timer-instance-paused']>) => {
    const { instance, session } = event.detail;
    
    try {
      // If this was the only running timer, pause global timer
      const otherRunningTimers = session.timerInstances.filter(
        i => i.id !== instance.id && i.isRunning
      );
      
      if (otherRunningTimers.length === 0 && activeEntry?.sessionId === session.id) {
        const pausedEntry = { ...activeEntry, isRunning: false };
        setActiveEntry(pausedEntry);
        await emit('global-timer-paused', { entry: pausedEntry });
      }
      
    } catch (error) {
      console.error('Failed to sync session timer pause:', error);
    }
  }, [activeEntry, setActiveEntry]);

  const handleSessionTimerResumed = useCallback(async (event: CustomEvent<TimerSyncEvents['timer-instance-resumed']>) => {
    const { instance, session } = event.detail;
    
    try {
      // Resume global timer if it was paused for this session
      if (activeEntry?.sessionId === session.id && !activeEntry.isRunning) {
        const resumedEntry = { ...activeEntry, isRunning: true };
        setActiveEntry(resumedEntry);
        await emit('global-timer-resumed', { entry: resumedEntry });
      }
      
    } catch (error) {
      console.error('Failed to sync session timer resume:', error);
    }
  }, [activeEntry, setActiveEntry]);

  // Global timer event handlers
  const handleGlobalTimerStarted = useCallback(async (event: CustomEvent<TimerSyncEvents['global-timer-started']>) => {
    const { entry } = event.detail;
    
    try {
      // Check if there's an active session for this task
      if (!activeSession || activeSession.taskName !== entry.taskName) {
        // Create new session for this task
        await emit('create-session-from-global', {
          taskName: entry.taskName,
          entry,
        });
      } else {
        // Add timer instance to existing session
        await emit('add-timer-instance-from-global', {
          sessionId: activeSession.id,
          entry,
        });
      }
      
    } catch (error) {
      console.error('Failed to sync global timer start:', error);
    }
  }, [activeSession]);

  const handleGlobalTimerStopped = useCallback(async (event: CustomEvent<TimerSyncEvents['global-timer-stopped']>) => {
    const { entry } = event.detail;
    
    try {
      // Stop corresponding session timer
      if (entry.sessionId && entry.timerInstanceId) {
        await emit('stop-session-timer', {
          sessionId: entry.sessionId,
          instanceId: entry.timerInstanceId,
        });
      }
      
    } catch (error) {
      console.error('Failed to sync global timer stop:', error);
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    const setupListeners = async () => {
      try {
        const listeners = await Promise.all([
          listen('timer-instance-started', handleSessionTimerStarted),
          listen('timer-instance-stopped', handleSessionTimerStopped),
          listen('timer-instance-paused', handleSessionTimerPaused),
          listen('timer-instance-resumed', handleSessionTimerResumed),
          listen('global-timer-started', handleGlobalTimerStarted),
          listen('global-timer-stopped', handleGlobalTimerStopped),
        ]);
        
        eventListeners.current = listeners;
        
      } catch (error) {
        console.error('Failed to set up timer sync listeners:', error);
        showError('Failed to initialize timer synchronization');
      }
    };

    setupListeners();

    return () => {
      eventListeners.current.forEach(unsubscribe => unsubscribe());
      eventListeners.current = [];
    };
  }, [
    handleSessionTimerStarted,
    handleSessionTimerStopped,
    handleSessionTimerPaused,
    handleSessionTimerResumed,
    handleGlobalTimerStarted,
    handleGlobalTimerStopped,
    showError,
  ]);

  // Periodic sync check
  useEffect(() => {
    if (!finalConfig.autoSync) return;

    const interval = setInterval(async () => {
      const currentState = determineSyncState();
      
      if (currentState === 'conflict' && !syncInProgress.current) {
        const runningSessionTimer = activeSession?.timerInstances.find(i => i.isRunning);
        await resolveConflict(activeEntry, runningSessionTimer || null, 'state-mismatch');
      }
    }, finalConfig.syncInterval);

    return () => clearInterval(interval);
  }, [finalConfig.autoSync, finalConfig.syncInterval, determineSyncState, activeEntry, activeSession, resolveConflict]);

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    if (syncInProgress.current) return;
    
    setSyncState('syncing');
    
    try {
      const currentState = determineSyncState();
      
      if (currentState === 'conflict') {
        const runningSessionTimer = activeSession?.timerInstances.find(i => i.isRunning);
        await resolveConflict(activeEntry, runningSessionTimer || null, 'data-inconsistency');
      }
      
      setLastSyncTime(new Date());
      showSuccess('Timer synchronization completed');
      
    } catch (error) {
      console.error('Manual sync failed:', error);
      showError('Failed to synchronize timers');
    }
  }, [determineSyncState, activeEntry, activeSession, resolveConflict, showError, showSuccess]);

  return {
    syncState,
    lastSyncTime,
    triggerSync,
    isConflicted: syncState === 'conflict',
    isSyncing: syncState === 'syncing',
  };
};
