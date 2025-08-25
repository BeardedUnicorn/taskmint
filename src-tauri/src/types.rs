// Core application types and data structures

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// Timer state structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub is_running: bool,
    pub task_name: String,
    pub start_time: Option<DateTime<Utc>>,
    pub elapsed_ms: u64,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            is_running: false,
            task_name: String::new(),
            start_time: None,
            elapsed_ms: 0,
        }
    }
}

// Task structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub hourly_rate: Option<f64>,
    pub default_note_template_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// Daily total structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTotal {
    pub total_duration_ms: u64,
    pub task_count: usize,
}

// Backup result structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub timestamp: String,
    pub file_size: Option<u64>,
}

// Path validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathValidationResult {
    pub is_valid: bool,
    pub error: Option<String>,
}

// Google Drive authentication result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDriveAuthResult {
    pub success: bool,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<String>,
    pub error: Option<String>,
}

// Google Drive sync result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDriveSyncResult {
    pub success: bool,
    pub operation: String, // "upload", "download", "conflict"
    pub timestamp: String,
    pub error: Option<String>,
    pub conflict_resolution: Option<String>,
    pub data_changed: bool,
}

// ============================================================================
// SESSION-BASED TIMER SYSTEM TYPES
// ============================================================================

// Timer Instance - Individual timer within a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerInstance {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "startTime")]
    pub start_time: DateTime<Utc>,
    #[serde(rename = "endTime")]
    pub end_time: Option<DateTime<Utc>>,
    pub duration: Option<u64>, // in milliseconds
    #[serde(rename = "isRunning")]
    pub is_running: bool,
    #[serde(rename = "isPaused")]
    pub is_paused: bool,
    #[serde(rename = "pausedAt")]
    pub paused_at: Option<DateTime<Utc>>,
    #[serde(rename = "pausedDuration")]
    pub paused_duration: Option<u64>, // Total time paused in milliseconds
    #[serde(rename = "resumedAt")]
    pub resumed_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

// Task Session - Groups multiple timer instances for a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSession {
    pub id: String,
    #[serde(rename = "taskId")]
    pub task_id: String,
    #[serde(rename = "taskName")]
    pub task_name: String,
    #[serde(rename = "timerInstances")]
    pub timer_instances: Vec<TimerInstance>,
    #[serde(rename = "totalDuration")]
    pub total_duration: u64, // Sum of all timer instances in milliseconds
    pub notes: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub date: String, // YYYY-MM-DD format
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

// Enhanced Timer State with session support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedTimerState {
    #[serde(rename = "activeSession")]
    pub active_session: Option<TaskSession>,
    #[serde(rename = "activeInstance")]
    pub active_instance: Option<TimerInstance>,
    #[serde(rename = "isRunning")]
    pub is_running: bool,
    #[serde(rename = "taskName")]
    pub task_name: String,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "instanceId")]
    pub instance_id: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: Option<DateTime<Utc>>,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u64,
    #[serde(rename = "isPaused")]
    pub is_paused: bool,
    #[serde(rename = "pausedDueToInactivity")]
    pub paused_due_to_inactivity: bool,
}

impl Default for EnhancedTimerState {
    fn default() -> Self {
        Self {
            active_session: None,
            active_instance: None,
            is_running: false,
            task_name: String::new(),
            session_id: None,
            instance_id: None,
            start_time: None,
            elapsed_ms: 0,
            is_paused: false,
            paused_due_to_inactivity: false,
        }
    }
}

// Inactivity Detection Settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InactivitySettings {
    pub enabled: bool,
    pub threshold_minutes: u32,
    pub show_warning_before_pause: bool,
    pub warning_duration_seconds: u32,
    pub resume_on_activity: bool,
    pub testing_mode: bool, // Enable shorter thresholds for development/testing
}

impl Default for InactivitySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold_minutes: 15,
            show_warning_before_pause: true,
            warning_duration_seconds: 30,
            resume_on_activity: false,
            testing_mode: false,
        }
    }
}

impl InactivitySettings {
    /// Get the effective threshold in minutes, considering testing mode
    pub fn effective_threshold_minutes(&self) -> u32 {
        if self.testing_mode {
            // In testing mode, use much shorter thresholds for easier testing
            match self.threshold_minutes {
                15 => 1,  // 15 minutes -> 1 minute
                30 => 2,  // 30 minutes -> 2 minutes
                60 => 3,  // 60 minutes -> 3 minutes
                _ => (self.threshold_minutes / 10).max(1), // Divide by 10, minimum 1 minute
            }
        } else {
            self.threshold_minutes
        }
    }

    /// Get the effective warning duration in seconds, considering testing mode
    pub fn effective_warning_duration_seconds(&self) -> u32 {
        if self.testing_mode {
            // In testing mode, use shorter warning duration
            (self.warning_duration_seconds / 3).max(5) // Divide by 3, minimum 5 seconds
        } else {
            self.warning_duration_seconds
        }
    }
}

// Timer Activity State
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerActivityState {
    pub last_activity_time: DateTime<Utc>,
    pub is_user_active: bool,
    pub inactivity_warning_shown: bool,
    pub paused_due_to_inactivity: bool,
}

impl Default for TimerActivityState {
    fn default() -> Self {
        Self {
            last_activity_time: Utc::now(),
            is_user_active: true,
            inactivity_warning_shown: false,
            paused_due_to_inactivity: false,
        }
    }
}
