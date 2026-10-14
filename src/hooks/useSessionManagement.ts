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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  TaskSession,
  TimerInstance,
  UseSessionManagementReturn,
  TimerState,
  StartTaskResult,
  AddManualTimeInput,
} from '../types/timer';
import { formatDurationCompact } from '../utils/formatters';
import { useNotification } from '../contexts/NotificationContext';
import { errorMessage } from '../utils/errors';
import { useActiveTimer } from '../contexts/ActiveTimerContext';
import { useTauriEvent } from './useTauriEvent';
import { BACKEND_EVENTS } from '../constants/events';
import { formatShortDate } from '../utils/locale';

// Backend events that signal session data changed outside this hook's own
// calls (timer-instance changes, work-log imports that rewrite sessions, and
// task renames or moved timers)
const TIMER_INSTANCE_EVENTS = [
  BACKEND_EVENTS.TIMER_INSTANCE_STARTED,
  BACKEND_EVENTS.TIMER_INSTANCE_STOPPED,
  BACKEND_EVENTS.TIMER_INSTANCE_PAUSED,
  BACKEND_EVENTS.TIMER_INSTANCE_RESUMED,
  BACKEND_EVENTS.TIMER_INSTANCE_DELETED,
  BACKEND_EVENTS.WORK_LOGS_IMPORTED,
  BACKEND_EVENTS.SESSIONS_CHANGED,
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

export function useSessionManagement(): UseSessionManagementReturn {
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [activeSession, setActiveSessionState] = useState<TaskSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { showError, showSuccess, showInfo, showWarning } = useNotification();
  const { activeTimer, setActiveTimer } = useActiveTimer();

  // Current values for code that must read state synchronously between
  // renders: event handlers, the start-timer recovery loop (a closure over
  // `sessions` goes stale the moment a prior action updates the list), and
  // callbacks that would otherwise change identity on every timer tick.
  const sessionsRef = useRef<TaskSession[]>(sessions);
  const activeSessionRef = useRef<TaskSession | null>(activeSession);
  const activeTimerRef = useRef<TimerInstance | null>(activeTimer);
  useEffect(() => {
    sessionsRef.current = sessions;
    activeSessionRef.current = activeSession;
    activeTimerRef.current = activeTimer;
  }, [sessions, activeSession, activeTimer]);

  // Busy while any command is in flight (commands nest: ending a session
  // stops each of its timers).
  const pendingRef = useRef(0);
  const beginBusy = useCallback(() => {
    pendingRef.current += 1;
    setIsLoading(true);
  }, []);
  const endBusy = useCallback(() => {
    pendingRef.current = Math.max(0, pendingRef.current - 1);
    setIsLoading(pendingRef.current > 0);
  }, []);

  /**
   * Runs a backend command: busy while it runs, a success toast if asked for
   * (only for what the screen doesn't already show), and on failure the
   * backend's reason (or `fallback`) as an error toast. Resolves to the
   * command's result, or null when it failed.
   */
  const runCommand = useCallback(async <T,>(
    fallback: string,
    command: () => Promise<T>,
    success?: string | ((result: T) => string | null)
  ): Promise<T | null> => {
    beginBusy();
    try {
      const result = await command();
      const message = typeof success === 'function' ? success(result) : success;
      if (message) showSuccess(message, { category: 'timer' });
      return result;
    } catch (err) {
      showError(errorMessage(err, fallback), { category: 'timer' });
      return null;
    } finally {
      endBusy();
    }
  }, [beginBusy, endBusy, showError, showSuccess]);

  // Load sessions from backend. `silent` skips the loading flag so
  // event-driven refreshes don't flash loading UI.
  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) beginBusy();

    try {
      const loadedSessions = await invoke<TaskSession[]>('get_sessions');
      const normalizedSessions = (loadedSessions || []).map(normalizeSession);
      setSessions(normalizedSessions);
      setActiveSessionState(normalizedSessions.find(s => s.isActive) || null);
      setActiveTimer(findRunningInstance(normalizedSessions)?.instance ?? null);
      setHasLoaded(true);
    } catch (err) {
      // Keep the last-known-good sessions/activeSession/activeTimer: blanking
      // the list while the toolbar still shows an active session leaves the
      // UI inconsistent. Background refreshes also should not toast out of
      // nowhere. A failed load stays up until dismissed.
      if (!silent) {
        showError(errorMessage(err, 'Failed to load sessions'), { category: 'session', duration: null });
      }
    } finally {
      if (!silent) endBusy();
    }
  }, [beginBusy, endBusy, showError, setActiveTimer]);

  const updateLocalSession = useCallback((session: TaskSession) => {
    const normalized = normalizeSession(session);

    setSessions(prev => prev.map(s => (s.id === normalized.id ? normalized : s)));
    setActiveSessionState(currentActive =>
      currentActive && currentActive.id === normalized.id ? normalized : currentActive
    );

    const runningInstance = normalized.timerInstances.find(t => t.state === TimerState.running) || null;
    const current = activeTimerRef.current;
    if (runningInstance) {
      setActiveTimer(runningInstance);
    } else if (current && normalized.timerInstances.some(t => t.id === current.id)) {
      setActiveTimer(null);
    }
  }, [setActiveTimer]);

  const createTimerInstance = useCallback((sessionId: string): Promise<TimerInstance | null> =>
    runCommand('Failed to create timer instance', async () => {
      const newInstance = await invoke<TimerInstance>('create_timer_instance', { sessionId });
      await loadSessions({ silent: true }); // the session with its new instance
      return newInstance;
    }),
  [runCommand, loadSessions]);

  const startTimerInstance = useCallback(async (instanceId: string): Promise<void> => {
    // The backend refuses to start a timer in an inactive session or while
    // another timer runs. Recover automatically from each case (activate the
    // session / stop the other timer) and retry, at most once per recovery
    // type. Read sessions through the ref: under rapid successive starts a
    // closure over `sessions` holds a stale list and would stop the wrong
    // timer. Resolves to the task whose timer was stopped, if any.
    const handoff = await runCommand('Failed to start timer', async (): Promise<string | null> => {
      const maxAttempts = 3;
      let handoffTaskName: string | null = null;
      for (let attempt = 1; ; attempt++) {
        try {
          const updatedSession = await invoke<TaskSession>('start_timer_instance', { instanceId });
          updateLocalSession(updatedSession);
          return handoffTaskName;
        } catch (err) {
          const failure = errorMessage(err, '');

          if (attempt < maxAttempts && failure.includes('inactive session')) {
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

          if (attempt < maxAttempts && failure.includes('Another timer instance is already running')) {
            const running = findRunningInstance(sessionsRef.current, instanceId);
            if (running) {
              handoffTaskName = running.session.taskName;
              try {
                const stoppedSession = await invoke<TaskSession>('stop_timer_instance', {
                  instanceId: running.instance.id,
                });
                updateLocalSession(stoppedSession);
              } catch (stopErr) {
                // Already stopped between our read and the call (e.g. a
                // same-tick double start): the obstacle is gone, retry.
                if (!errorMessage(stopErr, '').includes('timer is not running')) throw stopErr;
              }
              continue;
            }
          }

          throw err;
        }
      }
    });
    // The hand-off must be explicit: the user asked to start this timer, not
    // to stop the other one. (A plain start shows on screen; no toast.)
    if (handoff) {
      showInfo(`Stopped the running timer for "${handoff}"`, { category: 'timer' });
    }
  }, [runCommand, updateLocalSession, setActiveTimer, showInfo]);

  // stop/pause/resume return the updated session (or null on failure) so
  // orchestrating callers like endActiveSession can tell whether the command
  // actually succeeded.
  // (No success toasts: the timer's state on screen says it.)
  const timerCommand = useCallback(
    (command: string, fallback: string) =>
      (instanceId: string): Promise<TaskSession | null> =>
        runCommand(fallback, async () => {
          const updatedSession = await invoke<TaskSession>(command, { instanceId });
          updateLocalSession(updatedSession);
          return updatedSession;
        }),
    [runCommand, updateLocalSession]
  );
  const stopTimerInstance = useMemo(
    () => timerCommand('stop_timer_instance', 'Failed to stop timer'),
    [timerCommand]
  );
  const pauseTimerInstance = useMemo(
    () => timerCommand('pause_timer_instance', 'Failed to pause timer'),
    [timerCommand]
  );
  const resumeTimerInstance = useMemo(
    () => timerCommand('resume_timer_instance', 'Failed to resume timer'),
    [timerCommand]
  );

  // Undo puts a deleted timer back where it was. The session may have gone
  // in the meantime; the backend says so.
  const restoreTimerInstance = useCallback(
    (sessionId: string, instance: TimerInstance, index: number) =>
      runCommand("Couldn't restore the timer", async () => {
        const session = await invoke<TaskSession>('restore_timer_instance', { sessionId, instance, index });
        updateLocalSession(session);
      }),
    [runCommand, updateLocalSession]
  );

  const deleteTimerInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    const owner = sessionsRef.current.find(s => s.timerInstances.some(i => i.id === instanceId));
    const index = owner?.timerInstances.findIndex(i => i.id === instanceId) ?? -1;
    const snapshot = owner && index >= 0 ? owner.timerInstances[index] : undefined;

    const done = await runCommand('Failed to delete timer', async () => {
      const updatedSession = await invoke<TaskSession>('delete_timer_instance', { instanceId });
      updateLocalSession(updatedSession);
      return true;
    });
    if (!done) return false;

    // A timer that never ran held no time: nothing to undo
    if (owner && snapshot && normalizeTimerInstance(snapshot).state === TimerState.stopped) {
      showInfo(`Deleted ${formatDurationCompact(snapshot.duration ?? 0)} from "${owner.taskName}"`, {
        category: 'timer',
        actions: [{ label: 'Undo', onClick: () => void restoreTimerInstance(owner.id, snapshot, index) }],
      });
    }
    return true;
  }, [runCommand, updateLocalSession, restoreTimerInstance, showInfo]);

  // Save an edit of a finished timer: its duration, and/or the task it
  // belongs to (moved with its time; it earns at that task's rate). Returns
  // the session the timer ends up in, or null when the save failed (the error
  // is shown).
  const editTimerEntry = useCallback((
    instanceId: string,
    edit: { updates?: Record<string, any>; moveTo?: { taskId: string; taskName: string } }
  ): Promise<string | null> =>
    runCommand('Failed to update timer', async () => {
      try {
        if (edit.updates) {
          await invoke('update_timer_instance', { instanceId, updates: edit.updates });
        }
        let sessionId =
          sessionsRef.current.find(s => s.timerInstances.some(i => i.id === instanceId))?.id ?? null;
        if (edit.moveTo) {
          sessionId = await invoke<string>('move_timer_instance', {
            instanceId,
            taskId: edit.moveTo.taskId,
            taskName: edit.moveTo.taskName,
          });
        }
        return sessionId;
      } finally {
        // A failed move after a saved duration still changed something
        await loadSessions({ silent: true });
      }
    }, () => (edit.moveTo ? `Moved to "${edit.moveTo.taskName}"` : null)),
  [runCommand, loadSessions]);

  // Initialize sessions on mount, and surface any startup load problems the
  // backend recorded (skipped/unreadable records in sessions.json).
  const loadWarningShownRef = useRef(false);
  useEffect(() => {
    loadSessions();

    if (!loadWarningShownRef.current) {
      loadWarningShownRef.current = true;
      invoke<string | null>('get_session_load_warning')
        .then(warning => {
          // Records were lost or skipped: stays up until dismissed
          if (warning) showWarning(warning, { category: 'session', duration: null, title: 'Some saved time could not be read' });
        })
        .catch(() => {
          // Older backends without this command: nothing to surface
        });
    }
  }, [loadSessions, showWarning]);

  // Refresh whenever the backend reports a timer-instance change. This keeps
  // any surface that mutates outside this hook (e.g. the system tray) in
  // sync. Bursts of events (a hand-off stops one timer and starts another)
  // collapse into one reload.
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useTauriEvent(TIMER_INSTANCE_EVENTS, () => {
    if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
    reloadTimeoutRef.current = setTimeout(() => {
      reloadTimeoutRef.current = null;
      void loadSessions({ silent: true });
    }, 300);
  });
  useEffect(() => () => {
    if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
  }, []);

  // The app's single start path (also the tray's): continue the task's active
  // session, or open a new one with a running timer. The backend announces
  // any timer it finalized for another task, so the hand-off isn't silent.
  const startTask = useCallback(async (taskId: string, taskName: string): Promise<StartTaskResult | null> => {
    const result = await runCommand('Failed to start the task', async () => {
      const started = await invoke<StartTaskResult>('start_task', { taskId, taskName });
      await loadSessions({ silent: true });
      return started;
    });
    // The timer shows on screen; say only what it doesn't: nothing changed,
    // or another task's timer was stopped for this one.
    if (result?.outcome === 'alreadyRunning') {
      showInfo(`"${taskName}" is already running`, { category: 'timer' });
    } else if (result?.stoppedTaskName) {
      const verb = result.outcome === 'resumed' ? 'Resumed' : 'Started';
      showInfo(`${verb} "${taskName}" — stopped the running timer for "${result.stoppedTaskName}"`, {
        category: 'timer',
      });
    }
    return result;
  }, [runCommand, loadSessions, showInfo]);

  // "Add time": a finished timer logged after the fact. Rejects with the
  // backend's reason (e.g. an overlap) so the dialog can show it in place.
  const addManualTime = useCallback(async (input: AddManualTimeInput): Promise<TaskSession> => {
    try {
      const session = await invoke<TaskSession>('add_manual_time', {
        taskId: input.taskId,
        taskName: input.taskName,
        startTime: input.startTime.toISOString(),
        durationMs: input.durationMs,
      });
      await loadSessions({ silent: true });
      const day = formatShortDate(input.startTime);
      showSuccess(`Added ${formatDurationCompact(input.durationMs)} to "${input.taskName}" on ${day}`);
      return session;
    } catch (err) {
      throw new Error(errorMessage(err, 'Failed to add the time entry'));
    }
  }, [loadSessions, showSuccess]);

  // Throws on failure: the caller (the session-notes move) retries next launch.
  const clearSessionNotes = useCallback(async (sessionIds: string[]): Promise<number> => {
    if (sessionIds.length === 0) return 0;
    const cleared = await invoke<number>('clear_session_notes', { sessionIds });
    if (cleared > 0) await loadSessions({ silent: true });
    return cleared;
  }, [loadSessions]);

  // Undo brings a deleted session back as history: inactive, any timer that
  // was running when it was deleted stopped at that moment.
  const restoreSession = useCallback(
    (snapshot: TaskSession) =>
      runCommand("Couldn't restore the session", async () => {
        const restored = normalizeSession(await invoke<TaskSession>('restore_session', { session: snapshot }));
        setSessions(prev => (prev.some(s => s.id === restored.id) ? prev : [...prev, restored]));
      }),
    [runCommand]
  );

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    const removed = await runCommand('Failed to delete session', async () => {
      const removedSession = sessionsRef.current.find(s => s.id === sessionId);
      // What was deleted, live timers stopped: what Undo puts back
      const snapshot = await invoke<TaskSession>('delete_session', { sessionId });

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setActiveSessionState(current => (current?.id === sessionId ? null : current));
      // The shared active-timer slot must not outlive its session.
      const current = activeTimerRef.current;
      if (current && removedSession?.timerInstances.some(i => i.id === current.id)) {
        setActiveTimer(null);
      }
      return snapshot;
    });
    if (!removed) return false;

    const timers = removed.timerInstances.length;
    const detail =
      timers > 0
        ? ` (${timers} timer${timers === 1 ? '' : 's'}, ${formatDurationCompact(removed.totalDuration ?? 0)})`
        : '';
    showInfo(`Deleted the "${removed.taskName}" session${detail}`, {
      category: 'session',
      actions: [{ label: 'Undo', onClick: () => void restoreSession(removed) }],
    });
    return true;
  }, [runCommand, setActiveTimer, restoreSession, showInfo]);

  // Returns whether the backend accepted the change, so callers like
  // endActiveSession don't report success after a failed deactivation.
  const setActiveSession = useCallback(async (session: TaskSession | null): Promise<boolean> => {
    // Deactivation finalizes the other sessions' running/paused timers
    // backend-side — capture what was running so the hand-off is announced,
    // not silent.
    const previousRunner = findRunningInstance(sessionsRef.current);
    const done = await runCommand('Failed to set active session', async () => {
      const updatedSessions = await invoke<TaskSession[]>('set_active_session', { sessionId: session?.id });
      const normalized = (updatedSessions || []).map(normalizeSession);
      setSessions(normalized);
      setActiveSessionState(session ? normalized.find(s => s.id === session.id) || null : null);
      // Keep the shared active-timer slot in sync instead of waiting for the
      // debounced event reload (active-entry displays key off it).
      setActiveTimer(findRunningInstance(normalized)?.instance ?? null);
      return true;
    });
    // Announce only a hand-off (activating finalized another task's timer)
    if (done && session && previousRunner && previousRunner.session.id !== session.id) {
      showInfo(`Stopped the running timer for "${previousRunner.session.taskName}"`, { category: 'session' });
    }
    return done === true;
  }, [runCommand, setActiveTimer, showInfo]);

  const endActiveSession = useCallback(async (): Promise<void> => {
    // Read through the ref so a stale closure can't miss a timer that
    // started after this callback was created.
    const sessionToEnd = sessionsRef.current.find(s => s.isActive) ?? activeSessionRef.current;
    if (!sessionToEnd) return;
    beginBusy();
    try {
      // Paused timers must be stopped too, or their tracked time is never
      // recorded and they stay paused in an inactive session.
      let failedStops = 0;
      for (const instance of sessionToEnd.timerInstances) {
        if (instance.state === TimerState.running || instance.state === TimerState.paused) {
          const stopped = await stopTimerInstance(instance.id);
          if (!stopped) failedStops++;
        }
      }
      if (failedStops > 0) {
        // Leave the session active so the timers stay reachable and the user
        // can retry — deactivating around them would strand running timers
        // where no control can reach them.
        showError('Session not ended: a timer could not be stopped.', { category: 'session' });
        return;
      }
      await setActiveSession(null);
    } finally {
      endBusy();
    }
  }, [beginBusy, endBusy, stopTimerInstance, setActiveSession, showError]);

  const pauseAllTimersInActiveSession = useCallback(async (): Promise<void> => {
    const session = activeSessionRef.current;
    if (!session) return;
    beginBusy();
    try {
      const runningTimers = session.timerInstances.filter(t => t.state === TimerState.running);
      for (const timer of runningTimers) {
        await pauseTimerInstance(timer.id);
      }
    } finally {
      endBusy();
    }
  }, [beginBusy, endBusy, pauseTimerInstance]);

  const resumeAllTimersInActiveSession = useCallback(async (): Promise<void> => {
    const session = activeSessionRef.current;
    if (!session) return;
    // Only one timer may run at a time (the backend enforces the same
    // invariant on resume as on start), so resume the most recently paused
    // timer rather than looping over all of them.
    const pausedAtMs = (t: TimerInstance) => (t.pausedAt ? new Date(t.pausedAt).getTime() : 0);
    const mostRecent = session.timerInstances
      .filter(t => t.state === TimerState.paused)
      .sort((a, b) => pausedAtMs(b) - pausedAtMs(a))[0];
    if (mostRecent) await resumeTimerInstance(mostRecent.id);
  }, [resumeTimerInstance]);

  return useMemo(() => ({
    sessions,
    activeSession,
    startTask,
    addManualTime,
    clearSessionNotes,
    deleteSession,
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
    editTimerEntry,
    isLoading,
    hasLoaded,
  }), [
    sessions, activeSession, startTask, addManualTime, clearSessionNotes, deleteSession,
    setActiveSession, endActiveSession, pauseAllTimersInActiveSession, resumeAllTimersInActiveSession,
    createTimerInstance, startTimerInstance, stopTimerInstance, pauseTimerInstance, resumeTimerInstance,
    deleteTimerInstance, editTimerEntry, isLoading, hasLoaded,
  ]);
}
