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
    // Site work-entry id for instances synthesized by a work-log import.
    #[serde(rename = "externalId", default)]
    pub external_id: Option<String>,
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
    // "worklog-import" for sessions synthesized from imported work-log entries
    // (must match WORKLOG_IMPORT_SOURCE in src/types/workLog.ts).
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub date: String, // YYYY-MM-DD format
    #[serde(rename = "createdAt", default)]
    pub created_at: String,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: String,
}

// ============================================================================
// WORK-LOG RECONCILIATION TYPES
// ============================================================================

// Ledger record kinds. Wire values match the frontend zod enum in
// src/types/workLog.ts.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum WorkLogKind {
    #[serde(rename = "timed")]
    Timed,
    #[serde(rename = "workLog")]
    WorkLog,
}

// One imported work-log ledger record, upserted by `id` (the payment site's
// entry uuid). Tolerant like TaskSession: everything except id/kind defaults
// so a schema change cannot wipe the ledger; unreadable records are skipped
// individually at load time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogEntry {
    pub id: String,
    pub kind: WorkLogKind,
    #[serde(default)]
    pub created_at: String, // site's ISO-UTC timestamp, verbatim
    #[serde(default)]
    pub work_day: String, // local YYYY-MM-DD, computed by the frontend
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub project_name: String,
    #[serde(default)]
    pub task_id: String, // mapped TaskMint task, denormalized at import
    #[serde(default)]
    pub task_name: String,
    #[serde(default)]
    pub time_in_minutes: Option<f64>, // timed entries only
    #[serde(default)]
    pub reported_time_in_minutes: Option<f64>, // timed only; None = not reported
    #[serde(default)]
    pub amount_cents: i64,
    #[serde(default)]
    pub status: String, // informational only
    #[serde(default)]
    pub imported_at: String, // first-seen ISO, preserved on upsert
    #[serde(default)]
    pub updated_at: String, // last-upserted ISO
}

// A raw work-log payload delivered by the browser extension (over localhost
// or a taskmint:// deep link), waiting for the frontend to take and process
// it. Latest delivery wins; take_pending_work_log_capture clears it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCapture {
    pub payload: String, // raw JSON text as captured from the site
    pub received_at: String, // RFC3339
}

// Status of the localhost capture server, surfaced on the Payouts page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureServerStatus {
    pub running: bool,
    pub port: u16,
    pub warning: Option<String>,
}

// Remembered mapping from a site project to a TaskMint task, upserted by
// `project_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTaskMapping {
    pub project_id: String,
    #[serde(default)]
    pub project_name: String,
    #[serde(default)]
    pub task_id: String,
    #[serde(default)]
    pub task_name: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
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

    #[test]
    fn legacy_session_without_source_or_external_id_still_deserializes() {
        let session: TaskSession = serde_json::from_value(json!({
            "id": "session_legacy",
            "taskId": "task-1",
            "taskName": "Legacy",
            "timerInstances": [
                {
                    "id": "instance_legacy",
                    "sessionId": "session_legacy",
                    "startTime": "2026-08-18T10:00:00Z"
                }
            ],
            "totalDuration": 0,
            "isActive": false,
            "date": "2026-08-18"
        }))
        .expect("legacy session payload should deserialize");

        assert!(session.source.is_none());
        assert!(session.timer_instances[0].external_id.is_none());
    }

    #[test]
    fn session_source_and_instance_external_id_use_camel_case_on_the_wire() {
        let session: TaskSession = serde_json::from_value(json!({
            "id": "session_imp",
            "taskId": "task-1",
            "taskName": "Imported",
            "source": "worklog-import",
            "timerInstances": [
                {
                    "id": "instance_imp",
                    "sessionId": "session_imp",
                    "startTime": "2026-08-18T10:00:00Z",
                    "endTime": "2026-08-18T11:00:00Z",
                    "duration": 3600000u64,
                    "externalId": "site-entry-1"
                }
            ],
            "date": "2026-08-18"
        }))
        .expect("imported session payload should deserialize");

        assert_eq!(session.source.as_deref(), Some("worklog-import"));
        assert_eq!(
            session.timer_instances[0].external_id.as_deref(),
            Some("site-entry-1")
        );

        let value = serde_json::to_value(&session).expect("session should serialize");
        assert_eq!(value.get("source"), Some(&json!("worklog-import")));
        assert_eq!(
            value["timerInstances"][0].get("externalId"),
            Some(&json!("site-entry-1"))
        );
    }

    #[test]
    fn work_log_entry_round_trips_camel_case_and_defaults_optionals() {
        let entry: WorkLogEntry = serde_json::from_value(json!({
            "id": "entry-1",
            "kind": "timed",
            "createdAt": "2026-08-26T05:10:35.505Z",
            "workDay": "2026-08-25",
            "projectId": "proj-1",
            "projectName": "Raccoon - SWE",
            "taskId": "task-1",
            "taskName": "Raccoon - SWE",
            "timeInMinutes": 30.0,
            "amountInCentsTypo": "ignored unknown field",
            "amountCents": 3750,
            "status": "Pending Approval"
        }))
        .expect("work log entry should deserialize");

        assert_eq!(entry.kind, WorkLogKind::Timed);
        assert_eq!(entry.amount_cents, 3750);
        assert!(entry.reported_time_in_minutes.is_none());
        assert_eq!(entry.imported_at, "");

        let value = serde_json::to_value(&entry).expect("entry should serialize");
        assert_eq!(value.get("workDay"), Some(&json!("2026-08-25")));
        assert_eq!(value.get("amountCents"), Some(&json!(3750)));
        assert_eq!(value.get("kind"), Some(&json!("timed")));

        let work_log: WorkLogEntry = serde_json::from_value(json!({
            "id": "entry-2",
            "kind": "workLog"
        }))
        .expect("minimal work log record should deserialize");
        assert_eq!(work_log.kind, WorkLogKind::WorkLog);
        assert_eq!(work_log.amount_cents, 0);
    }

    #[test]
    fn project_task_mapping_round_trips_camel_case() {
        let mapping: ProjectTaskMapping = serde_json::from_value(json!({
            "projectId": "proj-1",
            "projectName": "Raccoon - SWE",
            "taskId": "task-1",
            "taskName": "Raccoon Work"
        }))
        .expect("mapping should deserialize");

        let value = serde_json::to_value(&mapping).expect("mapping should serialize");
        assert_eq!(value.get("projectId"), Some(&json!("proj-1")));
        assert_eq!(value.get("taskId"), Some(&json!("task-1")));
    }
}
