/**
 * Application Constants
 */

// Local storage keys
export const STORAGE_KEYS = {
  PREDEFINED_TASKS: 'predefinedTasks',
  NOTE_TEMPLATES: 'noteTemplates',
  TASK_NOTES: 'taskNotes',
  FAVORITE_TASKS: 'favoriteTasks',
  DAILY_GOAL: 'dailyGoal',
  DAILY_GOAL_ACHIEVEMENTS: 'dailyGoalAchievements',
  FUNDS_RELEASE_DAYS: 'fundsReleaseDays',
  WITHDRAWALS: 'withdrawals',
  WITHDRAWAL_INTERVAL_DAYS: 'withdrawalIntervalDays',
  // Session-based storage keys (session data itself lives in the Rust
  // sessions.json store, not localStorage). ENHANCED_TIMER_SETTINGS is a
  // legacy blob, read only to seed INACTIVITY_SETTINGS on older installs.
  ENHANCED_TIMER_SETTINGS: 'enhancedTimerSettings',
  INACTIVITY_SETTINGS: 'inactivitySettings',
  // Set once the off-by-default migration has run (see useEnhancedTimerSettings)
  INACTIVITY_DEFAULT_OFF_APPLIED: 'inactivityDefaultOffApplied',
  // Error reporting (read synchronously before React mounts)
  ERROR_REPORTING_ENABLED: 'errorReportingEnabled',
  INSTALL_ID: 'installId',
  // The settings that change the numbers: a record (types/accountSettings).
  // FUNDS_RELEASE_DAYS and WITHDRAWAL_INTERVAL_DAYS are where each device
  // kept them before; services/localAccountSettings moves them in once.
  ACCOUNT_SETTINGS: 'accountSettings',
  // Device settings a backup carries a copy of (utils/deviceSettings);
  // ThemeContext reads THEME_MODE by its literal name
  THEME_MODE: 'theme-mode',
  BACKUP_CONFIG: 'automaticBackupConfig',
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
