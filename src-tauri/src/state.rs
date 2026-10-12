// Application state management

use crate::types::{
    CaptureServerStatus, PendingCapture, ProjectTaskMapping, Task, TaskSession, TimerState,
    WorkLogEntry,
};
use std::sync::{Arc, Mutex};

// Imported work-log ledger + remembered project→task mappings, persisted
// together in worklogs.json.
#[derive(Default)]
pub struct WorkLogStore {
    pub entries: Vec<WorkLogEntry>,
    pub mappings: Vec<ProjectTaskMapping>,
}

// Type aliases for shared state
pub type SharedTimerState = Arc<Mutex<TimerState>>;
pub type SharedTasks = Arc<Mutex<Vec<Task>>>;
pub type SharedTaskSessions = Arc<Mutex<Vec<TaskSession>>>;
pub type SharedWorkLogs = Arc<Mutex<WorkLogStore>>;
pub type SharedPendingCapture = Arc<Mutex<Option<PendingCapture>>>;
pub type SharedCaptureServerStatus = Arc<Mutex<CaptureServerStatus>>;
pub type SharedTrayIcon = Arc<Mutex<Option<tauri::tray::TrayIcon>>>;
pub type SharedLoadWarning = Arc<Mutex<Option<String>>>;

// Main application state container
#[derive(Clone)]
pub struct AppState {
    pub timer_state: SharedTimerState,
    pub tasks: SharedTasks,
    pub task_sessions: SharedTaskSessions,
    pub work_logs: SharedWorkLogs,
    // Latest raw payload delivered by the browser extension (localhost POST
    // or taskmint:// deep link); cleared by take_pending_work_log_capture.
    pub pending_work_log_capture: SharedPendingCapture,
    pub capture_server_status: SharedCaptureServerStatus,
    pub tray_icon: SharedTrayIcon,
    // Set once at startup when the sessions store could not be fully read;
    // surfaced to the frontend via get_session_load_warning.
    pub session_load_warning: SharedLoadWarning,
    // Same, for the work-log store; surfaced via get_work_logs.
    pub work_log_load_warning: SharedLoadWarning,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            timer_state: Arc::new(Mutex::new(TimerState::default())),
            tasks: Arc::new(Mutex::new(Vec::new())),
            task_sessions: Arc::new(Mutex::new(Vec::new())),
            work_logs: Arc::new(Mutex::new(WorkLogStore::default())),
            pending_work_log_capture: Arc::new(Mutex::new(None)),
            capture_server_status: Arc::new(Mutex::new(CaptureServerStatus {
                running: false,
                port: crate::capture_server::CAPTURE_SERVER_PORT,
                warning: None,
            })),
            tray_icon: Arc::new(Mutex::new(None)),
            session_load_warning: Arc::new(Mutex::new(None)),
            work_log_load_warning: Arc::new(Mutex::new(None)),
        }
    }

    // Helper methods for accessing state with better error handling
    pub fn with_timer_state<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&TimerState) -> T,
    {
        let state = self
            .timer_state
            .lock()
            .map_err(|e| format!("Failed to lock timer state: {}", e))?;
        Ok(f(&state))
    }

    pub fn with_timer_state_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut TimerState) -> T,
    {
        let mut state = self
            .timer_state
            .lock()
            .map_err(|e| format!("Failed to lock timer state: {}", e))?;
        Ok(f(&mut state))
    }

    pub fn with_tasks<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Vec<Task>) -> T,
    {
        let tasks = self
            .tasks
            .lock()
            .map_err(|e| format!("Failed to lock tasks: {}", e))?;
        Ok(f(&tasks))
    }

    pub fn with_tasks_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Vec<Task>) -> T,
    {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|e| format!("Failed to lock tasks: {}", e))?;
        Ok(f(&mut tasks))
    }

    pub fn with_tray_icon<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<tauri::tray::TrayIcon>) -> T,
    {
        let tray = self
            .tray_icon
            .lock()
            .map_err(|e| format!("Failed to lock tray icon: {}", e))?;
        Ok(f(&tray))
    }

    pub fn with_tray_icon_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<tauri::tray::TrayIcon>) -> T,
    {
        let mut tray = self
            .tray_icon
            .lock()
            .map_err(|e| format!("Failed to lock tray icon: {}", e))?;
        Ok(f(&mut tray))
    }

    // Task sessions methods
    pub fn with_task_sessions<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Vec<TaskSession>) -> T,
    {
        let sessions = self
            .task_sessions
            .lock()
            .map_err(|e| format!("Failed to lock task sessions: {}", e))?;
        Ok(f(&sessions))
    }

    pub fn with_task_sessions_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Vec<TaskSession>) -> T,
    {
        let mut sessions = self
            .task_sessions
            .lock()
            .map_err(|e| format!("Failed to lock task sessions: {}", e))?;
        Ok(f(&mut sessions))
    }

    // Work-log store methods
    pub fn with_work_logs<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&WorkLogStore) -> T,
    {
        let work_logs = self
            .work_logs
            .lock()
            .map_err(|e| format!("Failed to lock work logs: {}", e))?;
        Ok(f(&work_logs))
    }

    pub fn with_work_logs_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut WorkLogStore) -> T,
    {
        let mut work_logs = self
            .work_logs
            .lock()
            .map_err(|e| format!("Failed to lock work logs: {}", e))?;
        Ok(f(&mut work_logs))
    }

    // Browser-capture methods
    pub fn with_pending_work_log_capture<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<PendingCapture>) -> T,
    {
        let capture = self
            .pending_work_log_capture
            .lock()
            .map_err(|e| format!("Failed to lock pending work log capture: {}", e))?;
        Ok(f(&capture))
    }

    pub fn with_pending_work_log_capture_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<PendingCapture>) -> T,
    {
        let mut capture = self
            .pending_work_log_capture
            .lock()
            .map_err(|e| format!("Failed to lock pending work log capture: {}", e))?;
        Ok(f(&mut capture))
    }

    pub fn with_capture_server_status<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&CaptureServerStatus) -> T,
    {
        let status = self
            .capture_server_status
            .lock()
            .map_err(|e| format!("Failed to lock capture server status: {}", e))?;
        Ok(f(&status))
    }

    pub fn with_capture_server_status_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut CaptureServerStatus) -> T,
    {
        let mut status = self
            .capture_server_status
            .lock()
            .map_err(|e| format!("Failed to lock capture server status: {}", e))?;
        Ok(f(&mut status))
    }

    pub fn with_work_log_load_warning<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<String>) -> T,
    {
        let warning = self
            .work_log_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock work log load warning: {}", e))?;
        Ok(f(&warning))
    }

    pub fn with_work_log_load_warning_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<String>) -> T,
    {
        let mut warning = self
            .work_log_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock work log load warning: {}", e))?;
        Ok(f(&mut warning))
    }

    pub fn with_session_load_warning<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<String>) -> T,
    {
        let warning = self
            .session_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock session load warning: {}", e))?;
        Ok(f(&warning))
    }

    pub fn with_session_load_warning_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<String>) -> T,
    {
        let mut warning = self
            .session_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock session load warning: {}", e))?;
        Ok(f(&mut warning))
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
