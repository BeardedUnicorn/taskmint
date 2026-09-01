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

// Backend events that signal session data changed outside this hook's own
// calls (timer-instance changes and work-log imports that rewrite sessions)
const TIMER_INSTANCE_EVENTS = [
  'timer-instance-started',
  'timer-instance-stopped',
  'timer-instance-paused',
  'timer-instance-resumed',
  'timer-instance-deleted',
  'work-logs-imported',
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

/**
 * The single running instance across all sessions (the backend enforces at
 * most one), with its owning session. Used to (re)derive the shared
 * ActiveTimerContext value after whole-list updates. updateLocalSession keeps
 * its cheaper single-session derivation, which is sound under the same
 * invariant.
 */
function findRunningInstance(
  sessions: TaskSession[],
  excludeId?: string
): { instance: TimerInstance; session: TaskSession } | null {
  for (const session of sessions) {
    const instance = session.timerInstances.find(
      i => i.state === TimerState.running && i.id !== excludeId
    );
    if (instance) return { instance, session };
  }
  return null;
}

// Tauri rejects Result<_, String> command errors with the plain string, not
// an Error instance — `err instanceof Error` alone would hide every backend
// message behind the generic fallback.
function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
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

      setActiveTimer(findRunningInstance(normalizedSessions)?.instance ?? null);
    } catch (err) {
      const errorMessage = errorText(err, 'Failed to load sessions');
      setError(errorMessage);
      // Keep the last-known-good sessions/activeSession/activeTimer: blanking
      // the list while the toolbar still shows an active session leaves the
      // UI inconsistent (and would disable inactivity auto-pause). Background
      // refreshes also should not toast out of nowhere.
      if (!silent) showError(errorMessage);
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

  // Current sessions for code that must read state synchronously between
  // renders: event handlers, and the start-timer recovery loop (a closure
  // over `sessions` goes stale the moment a prior action updates the list).
  const sessionsRef = useRef<TaskSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

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
        const errorMessage = errorText(err, 'Failed to create timer instance');
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
        // once per recovery type. Read sessions through the ref: under rapid
        // successive starts a closure over `sessions` holds a stale list and
        // would stop the wrong timer.
        const maxAttempts = 3;
        let handoffTaskName: string | null = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const updatedSession = await invoke<TaskSession>('start_timer_instance', { instanceId });
            updateLocalSession(updatedSession);
            // The hand-off must be explicit: the user asked to start this
            // timer, not to stop the other one.
            showSuccess(
              handoffTaskName
                ? `Timer started — stopped the running timer for "${handoffTaskName}"`
                : 'Timer started'
            );
            return;
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err ?? '');

            if (attempt < maxAttempts && errorMessage.includes('inactive session')) {
              const parentSession = sessionsRef.current.find(s =>
                s.timerInstances.some(t => t.id === instanceId)
              );
              if (parentSession) {
                // Activating this session finalizes timers running in the
                // other sessions backend-side; note it for the toast.
                const other = findRunningInstance(sessionsRef.current, instanceId);
                if (other && other.session.id !== parentSession.id) {
                  handoffTaskName = other.session.taskName;
                }
                const updatedSessions = await invoke<TaskSession[]>(
                  'set_active_session',
                  { sessionId: parentSession.id }
                );
                const normalized = updatedSessions.map(normalizeSession);
                setSessions(normalized);
                setActiveSessionState(normalized.find(s => s.isActive) || null);
                setActiveTimer(findRunningInstance(normalized)?.instance ?? null);
                continue;
              }
            }

            if (attempt < maxAttempts && errorMessage.includes('Another timer instance is already running')) {
              const running = findRunningInstance(sessionsRef.current, instanceId);
              if (running) {
                handoffTaskName = running.session.taskName;
                try {
                  const stoppedSession = await invoke<TaskSession>('stop_timer_instance', {
                    instanceId: running.instance.id,
                  });
                  updateLocalSession(stoppedSession);
                } catch (stopErr) {
                  const stopMessage = stopErr instanceof Error ? stopErr.message : String(stopErr ?? '');
                  // Already stopped between our read and the call (e.g. a
                  // same-tick double start): the obstacle is gone, retry.
                  if (!stopMessage.includes('timer is not running')) throw stopErr;
                }
                continue;
              }
            }

            throw err;
          }
        }
      } catch (err) {
        const errorMessage = errorText(err, 'Failed to start timer');
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, setActiveTimer, showError, showSuccess]);

  // stop/pause/resume return the updated session (or null on failure) so
  // orchestrating callers — endActiveSession, the inactivity auto-pause —
  // can tell whether the command actually succeeded.
  const stopTimerInstance = useCallback(async (instanceId: string): Promise<TaskSession | null> => {
    return measurePerformance('useSessionManagement.stopTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('stop_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer stopped');
        return updatedSession;
      } catch (err) {
        const errorMessage = errorText(err, 'Failed to stop timer');
        setError(errorMessage);
        showError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError, showSuccess]);

  const pauseTimerInstance = useCallback(async (instanceId: string): Promise<TaskSession | null> => {
    return measurePerformance('useSessionManagement.pauseTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('pause_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer paused');
        return updatedSession;
      } catch (err) {
        const errorMessage = errorText(err, 'Failed to pause timer');
        setError(errorMessage);
        showError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    });
  }, [updateLocalSession, showError, showSuccess]);

  const resumeTimerInstance = useCallback(async (instanceId: string): Promise<TaskSession | null> => {
    return measurePerformance('useSessionManagement.resumeTimerInstance', async () => {
      setIsLoading(true);
      setError(null);

      try {
        const updatedSession = await invoke<TaskSession>('resume_timer_instance', { instanceId });
        updateLocalSession(updatedSession);
        showSuccess('Timer resumed');
        return updatedSession;
      } catch (err) {
        const errorMessage = errorText(err, 'Failed to resume timer');
        setError(errorMessage);
        showError(errorMessage);
        return null;
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
        const errorMessage = errorText(err, 'Failed to delete timer');
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
        const errorMessage = errorText(err, 'Failed to update timer');
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
  // Set when a resume event arrives while the auto-pause IPC is still in
  // flight (the timers aren't paused yet, so the resume handler can't act);
  // the pause handler checks it once the pauses land and resumes immediately.
  const pendingResumeRef = useRef(false);
  useEffect(() => {
    const handlePauseInactivity = async (event: Event) => {
      const reason = (event as CustomEvent).detail?.reason;
      const currentActiveSession = sessionsRef.current.find(s => s.isActive);
      const timersToPause: TimerInstance[] = currentActiveSession
        ? currentActiveSession.timerInstances.filter(t => t.state === TimerState.running)
        : [];

      const remember = reason === 'inactivity';
      inactivityPausedIdsRef.current = remember ? timersToPause.map(t => t.id) : [];
      pendingResumeRef.current = false;

      if (timersToPause.length === 0) return;

      try {
        const pausedIds: string[] = [];
        for (const timer of timersToPause) {
          const paused = await pauseTimerInstance(timer.id);
          if (paused) pausedIds.push(timer.id);
        }
        if (remember) {
          // Keep only ids whose pause succeeded, preserving any pruning the
          // resume handler did while the pauses were in flight.
          inactivityPausedIdsRef.current = inactivityPausedIdsRef.current.filter(id =>
            pausedIds.includes(id)
          );
          // Activity returned while the pause IPC was in flight: resume the
          // timers we just paused instead of leaving them stranded.
          if (pendingResumeRef.current) {
            pendingResumeRef.current = false;
            const idsToResume = inactivityPausedIdsRef.current;
            inactivityPausedIdsRef.current = [];
            for (const id of idsToResume) {
              await resumeTimerInstance(id);
            }
          }
        }
        await loadSessions({ silent: true });
      } catch (err) {
        const errorMessage =
          errorText(err, 'Failed to pause inactive timers');
        showError(errorMessage);
      }
    };

    window.addEventListener('timer-pause-inactivity', handlePauseInactivity);
    return () => {
      window.removeEventListener('timer-pause-inactivity', handlePauseInactivity);
    };
  }, [pauseTimerInstance, resumeTimerInstance, loadSessions, showError]);

  // resumeOnActivity: when activity returns after an automatic inactivity
  // pause, useInactivityDetection dispatches this event (only when the
  // setting is enabled) and we resume the timers that pause suspended.
  useEffect(() => {
    const handleResumeActivity = async () => {
      const pausedIds = inactivityPausedIdsRef.current;
      if (pausedIds.length === 0) return;

      const currentActiveSession = sessionsRef.current.find(s => s.isActive);
      const timersToResume: TimerInstance[] = currentActiveSession
        ? currentActiveSession.timerInstances.filter(
            t => pausedIds.includes(t.id) && t.state === TimerState.paused
          )
        : [];

      // Ids not paused yet are an auto-pause still in flight (sessionsRef
      // updates post-commit, after the pause IPC lands). Keep them remembered
      // and flag the pause handler to resume them the moment it finishes —
      // clearing the list here would strand those timers paused forever.
      const stillPausing = pausedIds.filter(id => !timersToResume.some(t => t.id === id));
      inactivityPausedIdsRef.current = stillPausing;
      pendingResumeRef.current = stillPausing.length > 0;

      if (timersToResume.length === 0) return;

      try {
        for (const timer of timersToResume) {
          await resumeTimerInstance(timer.id);
        }
      } catch (err) {
        const errorMessage =
          errorText(err, 'Failed to resume timers after activity');
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
        const errorMessage = errorText(err, 'Failed to create session');
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
        const errorMessage = errorText(err, 'Failed to update session');
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
        const removedSession = sessionsRef.current.find(s => s.id === sessionId);

        await invoke('delete_session', { sessionId });

        setSessions(prev => prev.filter(s => s.id !== sessionId));

        if (activeSession?.id === sessionId) {
          setActiveSessionState(null);
        }
        // The shared active-timer slot must not outlive its session.
        if (activeTimer && removedSession?.timerInstances.some(i => i.id === activeTimer.id)) {
          setActiveTimer(null);
        }

        showSuccess('Session deleted successfully');
      } catch (err) {
        const errorMessage = errorText(err, 'Failed to delete session');
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    });
  }, [activeSession, activeTimer, setActiveTimer, showError, showSuccess]);

  const getSessionById = useCallback((sessionId: string): TaskSession | undefined => {
    return (sessions || []).find(s => s.id === sessionId);
  }, [sessions]);

  const getSessionsByTaskId = useCallback((taskId: string): TaskSession[] => {
    return (sessions || []).filter(s => s.taskId === taskId);
  }, [sessions]);

  const getActiveSession = useCallback((): TaskSession | null => {
    return activeSession;
  }, [activeSession]);

  // Returns whether the backend accepted the change, so callers like
  // endActiveSession don't report success after a failed deactivation.
  const setActiveSession = useCallback(async (session: TaskSession | null): Promise<boolean> => {
    return measurePerformance('useSessionManagement.setActiveSession', async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Deactivation finalizes the other sessions' running/paused timers
        // backend-side — capture what was running so the hand-off is
        // announced, not silent.
        const previousRunner = findRunningInstance(sessionsRef.current);

        const updatedSessions = await invoke<TaskSession[]>('set_active_session', { sessionId: session?.id });
        const normalized = (updatedSessions || []).map(normalizeSession);
        setSessions(normalized);
        setActiveSessionState(session ? normalized.find(s => s.id === session.id) || null : null);
        // Keep the shared active-timer slot in sync instead of waiting for
        // the debounced event reload (the inactivity dialog and active-entry
        // displays key off it).
        setActiveTimer(findRunningInstance(normalized)?.instance ?? null);

        if (session) {
          const taskName = session.taskName || 'Unknown Task';
          const stoppedElsewhere =
            previousRunner && previousRunner.session.id !== session.id
              ? ` — stopped the running timer for "${previousRunner.session.taskName}"`
              : '';
          showSuccess(`Activated session for "${taskName}"${stoppedElsewhere}`);
        }
        return true;
      } catch (err) {
        const errorMessage = errorText(err, 'Failed to set active session');
        setError(errorMessage);
        showError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    });
  }, [setActiveTimer, showError, showSuccess]);

    const endActiveSession = useCallback(async (): Promise<void> => {
        // Read through the ref so a stale closure can't miss a timer that
        // started after this callback was created.
        const sessionToEnd = sessionsRef.current.find(s => s.isActive) ?? activeSession;
        if (!sessionToEnd) return;
        setIsLoading(true);
        try {
            // Paused timers must be stopped too, or their tracked time is
            // never recorded and they stay paused in an inactive session.
            let failedStops = 0;
            for (const instance of sessionToEnd.timerInstances) {
                if (instance.state === TimerState.running || instance.state === TimerState.paused) {
                    const stopped = await stopTimerInstance(instance.id);
                    if (!stopped) failedStops++;
                }
            }
            if (failedStops > 0) {
                // Leave the session active so the timers stay reachable and
                // the user can retry — deactivating around them would strand
                // running timers where no control can reach them.
                showError('Session not ended: a timer could not be stopped.');
                return;
            }
            if (await setActiveSession(null)) {
                showSuccess('Session ended successfully.');
            }
        } catch (err) {
            const errorMessage = errorText(err, 'Failed to end session');
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
            const errorMessage = errorText(err, 'Failed to pause all timers');
            showError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [activeSession, pauseTimerInstance, showError, showSuccess]);

    const resumeAllTimersInActiveSession = useCallback(async (): Promise<void> => {
        if (!activeSession) return;
        setIsLoading(true);
        try {
            // Only one timer may run at a time (the backend enforces the same
            // invariant on resume as on start), so resume the most recently
            // paused timer rather than looping over all of them.
            const pausedTimers = activeSession.timerInstances.filter(t => t.state === TimerState.paused);
            const pausedAtMs = (t: TimerInstance) => (t.pausedAt ? new Date(t.pausedAt).getTime() : 0);
            const mostRecent = pausedTimers
                .slice()
                .sort((a, b) => pausedAtMs(b) - pausedAtMs(a))[0];
            if (mostRecent) await resumeTimerInstance(mostRecent.id);
        } catch (err) {
            const errorMessage = errorText(err, 'Failed to resume all timers');
            showError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [activeSession, resumeTimerInstance, showError]);

  // Let consumers dismiss a surfaced error (the provider outlives page
  // navigation, so errors no longer clear on remount).
  const clearError = useCallback(() => setError(null), []);

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
    clearError,
  };
}
