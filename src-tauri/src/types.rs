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
