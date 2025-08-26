/**
 * Timer and Time Entry Related Types
 *
 * This file contains all types related to time tracking functionality,
 * including time entries, timer state, and time-related utilities.
 */

import { z } from 'zod';
import { Task } from './task';

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
}

// Zod validation schemas
export const TimeEntrySchema = z.object({
  id: z.string().min(1),
  taskName: z.string().min(1),
  taskId: z.string().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  duration: z.number().min(0).optional(),
  isRunning: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
});

export interface EarningsData {
  taskName: string;
  duration: number;
  hourlyRate?: number;
  earnings?: number;
}

// Props interfaces for timer-related components
export interface TimeEntryFormProps {
  onSave: (entry: TimeEntry) => void;
  predefinedTasks: Array<{
    id: string;
    name: string;
    hourlyRate?: number;
    createdAt: string;
    updatedAt: string;
  }>;
  activeEntry?: TimeEntry | null;
  onUpdateActiveEntry: (entry: TimeEntry | null) => void;
  onCreateNewTask: (taskName: string) => Promise<{
    id: string;
    name: string;
    hourlyRate?: number;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface CalendarViewProps {
  entries: TimeEntry[];
  tasks: Array<{
    id: string;
    name: string;
    hourlyRate?: number;
    createdAt: string;
    updatedAt: string;
  }>;
  onUpdateEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
}

// System tray related interfaces
export interface UseSystemTrayProps {
  activeEntry: TimeEntry | null;
  timeEntries: TimeEntry[];
  onStartTimer: (taskName: string, startTime: Date) => Promise<void>;
  onStopTimer: () => void;
  onShowNewTaskDialog: () => void;
}

// Timer rounding options
export type TimerRoundingOption = 'none' | 'up-5min' | 'up-15min' | 'up-30min';

export interface TimerSettings {
  roundingOption: TimerRoundingOption;
}

// Zod schema for timer settings
export const TimerSettingsSchema = z.object({
  roundingOption: z.enum(['none', 'up-5min', 'up-15min', 'up-30min'])
});

// Favorite tasks functionality
export interface FavoriteTasksSettings {
  favoriteTaskIds: string[];
  maxRecentTasks: number;
}

export interface TaskWithUsage extends Task {
  lastUsed?: Date;
  usageCount?: number;
  isFavorite?: boolean;
}

// Zod schema for favorite tasks settings
export const FavoriteTasksSettingsSchema = z.object({
  favoriteTaskIds: z.array(z.string()),
  maxRecentTasks: z.number().min(1).max(20).default(5)
});

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
  date: string; // YYYY-MM-DD format
  createdAt: string;
  updatedAt: string;
}

// Inactivity Detection Settings
export interface InactivitySettings {
  enabled: boolean;
  thresholdMinutes: number; // Minutes of inactivity before pausing
  showWarningBeforePause: boolean;
  warningDurationSeconds: number; // How long to show warning before auto-pause
  resumeOnActivity: boolean; // Whether to resume timer when activity detected
  testingMode?: boolean; // Enable shorter thresholds for development/testing
}

// Enhanced Timer Settings with inactivity detection
export interface EnhancedTimerSettings extends TimerSettings {
  inactivity: InactivitySettings;
}

// Timer Activity State for inactivity detection
export interface TimerActivityState {
  lastActivityTime: Date;
  isUserActive: boolean;
  inactivityWarningShown: boolean;
  pausedDueToInactivity: boolean;
}

// Session Statistics
export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  totalTimerInstances: number;
  totalDuration: number;
  averageSessionDuration: number;
  longestSession: number;
  shortestSession: number;
}

// ============================================================================
// ZOD VALIDATION SCHEMAS FOR NEW TYPES
// ============================================================================

export const TimerInstanceSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  duration: z.number().min(0).optional(),
  state: z.enum(['idle', 'running', 'paused', 'stopped']),
  isRunning: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  pausedAt: z.coerce.date().optional(),
  pausedDuration: z.number().min(0).optional(),
  resumedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const TaskSessionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  taskName: z.string().min(1),
  timerInstances: z.array(TimerInstanceSchema),
  totalDuration: z.number().min(0),
  notes: z.string().optional(),
  isActive: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const InactivitySettingsSchema = z.object({
  enabled: z.boolean(),
  thresholdMinutes: z.number().min(1).max(120), // 1 minute to 2 hours
  showWarningBeforePause: z.boolean(),
  warningDurationSeconds: z.number().min(5).max(60), // 5 seconds to 1 minute
  resumeOnActivity: z.boolean(),
  testingMode: z.boolean().optional()
});

export const EnhancedTimerSettingsSchema = z.object({
  roundingOption: z.enum(['none', 'up-5min', 'up-15min', 'up-30min']),
  inactivity: InactivitySettingsSchema
});

export const TimerActivityStateSchema = z.object({
  lastActivityTime: z.coerce.date(),
  isUserActive: z.boolean(),
  inactivityWarningShown: z.boolean(),
  pausedDueToInactivity: z.boolean()
});

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_INACTIVITY_SETTINGS: InactivitySettings = {
  enabled: true,
  thresholdMinutes: 15, // 15 minutes default
  showWarningBeforePause: true,
  warningDurationSeconds: 30, // 30 seconds warning
  resumeOnActivity: false, // Manual resume by default for safety
  testingMode: false // Testing mode disabled by default
};

