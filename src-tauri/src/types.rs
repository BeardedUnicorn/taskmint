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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub name: String,
    pub hourly_rate: Option<f64>,
    pub default_note_template_id: Option<String>,
    // Older frontends omit this field, so it must default or update_tasks
    // rejects their payloads wholesale.
    #[serde(default)]
    pub is_archived: bool,
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
//
// `#[serde(default)]` on the bool/string fields keeps older sessions.json
// files loadable after schema additions; records missing the truly required
// fields (id, sessionId, startTime) are skipped individually at load time
// instead of failing the whole file.
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
    #[serde(rename = "isRunning", default)]
    pub is_running: bool,
    #[serde(rename = "isPaused", default)]
    pub is_paused: bool,
    #[serde(rename = "pausedAt")]
    pub paused_at: Option<DateTime<Utc>>,
    #[serde(rename = "pausedDuration")]
    pub paused_duration: Option<u64>, // Total time paused in milliseconds
    #[serde(rename = "resumedAt")]
    pub resumed_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    #[serde(rename = "createdAt", default)]
    pub created_at: String,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: String,
}

// Task Session - Groups multiple timer instances for a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSession {
    pub id: String,
    #[serde(rename = "taskId", default)]
    pub task_id: String,
    #[serde(rename = "taskName", default)]
    pub task_name: String,
    #[serde(rename = "timerInstances", default)]
    pub timer_instances: Vec<TimerInstance>,
    #[serde(rename = "totalDuration", default)]
    pub total_duration: u64, // Sum of all timer instances in milliseconds
    pub notes: Option<String>,
    #[serde(rename = "isActive", default)]
    pub is_active: bool,
    #[serde(default)]
    pub date: String, // YYYY-MM-DD format
    #[serde(rename = "createdAt", default)]
    pub created_at: String,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn task_without_is_archived_defaults_to_false() {
        // Payloads from pre-archiving frontends omit the field entirely
        let task: Task = serde_json::from_value(json!({
            "id": "task-1",
            "name": "Legacy Task",
            "hourlyRate": 50.0,
            "defaultNoteTemplateId": null,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        }))
        .expect("legacy task payload should deserialize");

        assert!(!task.is_archived);
    }

    #[test]
    fn task_with_is_archived_true_round_trips_camel_case() {
        let task: Task = serde_json::from_value(json!({
            "id": "task-2",
            "name": "Archived Task",
            "hourlyRate": null,
            "defaultNoteTemplateId": null,
            "isArchived": true,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-02T00:00:00Z"
        }))
        .expect("archived task payload should deserialize");

        assert!(task.is_archived);

        let value = serde_json::to_value(&task).expect("task should serialize");
        assert_eq!(value.get("isArchived"), Some(&json!(true)));
    }
}
