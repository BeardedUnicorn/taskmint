//! Every value a client depends on by its exact spelling: the error messages
//! the frontend matches, event names, record keys, wire enum values, and the
//! capture endpoint the browser extension calls. Renaming one breaks the
//! frontend or the extension without a compile error, so they live here, in
//! one place, with tests pinning them.

// ============================================================================
// ERRORS THE FRONTEND MATCHES
// ============================================================================

/// useSessionManagement's start recovery matches "inactive session" and
/// re-activates the session before retrying.
pub const ERR_START_INACTIVE_SESSION: &str = "Cannot start timer for inactive session";
pub const ERR_RESUME_INACTIVE_SESSION: &str = "Cannot resume timer for inactive session";
/// Matched whole by the start recovery, which then stops the other timer.
pub const ERR_ANOTHER_TIMER_RUNNING: &str = "Another timer instance is already running";
/// The start recovery treats "timer is not running" from its stop as done
/// (the timer stopped between its read and the call).
pub const ERR_STOP_NOT_RUNNING: &str = "Cannot stop timer: timer is not running";
pub const ERR_PAUSE_NOT_RUNNING: &str = "Cannot pause timer: timer is not running";
/// A dismissed save dialog. The desktop shell's files platform
/// (apps/desktop/src/tauriBackend.ts) matches it whole, so a cancelled export
/// stays quiet.
pub const EXPORT_CANCELLED: &str = "Export cancelled by user";
/// A dismissed open dialog; matched whole there too (IMPORT_CANCELLED).
pub const IMPORT_CANCELLED: &str = "Import cancelled by user";
/// Start of the error for an import file that isn't JSON (the parser's
/// message follows); useDataBackup matches "Invalid JSON".
pub const INVALID_JSON_FILE: &str = "Invalid JSON file";

/// A record saved with a `baseRevision` that's no longer its revision: it
/// was changed somewhere else (another tab or device) since the client read
/// it. The client reads it again rather than overwrite that change.
pub const ERR_RECORD_CONFLICT: &str =
    "This was changed on another device. Reload to see the latest.";

/// The parts of those errors the frontend looks for (the cancelled ones it
/// matches whole).
pub const PART_INACTIVE_SESSION: &str = "inactive session";
pub const PART_ANOTHER_TIMER_RUNNING: &str = "Another timer instance is already running";
pub const PART_NOT_RUNNING: &str = "timer is not running";
pub const PART_INVALID_JSON: &str = "Invalid JSON";

// ============================================================================
// SESSIONS
// ============================================================================

/// `source` of sessions synthesized from imported work-log entries
/// (WORKLOG_IMPORT_SOURCE in packages/client/src/types/workLog.ts).
pub const WORKLOG_IMPORT_SOURCE: &str = "worklog-import";
/// `source` of sessions created by "Add time" (MANUAL_SOURCE in
/// packages/client/src/types/timer.ts).
pub const MANUAL_SOURCE: &str = "manual";
/// Most timer instances one session may hold.
pub const MAX_TIMER_INSTANCES_PER_SESSION: usize = 50;

/// What start_task reports (StartTaskOutcome in
/// packages/client/src/types/timer.ts).
pub const START_OUTCOME_STARTED: &str = "started";
pub const START_OUTCOME_RESUMED: &str = "resumed";
pub const START_OUTCOME_ALREADY_RUNNING: &str = "alreadyRunning";

/// The answers to "you were away" that resolve_idle_pause accepts.
pub const IDLE_CHOICE_DISCARD_RESUME: &str = "discardResume";
pub const IDLE_CHOICE_KEEP_RESUME: &str = "keepResume";
pub const IDLE_CHOICE_STAY_PAUSED: &str = "stayPaused";

// ============================================================================
// RECORDS
// ============================================================================

/// The record holding the task list. Hosts read the tasks from it (the tray,
/// hourly rates, and names that follow a rename).
pub const TASKS_RECORD_KEY: &str = "predefinedTasks";

