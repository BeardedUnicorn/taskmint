// Application state management

use std::sync::{Arc, Mutex};
use crate::types::{TimerState, Task, EnhancedTimerState, TaskSession, TimerInstance, InactivitySettings, TimerActivityState};
use crate::google_drive::GoogleDriveClient;

// Type aliases for shared state
pub type SharedTimerState = Arc<Mutex<TimerState>>;
pub type SharedEnhancedTimerState = Arc<Mutex<EnhancedTimerState>>;
pub type SharedTasks = Arc<Mutex<Vec<Task>>>;
pub type SharedTaskSessions = Arc<Mutex<Vec<TaskSession>>>;
pub type SharedTimerInstances = Arc<Mutex<Vec<TimerInstance>>>;
pub type SharedInactivitySettings = Arc<Mutex<InactivitySettings>>;
pub type SharedTimerActivityState = Arc<Mutex<TimerActivityState>>;
pub type SharedTrayIcon = Arc<Mutex<Option<tauri::tray::TrayIcon>>>;
pub type SharedGoogleDriveClient = Arc<Mutex<Option<GoogleDriveClient>>>;

// Main application state container
#[derive(Clone)]
pub struct AppState {
    pub timer_state: SharedTimerState,
    pub enhanced_timer_state: SharedEnhancedTimerState,
    pub tasks: SharedTasks,
    pub task_sessions: SharedTaskSessions,
    pub timer_instances: SharedTimerInstances,
    pub inactivity_settings: SharedInactivitySettings,
    pub timer_activity_state: SharedTimerActivityState,
    pub tray_icon: SharedTrayIcon,
    pub google_drive_client: SharedGoogleDriveClient,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            timer_state: Arc::new(Mutex::new(TimerState::default())),
            enhanced_timer_state: Arc::new(Mutex::new(EnhancedTimerState::default())),
            tasks: Arc::new(Mutex::new(Vec::new())),
            task_sessions: Arc::new(Mutex::new(Vec::new())),
            timer_instances: Arc::new(Mutex::new(Vec::new())),
            inactivity_settings: Arc::new(Mutex::new(InactivitySettings::default())),
            timer_activity_state: Arc::new(Mutex::new(TimerActivityState::default())),
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

    // Enhanced timer state methods
    pub fn with_enhanced_timer_state<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&EnhancedTimerState) -> T,
    {
        let state = self
            .enhanced_timer_state
            .lock()
            .map_err(|e| format!("Failed to lock enhanced timer state: {}", e))?;
        Ok(f(&*state))
    }

    pub fn with_enhanced_timer_state_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut EnhancedTimerState) -> T,
    {
        let mut state = self
            .enhanced_timer_state
            .lock()
            .map_err(|e| format!("Failed to lock enhanced timer state: {}", e))?;
        Ok(f(&mut *state))
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

    // Timer instances methods
    pub fn with_timer_instances<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Vec<TimerInstance>) -> T,
    {
        let instances = self
            .timer_instances
            .lock()
            .map_err(|e| format!("Failed to lock timer instances: {}", e))?;
        Ok(f(&*instances))
    }

    pub fn with_timer_instances_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Vec<TimerInstance>) -> T,
    {
        let mut instances = self
            .timer_instances
            .lock()
            .map_err(|e| format!("Failed to lock timer instances: {}", e))?;
        Ok(f(&mut *instances))
    }

    // Inactivity settings methods
    pub fn with_inactivity_settings<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&InactivitySettings) -> T,
    {
        let settings = self
            .inactivity_settings
            .lock()
            .map_err(|e| format!("Failed to lock inactivity settings: {}", e))?;
        Ok(f(&*settings))
    }

    pub fn with_inactivity_settings_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut InactivitySettings) -> T,
    {
        let mut settings = self
            .inactivity_settings
            .lock()
            .map_err(|e| format!("Failed to lock inactivity settings: {}", e))?;
        Ok(f(&mut *settings))
    }

    // Timer activity state methods
    pub fn with_timer_activity_state<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&TimerActivityState) -> T,
    {
        let state = self
            .timer_activity_state
            .lock()
            .map_err(|e| format!("Failed to lock timer activity state: {}", e))?;
        Ok(f(&*state))
    }

    pub fn with_timer_activity_state_mut<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut TimerActivityState) -> T,
    {
        let mut state = self
            .timer_activity_state
            .lock()
            .map_err(|e| format!("Failed to lock timer activity state: {}", e))?;
        Ok(f(&mut *state))
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