export const DEFAULT_ENHANCED_TIMER_SETTINGS: EnhancedTimerSettings = {
  roundingOption: 'none',
  inactivity: DEFAULT_INACTIVITY_SETTINGS
};



// ============================================================================
// COMPONENT PROPS INTERFACES FOR SESSION SYSTEM
// ============================================================================

export interface SessionTimerToolbarProps {
  activeSession: TaskSession | null;
  predefinedTasks: Task[];
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession | null>;
  onEndSession: () => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onCreateTimerInstance: (sessionId: string) => Promise<TimerInstance | null>;
  onStartTimer: (instanceId: string) => Promise<void>;
  onStopTimer: (instanceId: string) => Promise<void>;
  onPauseTimer: (instanceId: string) => Promise<void>;
  onResumeTimer: (instanceId: string) => Promise<void>;
  onDeleteTimer?: (instanceId: string) => Promise<void>;
  onEditTimer?: (instance: TimerInstance) => void;
  onOpenSessionNotes?: (sessionId: string) => void;
  onOpenTimerNotes?: (instanceId: string) => void;
}

export interface SessionListProps {
  sessions: TaskSession[];
  tasks: Task[];
  onSelectSession: (session: TaskSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSession: (sessionId: string, updates: Partial<TaskSession>) => void;
  selectedSessionId?: string;
}

export interface TimerInstanceListProps {
  session: TaskSession;
  onStartTimer: (sessionId: string) => Promise<TimerInstance>;
  onStopTimer: (instanceId: string) => Promise<void>;
  onPauseTimer: (instanceId: string) => Promise<void>;
  onResumeTimer: (instanceId: string) => Promise<void>;
  onDeleteTimer: (instanceId: string) => Promise<void>;
  onUpdateTimerNotes: (instanceId: string, notes: string) => Promise<void>;
}

export interface InactivityWarningProps {
  remainingSeconds: number;
  onContinue: () => void;
  onPause: () => void;
  timerInstance: TimerInstance;
}

// ============================================================================
// HOOK RETURN TYPES FOR SESSION SYSTEM
// ============================================================================

export interface UseSessionManagementReturn {
  sessions: TaskSession[];
  activeSession: TaskSession | null;
  createSession: (taskId: string, taskName: string) => Promise<TaskSession | null>;
  updateSession: (sessionId: string, updates: Partial<TaskSession>) => Promise<TaskSession | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  getSessionById: (sessionId: string) => TaskSession | undefined;
  getSessionsByTaskId: (taskId: string) => TaskSession[];
  getActiveSession: () => TaskSession | null;
  setActiveSession: (session: TaskSession | null) => Promise<void>;
  endActiveSession: () => Promise<void>;
  pauseAllTimersInActiveSession: () => Promise<void>;
  resumeAllTimersInActiveSession: () => Promise<void>;
  // Timer instance methods
  createTimerInstance: (sessionId: string) => Promise<TimerInstance | null>;
  startTimerInstance: (instanceId: string) => Promise<void>;
  stopTimerInstance: (instanceId: string) => Promise<void>;
  pauseTimerInstance: (instanceId: string) => Promise<void>;
  resumeTimerInstance: (instanceId: string) => Promise<void>;
  deleteTimerInstance: (instanceId: string) => Promise<void>;
  updateTimerInstance: (instanceId: string, updates: Record<string, any>) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export interface UseTimerInstanceReturn {
  instances: TimerInstance[];
  activeInstance: TimerInstance | null;
  createInstance: (sessionId: string) => Promise<TimerInstance>;
  updateInstance: (instanceId: string, updates: Partial<TimerInstance>) => Promise<TimerInstance>;
  deleteInstance: (instanceId: string) => Promise<void>;
  startTimer: (instanceId: string) => Promise<void>;
  stopTimer: (instanceId: string) => Promise<void>;
  pauseTimer: (instanceId: string) => Promise<void>;
  resumeTimer: (instanceId: string) => Promise<void>;
  getInstanceById: (instanceId: string) => TimerInstance | undefined;
  getInstancesBySessionId: (sessionId: string) => TimerInstance[];
  isLoading: boolean;
  error: string | null;
}

export interface UseInactivityDetectionReturn {
  isActive: boolean;
  settings: InactivitySettings;
  activityState: TimerActivityState;
  updateSettings: (settings: Partial<InactivitySettings>) => Promise<void>;
  resetActivity: () => void;
  pauseDetection: () => void;
  resumeDetection: () => void;
  isWarningShown: boolean;
  warningTimeRemaining: number;
}

// ============================================================================
// ENHANCED SYSTEM TRAY PROPS
// ============================================================================

export interface UseEnhancedSystemTrayProps {
  activeSession: TaskSession | null;
  sessions: TaskSession[];
  tasks: Task[];
  onStartSession: (taskId: string, taskName: string) => Promise<TaskSession | null>;
  onCreateTimerInstance: (sessionId: string) => Promise<TimerInstance | null>;
  onStartTimer: (instanceId: string) => Promise<void>;
  onStopTimer: (instanceId: string) => Promise<void>;
  onShowNewTaskDialog: () => void;
}

// Timer Sync Event Type
export interface TimerSyncEvent<T> {
  payload: T;
}
