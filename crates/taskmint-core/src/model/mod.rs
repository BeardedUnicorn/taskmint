//! The records TaskMint stores and the frontend reads. Field names are part
//! of the wire contract (camelCase, with per-field renames on the session
//! types), and so is the tolerance on load: new fields default, so older
//! files and older frontends keep working.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// Task structure
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub name: String,
    pub hourly_rate: Option<f64>,
    pub default_note_template_id: Option<String>,
    // Older frontends omit this field, so it must default or the tasks
    // record from one wouldn't read at all.
    #[serde(default)]
    pub is_archived: bool,
    // Starred tasks lead the tray's Start submenu. Defaults like is_archived.
    #[serde(default)]
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

// Backup result structure. camelCase like every type the frontend reads
// (BackupResult in packages/client/src/types/backup.ts).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub timestamp: String,
    pub file_size: Option<u64>,
}

// Path validation result: `isValid` to the frontend (useBackupSettings
// rejected every folder while this went out as `is_valid`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct PathValidationResult {
    pub is_valid: bool,
    pub error: Option<String>,
}

// ============================================================================
// SESSION-BASED TIMER SYSTEM TYPES
// ============================================================================

// The task a timer's time belongs to when it isn't its session's. A copy, like
// the session's own: the name follows renames, and the rate is the one the
// task had when the timer was created, so later rate changes don't rewrite
// what it earned.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct TimerTask {
    pub task_id: String,
    pub task_name: String,
    #[serde(default)]
    pub hourly_rate: Option<f64>,
}

// Timer Instance - Individual timer within a session
//
// `#[serde(default)]` on the bool/string fields keeps older sessions.json
// files loadable after schema additions; records missing the truly required
// fields (id, sessionId, startTime) are skipped individually at load time
// instead of failing the whole file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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
    // None: the timer belongs to its session's task (and earns its rate).
    // Read through TaskSession::task_id_of / task_name_of.
    #[serde(default)]
    pub task: Option<TimerTask>,
    pub notes: Option<String>,
    #[serde(rename = "createdAt", default)]
    pub created_at: String,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: String,
}

// Task Session - A stretch of work: its timers, each on a task. `task_id` is
// the task the session was opened for; a timer on another task says so itself.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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
    // WORKLOG_IMPORT_SOURCE for sessions synthesized from imported work-log
    // entries, MANUAL_SOURCE for "Add time" (see contract).
    #[serde(default)]
    pub source: Option<String>,
    // The task's hourly rate when the session started (or, for imports, the
    // rate the site's pay implies), so later rate changes don't rewrite past
    // earnings. None for sessions from older builds until filled in.
    #[serde(rename = "hourlyRate", default)]
    pub hourly_rate: Option<f64>,
    #[serde(default)]
    pub date: String, // YYYY-MM-DD format
    #[serde(rename = "createdAt", default)]
    pub created_at: String,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: String,
}

impl TaskSession {
    /// The task one of this session's timers belongs to.
    pub fn task_id_of<'a>(&'a self, instance: &'a TimerInstance) -> &'a str {
        instance.task.as_ref().map_or(&self.task_id, |t| &t.task_id)
    }

    /// The name of the task one of this session's timers belongs to.
    pub fn task_name_of<'a>(&'a self, instance: &'a TimerInstance) -> &'a str {
        instance
            .task
            .as_ref()
            .map_or(&self.task_name, |t| &t.task_name)
    }
}

// ============================================================================
// WORK-LOG RECONCILIATION TYPES
// ============================================================================

// Ledger record kinds. Wire values match the frontend zod enum in
// packages/client/src/types/workLog.ts.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
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

// How a captured payload reached the app. Must match CaptureSource in
// packages/client/src/types/workLog.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum CaptureSource {
    /// localhost POST from the pinned TaskMint extension (or a local tool):
    /// trusted, auto-applied when every project has a task match.
    Extension,
    /// taskmint:// link. Any web page can open one, so the frontend stages
    /// these for review instead of applying them.
    Link,
}

// A raw work-log payload delivered by the browser extension (over localhost
// or a taskmint:// deep link), waiting for the frontend to take and process
// it. Latest delivery wins; take_pending_work_log_capture clears it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct PendingCapture {
    pub payload: String,     // raw JSON text as captured from the site
    pub received_at: String, // RFC3339
    pub source: CaptureSource,
}

// Status of the localhost capture server, surfaced on the Payouts page.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct CaptureServerStatus {
    pub running: bool,
    pub port: u16,
    pub warning: Option<String>,
}

// Remembered mapping from a site project to a TaskMint task, upserted by
// `project_id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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

    #[test]
    fn capture_source_reaches_the_frontend_as_lowercase() {
        let link = PendingCapture {
            payload: "{}".to_string(),
            received_at: "T".to_string(),
            source: CaptureSource::Link,
        };
        let json = serde_json::to_value(&link).unwrap();
        assert_eq!(json["source"], "link");
        assert_eq!(json["receivedAt"], "T");
        assert_eq!(
            serde_json::to_value(CaptureSource::Extension).unwrap(),
            "extension"
        );
    }
}
