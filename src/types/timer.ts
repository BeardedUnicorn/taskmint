/**
 * Timer and Time Entry Related Types
 *
 * This file contains all types related to time tracking functionality,
 * including time entries, timer state, and time-related utilities.
 */

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

// Timer Instance - Individual timer within a session
export interface TimerInstance {
  id: string;
  sessionId: string; // Link to parent session
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  state: TimerState;
  /** @deprecated use state instead */
  isRunning?: boolean;
  /** @deprecated use state instead */
  isPaused?: boolean;
  pausedAt?: Date;
  pausedDuration?: number; // Total time paused in milliseconds
  resumedAt?: Date; // Last time the timer was resumed
  externalId?: string; // Site work-entry id for import-synthesized instances
  notes?: string; // Timer-level notes
  createdAt: string;
  updatedAt: string;
}

// Task Session - Groups multiple timer instances for a task
export interface TaskSession {
  id: string;
  taskId: string;
  taskName: string; // Cached for display
  timerInstances: TimerInstance[];
  totalDuration: number; // Sum of all timer instances in milliseconds
  notes?: string; // Session-level notes
  isActive: boolean; // Whether this session is currently active
  source?: string; // WORKLOG_IMPORT_SOURCE for sessions synthesized by an import
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

export type IdleChoice = 'discardResume' | 'keepResume' | 'stayPaused';

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

/**
 * Provenance marker on sessions created by "Add time". Must match
 * MANUAL_SOURCE in src-tauri/src/commands/sessions.rs.
 */
export const MANUAL_SOURCE = 'manual';

/** What start_task did: began a new timer, resumed a paused one, or nothing. */
export type StartTaskOutcome = 'started' | 'resumed' | 'alreadyRunning';

export interface StartTaskResult {
  outcome: StartTaskOutcome;
  instanceId?: string | null;
  /** Task whose live timer this start finalized, if any. */
  stoppedTaskName?: string | null;
}

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
   * Start (or continue) work on an existing task: continues the task's
   * active session, otherwise opens a new session with a running timer.
   */
  startTask: (taskId: string, taskName: string) => Promise<StartTaskResult | null>;
  /** Log a finished timer after the fact ("Add time"). Rejects with the reason. */
  addManualTime: (input: AddManualTimeInput) => Promise<TaskSession>;
  /** Clears sessions' old plain-text notes once they've moved to the notes store; returns how many had text. */
  clearSessionNotes: (sessionIds: string[]) => Promise<number>;
  deleteSession: (sessionId: string) => Promise<void>;
  setActiveSession: (session: TaskSession | null) => Promise<boolean>;
  endActiveSession: () => Promise<void>;
  pauseAllTimersInActiveSession: () => Promise<void>;
  resumeAllTimersInActiveSession: () => Promise<void>;
  // Timer instance methods
  createTimerInstance: (sessionId: string) => Promise<TimerInstance | null>;
  startTimerInstance: (instanceId: string) => Promise<void>;
  stopTimerInstance: (instanceId: string) => Promise<TaskSession | null>;
  pauseTimerInstance: (instanceId: string) => Promise<TaskSession | null>;
  resumeTimerInstance: (instanceId: string) => Promise<TaskSession | null>;
  deleteTimerInstance: (instanceId: string) => Promise<void>;
  /** Saves a finished timer's edit (duration and/or task); resolves to its session id, or null on failure. */
  editTimerEntry: (
    instanceId: string,
    edit: { updates?: Record<string, any>; moveTo?: { taskId: string; taskName: string } }
  ) => Promise<string | null>;
  isLoading: boolean;
  /** The saved sessions have been read at least once. */
  hasLoaded: boolean;
}
