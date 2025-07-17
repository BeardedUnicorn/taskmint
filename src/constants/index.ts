/**
 * Application Constants
 *
 * This file contains all application-wide constants, configuration values,
 * and static data used throughout the application.
 */

// Tab indices for navigation
export const TAB_INDICES = {
  DAILY_TIME_ENTRIES: 0,
  TASK_MANAGEMENT: 1,
  NOTE_TEMPLATES: 2,
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  TIME_ENTRIES: 'timeEntries',
  PREDEFINED_TASKS: 'predefinedTasks',
  NOTE_TEMPLATES: 'noteTemplates',
  TASK_NOTES: 'taskNotes',
  TIMER_SETTINGS: 'timerSettings',
  FAVORITE_TASKS: 'favoriteTasks',
  DAILY_GOAL: 'dailyGoal',
  DAILY_GOAL_ACHIEVEMENTS: 'dailyGoalAchievements',
  FUNDS_RELEASE_DAYS: 'fundsReleaseDays',
  USER_SUBSCRIPTION: 'userSubscription',
  FEATURE_OVERRIDES: 'featureOverrides',
  TASK_LIMIT_OVERRIDE: 'taskLimitOverride',
  // New session-based storage keys
  TASK_SESSIONS: 'taskSessions',
  TIMER_INSTANCES: 'timerInstances',
  ENHANCED_TIMER_SETTINGS: 'enhancedTimerSettings',
  INACTIVITY_SETTINGS: 'inactivitySettings',
  TIMER_ACTIVITY_STATE: 'timerActivityState',
} as const;

// Time formatting constants
export const TIME_FORMATS = {
  DISPLAY: 'HH:mm:ss',
  DATE_ONLY: 'YYYY-MM-DD',
  DATETIME_LOCAL: 'YYYY-MM-DDTHH:mm',
  ISO_STRING: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
} as const;

// Inactivity detection constants
export const INACTIVITY_CONSTANTS = {
  MIN_THRESHOLD_MINUTES: 1,
  MAX_THRESHOLD_MINUTES: 120,
  DEFAULT_THRESHOLD_MINUTES: 15,
  MIN_WARNING_SECONDS: 5,
  MAX_WARNING_SECONDS: 60,
  DEFAULT_WARNING_SECONDS: 30,
  ACTIVITY_CHECK_INTERVAL_MS: 1000, // Check every second
  ACTIVITY_EVENTS: ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'] as const,
} as const;

// Session management constants
export const SESSION_CONSTANTS = {
  MAX_TIMER_INSTANCES_PER_SESSION: 50,
  MAX_SESSION_NAME_LENGTH: 100,
  MAX_SESSION_NOTES_LENGTH: 1000,
  MAX_TIMER_NOTES_LENGTH: 500,
} as const;

// Timer update intervals (in milliseconds)
export const TIMER_INTERVALS = {
  UI_UPDATE: 1000, // 1 second
  TRAY_UPDATE: 1000, // 1 second
} as const;

// Default values
export const DEFAULTS = {
  HOURLY_RATE: 0,
  TASK_NAME: '',
  TIMER_DURATION: 0,
} as const;

// Validation constants
export const VALIDATION = {
  MIN_TASK_NAME_LENGTH: 1,
  MAX_TASK_NAME_LENGTH: 100,
  MIN_HOURLY_RATE: 0,
  MAX_HOURLY_RATE: 1000,
} as const;

// UI constants
export const UI = {
  SIDEBAR_WIDTH: 400,
  MIN_WINDOW_WIDTH: 800,
  MIN_WINDOW_HEIGHT: 500,
  DEFAULT_WINDOW_WIDTH: 1620,
  DEFAULT_WINDOW_HEIGHT: 1000,
} as const;

// Date filter options
export const DATE_FILTERS = {
  ALL: 'all',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  INVALID_TIME_FORMAT: 'Invalid time format. Please use HH:MM:SS format.',
  TASK_NAME_REQUIRED: 'Task name is required.',
  INVALID_HOURLY_RATE: 'Hourly rate must be a valid number.',
  END_TIME_BEFORE_START: 'End time must be after start time.',
  FAILED_TO_SAVE: 'Failed to save data. Please try again.',
  FAILED_TO_LOAD: 'Failed to load data. Please refresh the page.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  TASK_CREATED: 'Task created successfully.',
  TASK_UPDATED: 'Task updated successfully.',
  TASK_DELETED: 'Task deleted successfully.',
  TIMER_STARTED: 'Timer started successfully.',
  TIMER_STOPPED: 'Timer stopped successfully.',
  DATA_IMPORTED: 'Data imported successfully.',
  DATA_EXPORTED: 'Data exported successfully.',
} as const;
