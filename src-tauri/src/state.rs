// Application state management

use std::sync::{Arc, Mutex};
use crate::types::{ProjectTaskMapping, TimerState, Task, TaskSession, WorkLogEntry};
use crate::google_drive::GoogleDriveClient;

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
pub type SharedTrayIcon = Arc<Mutex<Option<tauri::tray::TrayIcon>>>;
pub type SharedGoogleDriveClient = Arc<Mutex<Option<GoogleDriveClient>>>;
pub type SharedLoadWarning = Arc<Mutex<Option<String>>>;

// Main application state container
#[derive(Clone)]
pub struct AppState {
    pub timer_state: SharedTimerState,
    pub tasks: SharedTasks,
    pub task_sessions: SharedTaskSessions,
    pub work_logs: SharedWorkLogs,
    pub tray_icon: SharedTrayIcon,
    pub google_drive_client: SharedGoogleDriveClient,
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
            tray_icon: Arc::new(Mutex::new(None)),
            google_drive_client: Arc::new(Mutex::new(None)),
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
        Ok(f(&*state))
    }

    pub fn with_timer_state_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut TimerState) -> T,
    {
        let mut state = self
            .timer_state
            .lock()
            .map_err(|e| format!("Failed to lock timer state: {}", e))?;
        Ok(f(&mut *state))
    }

    pub fn with_tasks<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Vec<Task>) -> T,
    {
        let tasks = self
            .tasks
            .lock()
            .map_err(|e| format!("Failed to lock tasks: {}", e))?;
        Ok(f(&*tasks))
    }

    pub fn with_tasks_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Vec<Task>) -> T,
    {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|e| format!("Failed to lock tasks: {}", e))?;
        Ok(f(&mut *tasks))
    }

    pub fn with_tray_icon<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<tauri::tray::TrayIcon>) -> T,
    {
        let tray = self
            .tray_icon
            .lock()
            .map_err(|e| format!("Failed to lock tray icon: {}", e))?;
        Ok(f(&*tray))
    }

    pub fn with_tray_icon_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<tauri::tray::TrayIcon>) -> T,
    {
        let mut tray = self
            .tray_icon
            .lock()
            .map_err(|e| format!("Failed to lock tray icon: {}", e))?;
        Ok(f(&mut *tray))
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
        Ok(f(&*sessions))
    }

    pub fn with_task_sessions_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Vec<TaskSession>) -> T,
    {
        let mut sessions = self
            .task_sessions
            .lock()
            .map_err(|e| format!("Failed to lock task sessions: {}", e))?;
        Ok(f(&mut *sessions))
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
        Ok(f(&*work_logs))
    }

    pub fn with_work_logs_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut WorkLogStore) -> T,
    {
        let mut work_logs = self
            .work_logs
            .lock()
            .map_err(|e| format!("Failed to lock work logs: {}", e))?;
        Ok(f(&mut *work_logs))
    }

    pub fn with_work_log_load_warning<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<String>) -> T,
    {
        let warning = self
            .work_log_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock work log load warning: {}", e))?;
        Ok(f(&*warning))
    }

    pub fn with_work_log_load_warning_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<String>) -> T,
    {
        let mut warning = self
            .work_log_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock work log load warning: {}", e))?;
        Ok(f(&mut *warning))
    }

    pub fn with_session_load_warning<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<String>) -> T,
    {
        let warning = self
            .session_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock session load warning: {}", e))?;
        Ok(f(&*warning))
    }

    pub fn with_session_load_warning_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<String>) -> T,
    {
        let mut warning = self
            .session_load_warning
            .lock()
            .map_err(|e| format!("Failed to lock session load warning: {}", e))?;
        Ok(f(&mut *warning))
    }

    pub fn with_google_drive_client<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Option<GoogleDriveClient>) -> T,
    {
        let client = self
            .google_drive_client
            .lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;
        Ok(f(&*client))
    }

    pub fn with_google_drive_client_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Option<GoogleDriveClient>) -> T,
    {
        let mut client = self
            .google_drive_client
            .lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;
        Ok(f(&mut *client))
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
