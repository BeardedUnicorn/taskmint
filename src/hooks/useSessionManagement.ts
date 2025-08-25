/**
 * Session Management Hook
 * 
 * Manages task sessions and timer instances with proper state management,
 * error handling, and integration with the backend.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  TaskSession,
  TimerInstance,
  UseSessionManagementReturn,
  TimerState,
} from '../types/timer';
import { useNotification } from '../contexts/NotificationContext';
import { measurePerformance } from '../utils/performance';
import { useActiveTimer } from '../contexts/ActiveTimerContext';

export function useSessionManagement(): UseSessionManagementReturn {
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [activeSession, setActiveSessionState] = useState<TaskSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { showError, showSuccess } = useNotification();
  const { activeTimer, setActiveTimer } = useActiveTimer();

  // Load sessions from backend
  const loadSessions = useCallback(async () => {
    console.log('Attempting to load sessions...');
    setIsLoading(true);
    setError(null);
    
    try {
      const loadedSessions = await invoke<TaskSession[]>('get_sessions');
      console.log('Raw sessions from backend:', loadedSessions);
      setSessions(loadedSessions || []);

      // Find active session
      const active = (loadedSessions || []).find((s: TaskSession) => s.isActive) || null;
      console.log('Active session found:', active);
      setActiveSessionState(active);

      const runningInstance = (loadedSessions || [])
        .flatMap(s => s.timerInstances)
        .find(i => i.state === TimerState.running) || null;
      setActiveTimer(runningInstance);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(errorMessage);
      showError(errorMessage);
      setSessions([]); // Ensure sessions is always an array
    } finally {
      setIsLoading(false);
    }
  }, [showError, setActiveTimer]);
  
  const updateLocalSession = useCallback((updatedSession: TaskSession) => {
    console.log('Updating local session:', updatedSession.id);

    // Update sessions array
    setSessions(prev => {
      const updated = prev.map(s => s.id === updatedSession.id ? updatedSession : s);
      console.log('Updated sessions array:', updated);
      return updated;
    });

    // Update active session if it matches - use functional update to avoid dependency
    setActiveSessionState(currentActive => {
      if (currentActive && currentActive.id === updatedSession.id) {
        console.log('Updating active session state');
        return updatedSession;
      }
      return currentActive;
    });

    const runningInstance = updatedSession.timerInstances.find(t => t.state === TimerState.running) || null;
    if (runningInstance) {
      setActiveTimer(runningInstance);
    } else if (activeTimer && updatedSession.timerInstances.some(t => t.id === activeTimer.id)) {
      setActiveTimer(null);
    }
  }, [activeTimer, setActiveTimer]);
  
  const createTimerInstance = useCallback(async (sessionId: string): Promise<TimerInstance | null> => {
    console.log(`Attempting to create timer instance for session ${sessionId}...`);
    return measurePerformance('useSessionManagement.createTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const newInstance = await invoke<TimerInstance>('create_timer_instance', { sessionId });
        await loadSessions(); // Reload to get updated session with new instance
        showSuccess('New timer instance created');
        return newInstance;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create timer instance';
        setError(errorMessage);
        showError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    });
  }, [loadSessions, showError, showSuccess]);

  const startTimerInstance = useCallback(async (instanceId: string): Promise<void> => {
    console.log(`Attempting to start timer instance ${instanceId}...`);
    return measurePerformance('useSessionManagement.startTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('start_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer started');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start timer';

        // If the session is inactive, activate it and retry
        if (errorMessage.includes('inactive session')) {
          const parentSession = sessions.find(s =>
            s.timerInstances.some(t => t.id === instanceId)
          );

          if (parentSession) {
            try {
              const updatedSessions = await invoke<TaskSession[]>(
                'set_active_session',
                { sessionId: parentSession.id }
              );
              setSessions(updatedSessions);
              setActiveSessionState(parentSession);

              const startedSession = await invoke<TaskSession>('start_timer_instance', { instanceId });
              updateLocalSession(startedSession);
              showSuccess('Timer started');
              return;
            } catch (retryErr) {
              const retryMessage =
                retryErr instanceof Error ? retryErr.message : 'Failed to start timer';
              setError(retryMessage);
              showError(retryMessage);
              return;
            }
          }
        }

        // If another timer is already running, stop it and retry
        if (errorMessage.includes('Another timer instance is already running')) {
          const runningInstance = sessions
            .flatMap(s => s.timerInstances)
            .find(i => i.state === TimerState.running);

          if (runningInstance) {
            try {
              const stoppedSession = await invoke<TaskSession>('stop_timer_instance', {
                instanceId: runningInstance.id,
              });
              updateLocalSession(stoppedSession);

              const startedSession = await invoke<TaskSession>('start_timer_instance', { instanceId });
              updateLocalSession(startedSession);
              showSuccess('Timer started');
              return;
            } catch (retryErr) {
              const retryMessage =
                retryErr instanceof Error ? retryErr.message : 'Failed to start timer';
              setError(retryMessage);
              showError(retryMessage);
              return;
            }
          }
        }

        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [sessions, updateLocalSession, showError, showSuccess]);

  const stopTimerInstance = useCallback(async (instanceId: string): Promise<void> => {
    return measurePerformance('useSessionManagement.stopTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('stop_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer stopped');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to stop timer';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError, showSuccess]);

  const pauseTimerInstance = useCallback(async (instanceId: string): Promise<void> => {
    return measurePerformance('useSessionManagement.pauseTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('pause_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer paused');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to pause timer';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError, showSuccess]);

  const resumeTimerInstance = useCallback(async (instanceId: string): Promise<void> => {
    return measurePerformance('useSessionManagement.resumeTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('resume_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer resumed');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to resume timer';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError, showSuccess]);

  const deleteTimerInstance = useCallback(async (instanceId: string): Promise<void> => {
    return measurePerformance('useSessionManagement.deleteTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('delete_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer deleted');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete timer';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError, showSuccess]);

  const updateTimerInstance = useCallback(async (instanceId: string, updates: Record<string, any>): Promise<void> => {
    return measurePerformance('useSessionManagement.updateTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        await invoke('update_timer_instance', { instanceId, updates });
        await loadSessions();
        showSuccess('Timer updated');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update timer';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [loadSessions, showError, showSuccess]);

  // Initialize sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Setup event listeners separately to avoid dependency issues
    useEffect(() => {
      let unlisten: (() => void | Promise<void>) | null = null;
      const setupEventListeners = async () => {
        unlisten = await listen('timer-pause-inactivity', async () => {
          let timersToPause: TimerInstance[] = [];

          // Get current active session from state without depending on it
          setSessions(currentSessions => {
            const currentActiveSession = currentSessions.find(s => s.isActive);
            if (currentActiveSession) {
              timersToPause = currentActiveSession.timerInstances.filter(t => t.state === TimerState.running);
            }
            return currentSessions; // no state update, just reading current state
          });

          if (timersToPause.length === 0) return;

          try {
            // Pause timers sequentially
            for (const timer of timersToPause) {
              await pauseTimerInstance(timer.id);
            }

            // Reload sessions to reflect paused state
            await loadSessions();
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : 'Failed to pause inactive timers';
            showError(errorMessage);
          }
        });
      };
      setupEventListeners();

      return () => {
        if (unlisten) {
          void unlisten();
        }
      };
    }, [pauseTimerInstance, loadSessions, showError]);

  const createSession = useCallback(async (taskId: string, taskName: string): Promise<TaskSession | null> => {
    console.log(`Attempting to create session for task ${taskId}...`);
    return measurePerformance('useSessionManagement.createSession', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const trimmedTaskName = taskName?.trim() || '';
        if (!trimmedTaskName) throw new Error('Task name cannot be empty');

        const newSession = await invoke<TaskSession>('create_session', { taskId, taskName: trimmedTaskName });
        
        await loadSessions(); // Reload all sessions to reflect the new active one
        showSuccess(`Session started for "${trimmedTaskName}"`);

        return newSession;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create session';
        setError(errorMessage);
        showError(errorMessage);
        throw err; // Re-throw the error so tests can catch it
      } finally {
        setIsLoading(false);
      }
    });
  }, [showError, showSuccess, loadSessions]);

  const updateSession = useCallback(async (sessionId: string, updates: Partial<TaskSession>): Promise<TaskSession | null> => {
    return measurePerformance('useSessionManagement.updateSession', async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const updatedSession = await invoke<TaskSession>('update_session', { sessionId, updates });
        updateLocalSession(updatedSession);
        return updatedSession;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update session';
        setError(errorMessage);
        showError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError]);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    return measurePerformance('useSessionManagement.deleteSession', async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        await invoke('delete_session', { sessionId });
        
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        
        if (activeSession?.id === sessionId) {
          setActiveSessionState(null);
        }
        
        showSuccess('Session deleted successfully');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete session';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [activeSession, showError, showSuccess]);

  const getSessionById = useCallback((sessionId: string): TaskSession | undefined => {
    return (sessions || []).find(s => s.id === sessionId);
  }, [sessions]);

  const getSessionsByTaskId = useCallback((taskId: string): TaskSession[] => {
    return (sessions || []).filter(s => s.taskId === taskId);
  }, [sessions]);

  const getActiveSession = useCallback((): TaskSession | null => {
    return activeSession;
  }, [activeSession]);

  const setActiveSession = useCallback(async (session: TaskSession | null): Promise<void> => {
    return measurePerformance('useSessionManagement.setActiveSession', async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const updatedSessions = await invoke<TaskSession[]>('set_active_session', { sessionId: session?.id });
        setSessions(updatedSessions);
        setActiveSessionState(session);

        if (session) {
          const taskName = session.taskName || 'Unknown Task';
          showSuccess(`Activated session for "${taskName}"`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to set active session';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [showError, showSuccess]);

    const endActiveSession = useCallback(async (): Promise<void> => {
        if (!activeSession) return;
        setIsLoading(true);
        try {
            for (const instance of activeSession.timerInstances) {
                if (instance.state === TimerState.running) {
                    await stopTimerInstance(instance.id);
                }
            }
            await setActiveSession(null);
            showSuccess('Session ended successfully.');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to end session';
            showError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [activeSession, stopTimerInstance, setActiveSession, showError, showSuccess]);

    const pauseAllTimersInActiveSession = useCallback(async (): Promise<void> => {
        if (!activeSession) return;
        setIsLoading(true);
        try {
            const runningTimers = activeSession.timerInstances.filter(t => t.state === TimerState.running);
            for (const timer of runningTimers) {
                await pauseTimerInstance(timer.id);
            }
            if (runningTimers.length > 0) showSuccess(`Paused ${runningTimers.length} timer(s).`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to pause all timers';
            showError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [activeSession, pauseTimerInstance, showError, showSuccess]);

    const resumeAllTimersInActiveSession = useCallback(async (): Promise<void> => {
        if (!activeSession) return;
        setIsLoading(true);
        try {
            const pausedTimers = activeSession.timerInstances.filter(t => t.state === TimerState.paused);
            for (const timer of pausedTimers) {
                await resumeTimerInstance(timer.id);
            }
            if (pausedTimers.length > 0) showSuccess(`Resumed ${pausedTimers.length} timer(s).`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to resume all timers';
            showError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [activeSession, resumeTimerInstance, showError, showSuccess]);

  return {
    sessions,
    activeSession,
    createSession,
    updateSession,
    deleteSession,
    getSessionById,
    getSessionsByTaskId,
    getActiveSession,
    setActiveSession,
    endActiveSession,
    pauseAllTimersInActiveSession,
    resumeAllTimersInActiveSession,
    createTimerInstance,
    startTimerInstance,
    stopTimerInstance,
    pauseTimerInstance,
    resumeTimerInstance,
    deleteTimerInstance,
    updateTimerInstance,
    isLoading,
    error,
  };
}
