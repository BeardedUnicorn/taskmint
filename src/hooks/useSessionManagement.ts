/**
 * Session Management Hook
 *
 * Manages task sessions and timer instances with proper state management,
 * error handling, and integration with the backend.
 *
 * This hook owns client-side session state and is intended to be instantiated
 * exactly once, via SessionManagementProvider — multiple instances would each
 * hold their own diverging copy of the session list.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

// Backend events that signal session data changed outside this hook's own calls
const TIMER_INSTANCE_EVENTS = [
  'timer-instance-started',
  'timer-instance-stopped',
  'timer-instance-paused',
  'timer-instance-resumed',
  'timer-instance-deleted',
] as const;

// Helper to ensure timer instances always have a state value. The Rust
// backend only sends isRunning/isPaused; a fresh instance (never run, no
// recorded duration) is `idle` and is the only state Start is valid for —
// a completed instance is final.
function normalizeTimerInstance(instance: TimerInstance): TimerInstance {
  if (instance.state) return instance;
  let state = TimerState.idle;
  if (instance.isRunning) state = TimerState.running;
  else if (instance.isPaused) state = TimerState.paused;
  else if (instance.duration != null || instance.endTime != null) state = TimerState.stopped;
  return { ...instance, state };
}

function normalizeSession(session: TaskSession): TaskSession {
  return {
    ...session,
    timerInstances: (session.timerInstances || []).map(normalizeTimerInstance),
  };
}

export function useSessionManagement(): UseSessionManagementReturn {
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [activeSession, setActiveSessionState] = useState<TaskSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { showError, showSuccess } = useNotification();
  const { activeTimer, setActiveTimer } = useActiveTimer();

  // Load sessions from backend. `silent` skips the loading flag so
  // event-driven refreshes don't flash loading UI.
  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const loadedSessions = await invoke<TaskSession[]>('get_sessions');
      const normalizedSessions = (loadedSessions || []).map(normalizeSession);
      setSessions(normalizedSessions);

      // Find active session
      const active = normalizedSessions.find((s: TaskSession) => s.isActive) || null;
      setActiveSessionState(active);

      const runningInstance = normalizedSessions
        .flatMap(s => s.timerInstances)
        .find(i => i.state === TimerState.running) || null;
      setActiveTimer(runningInstance);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(errorMessage);
      showError(errorMessage);
      setSessions([]); // Ensure sessions is always an array
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [showError, setActiveTimer]);

  const updateLocalSession = useCallback((session: TaskSession) => {
    const normalized = normalizeSession(session);

    // Update sessions array
    setSessions(prev => prev.map(s => (s.id === normalized.id ? normalized : s)));

    // Update active session if it matches - use functional update to avoid dependency
    setActiveSessionState(currentActive => {
      if (currentActive && currentActive.id === normalized.id) {
        return normalized;
      }
      return currentActive;
    });

    const runningInstance = normalized.timerInstances.find(t => t.state === TimerState.running) || null;
    if (runningInstance) {
      setActiveTimer(runningInstance);
    } else if (activeTimer && normalized.timerInstances.some(t => t.id === activeTimer.id)) {
      setActiveTimer(null);
    }
  }, [activeTimer, setActiveTimer]);

  const createTimerInstance = useCallback(async (sessionId: string): Promise<TimerInstance | null> => {
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
    return measurePerformance('useSessionManagement.startTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        // The backend refuses to start a timer in an inactive session or
        // while another timer runs. Recover automatically from each case
        // (activate the session / stop the other timer) and retry, at most
        // once per recovery type.
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const updatedSession = await invoke<TaskSession>('start_timer_instance', { instanceId });
            updateLocalSession(updatedSession);
            showSuccess('Timer started');
            return;
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err ?? '');

            if (attempt < maxAttempts && errorMessage.includes('inactive session')) {
              const parentSession = sessions.find(s =>
                s.timerInstances.some(t => t.id === instanceId)
              );
              if (parentSession) {
                const updatedSessions = await invoke<TaskSession[]>(
                  'set_active_session',
                  { sessionId: parentSession.id }
                );
                const normalized = updatedSessions.map(normalizeSession);
                setSessions(normalized);
                setActiveSessionState(normalized.find(s => s.isActive) || null);
                continue;
              }
            }

            if (attempt < maxAttempts && errorMessage.includes('Another timer instance is already running')) {
              const runningInstance = sessions
                .flatMap(s => s.timerInstances)
                .find(i => i.state === TimerState.running && i.id !== instanceId);
              if (runningInstance) {
                const stoppedSession = await invoke<TaskSession>('stop_timer_instance', {
                  instanceId: runningInstance.id,
                });
                updateLocalSession(stoppedSession);
                continue;
              }
            }

            throw err;
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start timer';
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

  // Initialize sessions on mount, and surface any startup load problems the
  // backend recorded (skipped/unreadable records in sessions.json).
  const loadWarningShownRef = useRef(false);
  useEffect(() => {
    loadSessions();

    if (!loadWarningShownRef.current) {
      loadWarningShownRef.current = true;
      invoke<string | null>('get_session_load_warning')
        .then(warning => {
          if (warning) showError(warning);
        })
        .catch(() => {
          // Older backends without this command: nothing to surface
        });
    }
  }, [loadSessions, showError]);

  // Refresh whenever the backend reports a timer-instance change. This keeps
  // any surface that mutates outside this hook (e.g. the system tray) in
  // sync. Listeners register once; the latest loadSessions is kept in a ref.
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => {
    loadSessionsRef.current = loadSessions;
  }, [loadSessions]);

  // Current sessions for event handlers that must read state synchronously
  // (a setState updater would only run at the next render).
  const sessionsRef = useRef<TaskSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        void loadSessionsRef.current({ silent: true });
      }, 300);
    };

    const unlistenPromises = TIMER_INSTANCE_EVENTS.map(eventName =>
      listen(eventName, scheduleReload)
    );

    return () => {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      unlistenPromises.forEach(promise => {
        promise.then(unlisten => unlisten()).catch(() => {});
      });
    };
  }, []);

  // Auto-pause on inactivity. The producers (useInactivityDetection and the
  // warning dialog) dispatch a DOM CustomEvent on window, so listen on the
  // same bus — a Tauri listen() would never receive it.
  //
  // Timers paused by the automatic path (reason 'inactivity') are remembered
  // so resumeOnActivity can resume exactly those — a pause the user chose
  // (reason 'user-action') must stay paused.
  const inactivityPausedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const handlePauseInactivity = async (event: Event) => {
      const reason = (event as CustomEvent).detail?.reason;
      const currentActiveSession = sessionsRef.current.find(s => s.isActive);
      const timersToPause: TimerInstance[] = currentActiveSession
        ? currentActiveSession.timerInstances.filter(t => t.state === TimerState.running)
        : [];

      inactivityPausedIdsRef.current =
        reason === 'inactivity' ? timersToPause.map(t => t.id) : [];

      if (timersToPause.length === 0) return;

      try {
        for (const timer of timersToPause) {
          await pauseTimerInstance(timer.id);
        }
        await loadSessions({ silent: true });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to pause inactive timers';
        showError(errorMessage);
      }
    };

    window.addEventListener('timer-pause-inactivity', handlePauseInactivity);
    return () => {
      window.removeEventListener('timer-pause-inactivity', handlePauseInactivity);
    };
  }, [pauseTimerInstance, loadSessions, showError]);

  // resumeOnActivity: when activity returns after an automatic inactivity
  // pause, useInactivityDetection dispatches this event (only when the
  // setting is enabled) and we resume the timers that pause suspended.
  useEffect(() => {
    const handleResumeActivity = async () => {
      const pausedIds = inactivityPausedIdsRef.current;
      if (pausedIds.length === 0) return;
      inactivityPausedIdsRef.current = [];

      const currentActiveSession = sessionsRef.current.find(s => s.isActive);
      const timersToResume: TimerInstance[] = currentActiveSession
        ? currentActiveSession.timerInstances.filter(
            t => pausedIds.includes(t.id) && t.state === TimerState.paused
          )
        : [];

      if (timersToResume.length === 0) return;

      try {
        for (const timer of timersToResume) {
          await resumeTimerInstance(timer.id);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to resume timers after activity';
        showError(errorMessage);
      }
    };

    window.addEventListener('timer-resume-activity', handleResumeActivity);
    return () => {
      window.removeEventListener('timer-resume-activity', handleResumeActivity);
    };
  }, [resumeTimerInstance, showError]);

  const createSession = useCallback(async (taskId: string, taskName: string): Promise<TaskSession | null> => {
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
        const normalized = (updatedSessions || []).map(normalizeSession);
        setSessions(normalized);
        setActiveSessionState(session ? normalized.find(s => s.id === session.id) || null : null);

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
            // Paused timers must be stopped too, or their tracked time is
            // never recorded and they stay paused in an inactive session.
            for (const instance of activeSession.timerInstances) {
                if (instance.state === TimerState.running || instance.state === TimerState.paused) {
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
