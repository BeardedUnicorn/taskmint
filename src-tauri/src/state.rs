// Application state management

use std::sync::{Arc, Mutex};
use crate::types::{TimerState, Task};
use crate::google_drive::GoogleDriveClient;

// Type aliases for shared state
pub type SharedTimerState = Arc<Mutex<TimerState>>;
pub type SharedTasks = Arc<Mutex<Vec<Task>>>;
pub type SharedTrayIcon = Arc<Mutex<Option<tauri::tray::TrayIcon>>>;
pub type SharedGoogleDriveClient = Arc<Mutex<Option<GoogleDriveClient>>>;

// Main application state container
#[derive(Clone)]
pub struct AppState {
    pub timer_state: SharedTimerState,
    pub tasks: SharedTasks,
    pub tray_icon: SharedTrayIcon,
    pub google_drive_client: SharedGoogleDriveClient,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            timer_state: Arc::new(Mutex::new(TimerState::default())),
            tasks: Arc::new(Mutex::new(Vec::new())),
            tray_icon: Arc::new(Mutex::new(None)),
            google_drive_client: Arc::new(Mutex::new(None)),
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
