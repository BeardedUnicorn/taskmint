/**
 * Backend event names, mirrored from the `events` module of
 * crates/taskmint-core/src/contract.rs (a test checks the two lists agree).
 */
export const BACKEND_EVENTS = {
  TIMER_INSTANCE_STARTED: 'timer-instance-started',
  TIMER_INSTANCE_STOPPED: 'timer-instance-stopped',
  TIMER_INSTANCE_PAUSED: 'timer-instance-paused',
  TIMER_INSTANCE_RESUMED: 'timer-instance-resumed',
  TIMER_INSTANCE_DELETED: 'timer-instance-deleted',
  SESSIONS_CHANGED: 'sessions-changed',
  WORK_LOGS_IMPORTED: 'work-logs-imported',
  WORK_LOG_PAYLOAD_CAPTURED: 'work-log-payload-captured',
  IDLE_RETURNED: 'idle-returned',
  IDLE_RESOLVED: 'idle-resolved',
  SHOW_START_TASK_DIALOG: 'show-start-task-dialog',
  NOTIFICATION_POSTED: 'notification-posted',
} as const;
