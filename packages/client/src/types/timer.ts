/**
 * Timer and Time Entry Related Types
 *
 * This file contains all types related to time tracking functionality,
 * including time entries, timer state, and time-related utilities.
 */

import type { ApplyIdleChoiceArgs, StartTaskResult, TaskChoice, TimerTask } from '@taskmint/contracts';

export type { StartTaskResult, TaskChoice, TimerTask };

// Timer state machine
export enum TimerState {
  idle = 'idle',
  running = 'running',
  paused = 'paused',
  stopped = 'stopped',
}

export interface TimeEntry {
  id: string;
  taskName: string;
  taskId?: string; // Optional link to predefined task
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  isRunning: boolean;
  date: string; // YYYY-MM-DD format
  hourlyRate?: number | null; // The session's rate (see TaskSession.hourlyRate)
  source?: string; // The session's source (manual / imported); absent for tracked time
}

// ============================================================================
// NEW SESSION-BASED TIMER SYSTEM
// ============================================================================

// Timer Instance - Individual timer within a session. The backend sends a
// TimerInstance from @taskmint/contracts; the client adds `state`. Times are
// RFC 3339 strings, as sent.
export interface TimerInstance {
  id: string;
  sessionId: string; // Link to parent session
  startTime: string;
  endTime?: string | null;
  duration?: number | null; // in milliseconds
  state: TimerState;
  /** @deprecated use state instead */
  isRunning?: boolean;
  /** @deprecated use state instead */
  isPaused?: boolean;
  pausedAt?: string | null;
  pausedDuration?: number | null; // Total time paused in milliseconds
  resumedAt?: string | null; // Last time the timer was resumed
  externalId?: string | null; // Site work-entry id for import-synthesized instances
  /**
   * Its own task and rate: another task's, or its session's own at a rate set
   * after the session opened. Absent: the session's task at the session's
   * rate. Read through instanceTaskId / instanceTaskName.
   */
  task?: TimerTask | null;
  notes?: string | null; // Timer-level notes
  createdAt: string;
  updatedAt: string;
}

// Task Session - A stretch of work: its timers, each on a task. taskId is the
// task it was opened for; a timer on another task says so itself. (The
// backend's TaskSession, with its instances' states.)
export interface TaskSession {
  id: string;
  taskId: string;
  taskName: string; // Cached for display
  timerInstances: TimerInstance[];
  totalDuration: number; // Sum of all timer instances in milliseconds
  notes?: string | null; // Session-level notes
  isActive: boolean; // Whether this session is currently active
  source?: string | null; // WORKLOG_IMPORT_SOURCE for sessions synthesized by an import
  /**
   * The task's hourly rate when the session started (for imports, the rate
   * the site's pay implies), so later rate changes don't rewrite past
   * earnings. Missing on sessions from older builds until the backend fills
   * it in from the task.
   */
  hourlyRate?: number | null;
  date: string; // YYYY-MM-DD format
  createdAt: string;
  updatedAt: string;
}

// Inactivity (idle) detection settings. Detection itself runs in the
// backend on the system idle time; these are mirrored to it via
// set_idle_settings. Settings saved by older builds carry extra keys
// (warning, auto-resume, testing mode) that are ignored.
export interface InactivitySettings {
  enabled: boolean;
  thresholdMinutes: number; // Minutes without keyboard/mouse input before pausing
  /** Remind after a timer has run this many hours straight (0 = off); works with detection off too. */
  longRunHours: number;
}

/** The backend's pending "you were away" question (get_idle_pause / idle-returned). */
export interface IdlePause {
  instanceId: string;
  taskName: string;
  idleSince: string;
  returned: boolean;
  awayMs: number;
}

export type IdleChoice = ApplyIdleChoiceArgs['choice'];

// ============================================================================
// DEFAULT VALUES
// ============================================================================

// Off by default: the user opts in from Settings. (The first, in-window
// detector paused timers while work happened in other apps; installs from
// then were switched off once and keep the user's later choice.)
export const DEFAULT_INACTIVITY_SETTINGS: InactivitySettings = {
  enabled: false,
  thresholdMinutes: 15,
  longRunHours: 4,
};

// ============================================================================
// HOOK RETURN TYPES FOR SESSION SYSTEM
// ============================================================================

/** Provenance marker on sessions created by "Add time". */
export { MANUAL_SOURCE } from '@taskmint/contracts';

export interface AddManualTimeInput {
  taskId: string;
  taskName: string;
  startTime: Date;
  durationMs: number;
}

export interface UseSessionManagementReturn {
  sessions: TaskSession[];
  activeSession: TaskSession | null;
  /**
   * Start (or continue) work on an existing task: it joins the active
   * session (resuming the task's paused timer or starting a new one, and
   * stopping whatever is running), otherwise a new session opens with a
   * running timer.
   */
  startTask: (taskId: string, taskName: string) => Promise<StartTaskResult | null>;
  /** Log a finished timer after the fact ("Add time"). Rejects with the reason. */
  addManualTime: (input: AddManualTimeInput) => Promise<TaskSession>;
  /** Resolves to whether it was deleted (an Undo toast follows). */
  deleteSession: (sessionId: string) => Promise<boolean>;
  setActiveSession: (session: TaskSession | null) => Promise<boolean>;
  endActiveSession: () => Promise<void>;
  pauseAllTimersInActiveSession: () => Promise<void>;
  resumeAllTimersInActiveSession: () => Promise<void>;
  // Timer instance methods
  /** A new idle timer, for `task` when given, else for the session's own task. */
  createTimerInstance: (sessionId: string, task?: TaskChoice) => Promise<TimerInstance | null>;
  startTimerInstance: (instanceId: string) => Promise<void>;
  stopTimerInstance: (instanceId: string) => Promise<TaskSession | null>;
  pauseTimerInstance: (instanceId: string) => Promise<TaskSession | null>;
  resumeTimerInstance: (instanceId: string) => Promise<TaskSession | null>;
  /** Resolves to whether it was deleted (a stopped timer gets an Undo toast). */
  deleteTimerInstance: (instanceId: string) => Promise<boolean>;
  /** Saves a finished timer's edit (duration and/or task); resolves to its session id, or null on failure. */
  editTimerEntry: (
    instanceId: string,
    edit: { updates?: Record<string, any>; moveTo?: { taskId: string; taskName: string } }
  ) => Promise<string | null>;
  isLoading: boolean;
  /** The saved sessions have been read at least once. */
  hasLoaded: boolean;
}
