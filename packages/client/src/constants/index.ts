/**
 * Application Constants
 */

// Local storage keys
export const STORAGE_KEYS = {
  PREDEFINED_TASKS: 'predefinedTasks',
  NOTE_TEMPLATES: 'noteTemplates',
  TASK_NOTES: 'taskNotes',
  DAILY_GOAL: 'dailyGoal',
  DAILY_GOAL_ACHIEVEMENTS: 'dailyGoalAchievements',
  FUNDS_RELEASE_DAYS: 'fundsReleaseDays',
  WITHDRAWALS: 'withdrawals',
  WITHDRAWAL_INTERVAL_DAYS: 'withdrawalIntervalDays',
  // Inactivity (idle) detection
  INACTIVITY_SETTINGS: 'inactivitySettings',
  // Error reporting (read synchronously before React mounts)
  ERROR_REPORTING_ENABLED: 'errorReportingEnabled',
  INSTALL_ID: 'installId',
} as const;

// Inactivity (idle) detection threshold limits
export const INACTIVITY_CONSTANTS = {
  MIN_THRESHOLD_MINUTES: 1,
  MAX_THRESHOLD_MINUTES: 120,
} as const;

// Session limits (the backend enforces the same cap)
export const SESSION_CONSTANTS = {
  MAX_TIMER_INSTANCES_PER_SESSION: 50,
} as const;