/// The frontend's records (its STORAGE_KEYS names; APP_RECORD_KEYS in
/// packages/client/src/services/appRecords.ts).
pub const APP_RECORD_KEYS: [&str; 5] = [
    TASKS_RECORD_KEY,
    "taskNotes",
    "noteTemplates",
    "dailyGoal",
    "dailyGoalAchievements",
];

// ============================================================================
// THE SERVER'S API
// ============================================================================

/// The IANA time zone a web client is in (`Intl` reads it). The server dates
/// that request's sessions in it, falling back to the account's zone.
pub const TIME_ZONE_HEADER: &str = "X-TaskMint-TZ";

// ============================================================================
// BROWSER CAPTURE
// ============================================================================

/// The desktop app's localhost capture server.
pub const CAPTURE_SERVER_PORT: u16 = 43117;
/// Where the extension POSTs a captured payload.
pub const CAPTURE_PATH: &str = "/api/work-log-payload";
/// The extension's "is TaskMint running" probe.
pub const HEALTH_PATH: &str = "/api/health";
/// Header every capture POST must carry. A web page can't add it without a
/// preflight, which only the extension's origin passes.
pub const CAPTURE_HEADER: &str = "X-TaskMint-Capture";
/// The TaskMint capture extension. Its ID is fixed by the public `key` in
/// apps/extension/manifest.json; any other extension is refused.
pub const CAPTURE_EXTENSION_ORIGIN: &str = "chrome-extension://akokpjpnondkhammgcndnffildbbapga";
/// The error for a capture whose payload isn't a work-log list. The capture
/// endpoints answer it with a 400 rather than a 500.
pub const ERR_UNEXPECTED_PAYLOAD_SHAPE: &str = "unexpected payload shape";
/// Largest capture payload accepted.
pub const MAX_CAPTURE_BODY_BYTES: usize = 8 * 1024 * 1024;
/// Deep-link payloads ride in a URL, bounded by Windows' ~32K command-line
/// limit; the extension enforces the same ceiling before firing the link.
pub const MAX_ENCODED_LINK_BYTES: usize = 64 * 1024;

/// taskmint://import-worklogs?v=1&d=<base64url(gzip(json))>
pub const DEEP_LINK_SCHEME: &str = "taskmint";
pub const DEEP_LINK_IMPORT_WORKLOGS: &str = "import-worklogs";
pub const DEEP_LINK_PAYLOAD_PARAM: &str = "d";
/// taskmint://capture-pending: launch or focus only; the extension delivers
/// the payload over localhost once the app is up.
pub const DEEP_LINK_CAPTURE_PENDING: &str = "capture-pending";

// ============================================================================
// EVENTS
// ============================================================================

