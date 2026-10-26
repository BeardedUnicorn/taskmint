// Application state management

use crate::tray::TrayLiveKey;
use std::sync::{Arc, Mutex};
use taskmint_core::idle::IdleState;
use taskmint_core::model::{
    CaptureServerStatus, PendingCapture, ProjectTaskMapping, Task, TaskSession, WorkLogEntry,
};
use taskmint_core::notifications::NotificationPrefs;

/// Run `f` on the value behind `mutex`; a poisoned lock is an error naming
/// `what`.
fn with_lock<T, R>(mutex: &Mutex<T>, what: &str, f: impl FnOnce(&mut T) -> R) -> Result<R, String> {
    let mut guard = mutex
        .lock()
        .map_err(|e| format!("Failed to lock {}: {}", what, e))?;
    Ok(f(&mut guard))
}

/// A read accessor and a write accessor for one shared field.
macro_rules! accessors {
    ($read:ident, $write:ident, $field:ident, $ty:ty, $what:literal) => {
        pub fn $read<T, F>(&self, f: F) -> Result<T, String>
        where
            F: FnOnce(&$ty) -> T,
        {
            with_lock(&self.$field, $what, |value| f(value))
        }

        pub fn $write<T, F>(&self, f: F) -> Result<T, String>
        where
            F: FnOnce(&mut $ty) -> T,
        {
            with_lock(&self.$field, $what, f)
        }
    };
}

// Imported work-log ledger + remembered project→task mappings, persisted
// together in worklogs.json.
#[derive(Default)]
pub struct WorkLogStore {
    pub entries: Vec<WorkLogEntry>,
    pub mappings: Vec<ProjectTaskMapping>,
}

// Type aliases for shared state
pub type SharedTrayRendered = Arc<Mutex<Option<TrayLiveKey>>>;
pub type SharedTasks = Arc<Mutex<Vec<Task>>>;
pub type SharedTaskSessions = Arc<Mutex<Vec<TaskSession>>>;
pub type SharedWorkLogs = Arc<Mutex<WorkLogStore>>;
pub type SharedPendingCapture = Arc<Mutex<Option<PendingCapture>>>;
pub type SharedCaptureServerStatus = Arc<Mutex<CaptureServerStatus>>;
pub type SharedTrayIcon = Arc<Mutex<Option<tauri::tray::TrayIcon>>>;
pub type SharedLoadWarning = Arc<Mutex<Option<String>>>;
pub type SharedIdleState = Arc<Mutex<IdleState>>;

// Main application state container
#[derive(Clone)]
pub struct AppState {
    pub tasks: SharedTasks,
    pub task_sessions: SharedTaskSessions,
    pub work_logs: SharedWorkLogs,
    // Latest raw payload delivered by the browser extension (localhost POST
    // or taskmint:// deep link); cleared by take_pending_work_log_capture.
    pub pending_work_log_capture: SharedPendingCapture,
    pub capture_server_status: SharedCaptureServerStatus,
    pub tray_icon: SharedTrayIcon,
    // The live timer the tray menu was last built for (None = idle), so the
    // tray rebuilds only when it changes.
    pub tray_rendered: SharedTrayRendered,
    // Set once at startup when the sessions store could not be fully read;
    // surfaced to the frontend via get_session_load_warning.
    pub session_load_warning: SharedLoadWarning,
    // Same, for the work-log store; surfaced via get_work_logs.
    pub work_log_load_warning: SharedLoadWarning,
    // Idle-detection settings (mirrored from the app) and the pending
    // "you were away" question. In memory only.
    pub idle: SharedIdleState,
    // Which OS notifications the user allows (mirrored from the app).
    pub notification_prefs: Arc<Mutex<NotificationPrefs>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(Vec::new())),
            task_sessions: Arc::new(Mutex::new(Vec::new())),
            work_logs: Arc::new(Mutex::new(WorkLogStore::default())),
            pending_work_log_capture: Arc::new(Mutex::new(None)),
            capture_server_status: Arc::new(Mutex::new(CaptureServerStatus {
                running: false,
                port: taskmint_core::contract::CAPTURE_SERVER_PORT,
                warning: None,
            })),
            tray_icon: Arc::new(Mutex::new(None)),
            tray_rendered: Arc::new(Mutex::new(None)),
            session_load_warning: Arc::new(Mutex::new(None)),
            work_log_load_warning: Arc::new(Mutex::new(None)),
            idle: Arc::new(Mutex::new(IdleState::default())),
            notification_prefs: Arc::new(Mutex::new(NotificationPrefs::default())),
        }
    }

    accessors!(with_idle, with_idle_mut, idle, IdleState, "idle state");
    accessors!(
        with_notification_prefs,
        with_notification_prefs_mut,
        notification_prefs,
        NotificationPrefs,
        "notification preferences"
    );
    accessors!(
        with_tray_rendered,
        with_tray_rendered_mut,
        tray_rendered,
        Option<TrayLiveKey>,
        "tray state"
    );
    accessors!(with_tasks, with_tasks_mut, tasks, Vec<Task>, "tasks");
    accessors!(
        with_tray_icon,
        with_tray_icon_mut,
        tray_icon,
        Option<tauri::tray::TrayIcon>,
        "tray icon"
    );
    accessors!(
        with_task_sessions,
        with_task_sessions_mut,
        task_sessions,
        Vec<TaskSession>,
        "task sessions"
    );
    accessors!(
        with_work_logs,
        with_work_logs_mut,
        work_logs,
        WorkLogStore,
        "work logs"
    );
    accessors!(
        with_pending_work_log_capture,
        with_pending_work_log_capture_mut,
        pending_work_log_capture,
        Option<PendingCapture>,
        "pending work log capture"
    );
    accessors!(
        with_capture_server_status,
        with_capture_server_status_mut,
        capture_server_status,
        CaptureServerStatus,
        "capture server status"
    );
    accessors!(
        with_work_log_load_warning,
        with_work_log_load_warning_mut,
        work_log_load_warning,
        Option<String>,
        "work log load warning"
    );
    accessors!(
        with_session_load_warning,
        with_session_load_warning_mut,
        session_load_warning,
        Option<String>,
        "session load warning"
    );
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