/// Events the backend sends the frontend, mirrored in
/// packages/client/src/constants/events.ts (a frontend test reads this module
/// and checks the two lists agree).
pub mod events {
    pub const TIMER_INSTANCE_STARTED: &str = "timer-instance-started";
    pub const TIMER_INSTANCE_STOPPED: &str = "timer-instance-stopped";
    pub const TIMER_INSTANCE_PAUSED: &str = "timer-instance-paused";
    pub const TIMER_INSTANCE_RESUMED: &str = "timer-instance-resumed";
    pub const TIMER_INSTANCE_DELETED: &str = "timer-instance-deleted";
    /// Sessions changed outside a timer action (a task rename, a moved timer, a
    /// restore); the frontend reloads its sessions.
    pub const SESSIONS_CHANGED: &str = "sessions-changed";
    pub const WORK_LOGS_IMPORTED: &str = "work-logs-imported";
    pub const WORK_LOG_PAYLOAD_CAPTURED: &str = "work-log-payload-captured";
    /// A record was saved: `{ key, revision }`. Other tabs and devices read
    /// it again.
    pub const APP_RECORDS_CHANGED: &str = "app-records-changed";
    /// The server's event stream may have missed events (it fell behind, or
    /// the data was reset): the client reads everything again.
    pub const RESYNC: &str = "resync";
    pub const IDLE_RETURNED: &str = "idle-returned";
    pub const IDLE_RESOLVED: &str = "idle-resolved";
    pub const SHOW_START_TASK_DIALOG: &str = "show-start-task-dialog";
    /// A notification the backend showed itself (long-run, idle pause), for the
    /// frontend's notification history.
    pub const NOTIFICATION_POSTED: &str = "notification-posted";
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend matches these messages (useSessionManagement's start
    /// recovery, the desktop shell's quiet cancel, useDataBackup's invalid
    /// file); changing one breaks it silently.
    #[test]
    fn frontend_matched_error_strings_stay_verbatim() {
        assert_eq!(
            [
                ERR_START_INACTIVE_SESSION,
                ERR_RESUME_INACTIVE_SESSION,
                ERR_ANOTHER_TIMER_RUNNING,
                ERR_STOP_NOT_RUNNING,
                ERR_PAUSE_NOT_RUNNING,
                EXPORT_CANCELLED,
                IMPORT_CANCELLED,
                INVALID_JSON_FILE,
                ERR_RECORD_CONFLICT,
            ],
            [
                "Cannot start timer for inactive session",
                "Cannot resume timer for inactive session",
                "Another timer instance is already running",
                "Cannot stop timer: timer is not running",
                "Cannot pause timer: timer is not running",
                "Export cancelled by user",
                "Import cancelled by user",
                "Invalid JSON file",
                "This was changed on another device. Reload to see the latest.",
            ]
        );
    }

    #[test]
    fn each_matched_part_is_in_the_errors_it_recovers_from() {
        assert!(ERR_START_INACTIVE_SESSION.contains(PART_INACTIVE_SESSION));
        assert!(ERR_RESUME_INACTIVE_SESSION.contains(PART_INACTIVE_SESSION));
        assert!(ERR_ANOTHER_TIMER_RUNNING.contains(PART_ANOTHER_TIMER_RUNNING));
        assert!(ERR_STOP_NOT_RUNNING.contains(PART_NOT_RUNNING));
        assert!(ERR_PAUSE_NOT_RUNNING.contains(PART_NOT_RUNNING));
        assert!(INVALID_JSON_FILE.contains(PART_INVALID_JSON));
    }

    #[test]
    fn wire_values_keep_their_spelling() {
        assert_eq!(WORKLOG_IMPORT_SOURCE, "worklog-import");
        assert_eq!(MANUAL_SOURCE, "manual");
        assert_eq!(MAX_TIMER_INSTANCES_PER_SESSION, 50);
        assert_eq!(
            [
                START_OUTCOME_STARTED,
                START_OUTCOME_RESUMED,
                START_OUTCOME_ALREADY_RUNNING
            ],
            ["started", "resumed", "alreadyRunning"]
        );
        assert_eq!(
            [
                IDLE_CHOICE_DISCARD_RESUME,
                IDLE_CHOICE_KEEP_RESUME,
                IDLE_CHOICE_STAY_PAUSED
            ],
            ["discardResume", "keepResume", "stayPaused"]
        );
        assert_eq!(CAPTURE_SERVER_PORT, 43117);
        assert_eq!(CAPTURE_PATH, "/api/work-log-payload");
        assert_eq!(CAPTURE_HEADER, "X-TaskMint-Capture");
        assert_eq!(ERR_UNEXPECTED_PAYLOAD_SHAPE, "unexpected payload shape");
        assert_eq!(TASKS_RECORD_KEY, "predefinedTasks");
        assert_eq!(DEEP_LINK_SCHEME, "taskmint");
        assert_eq!(TIME_ZONE_HEADER, "X-TaskMint-TZ");
        assert_eq!(events::APP_RECORDS_CHANGED, "app-records-changed");
        assert_eq!(events::RESYNC, "resync");
    }
}
