use tauri::{AppHandle, Manager};
use tauri_plugin_store::{Store, StoreBuilder};
use crate::types::{ProjectTaskMapping, TaskSession, WorkLogEntry};
use std::path::PathBuf;
use tauri::Wry;
use std::sync::Arc;

const STORE_FILENAME: &str = "sessions.json";
const SESSIONS_KEY: &str = "sessions";

pub const WORKLOG_STORE_FILENAME: &str = "worklogs.json";
const WORKLOG_ENTRIES_KEY: &str = "entries";
const WORKLOG_MAPPINGS_KEY: &str = "mappings";

fn get_store_named(app: &AppHandle, filename: &str) -> Result<Arc<Store<Wry>>, String> {
    let path = filename
        .parse::<PathBuf>()
        .map_err(|e| format!("Invalid store path: {}", e))?;
    StoreBuilder::new(app, path)
        .build()
        .map_err(|e| format!("Failed to open {} store: {}", filename, e))
}

fn get_store(app: &AppHandle) -> Result<Arc<Store<Wry>>, String> {
    get_store_named(app, STORE_FILENAME)
}

pub fn save_sessions(app: &AppHandle, sessions: &[TaskSession]) -> Result<(), String> {
    let store = get_store(app)?;
    let sessions_value = serde_json::to_value(sessions).map_err(|e| e.to_string())?;
    store.set(SESSIONS_KEY.to_string(), sessions_value);
    store.save().map_err(|e| e.to_string())
}

pub struct LoadedSessions {
    pub sessions: Vec<TaskSession>,
    pub skipped: usize,
}

/// Parse the stored array one record at a time so a single unreadable record
/// (e.g. after a schema change) cannot wipe every session.
pub fn parse_sessions(value: &serde_json::Value) -> Result<LoadedSessions, String> {
    let records = value
        .as_array()
        .ok_or_else(|| "Stored sessions value is not an array".to_string())?;

    let mut sessions = Vec::with_capacity(records.len());
    let mut skipped = 0;
    for record in records {
        match serde_json::from_value::<TaskSession>(record.clone()) {
            Ok(session) => sessions.push(session),
            Err(e) => {
                skipped += 1;
                eprintln!("Skipping unreadable session record: {}", e);
            }
        }
    }

    Ok(LoadedSessions { sessions, skipped })
}

pub fn load_sessions(app: &AppHandle) -> Result<LoadedSessions, String> {
    let store = get_store(app)?;
    store.reload().map_err(|e| e.to_string())?;
    match store.get(SESSIONS_KEY) {
        Some(sessions_value) => parse_sessions(&sessions_value),
        None => Ok(LoadedSessions {
            sessions: Vec::new(),
            skipped: 0,
        }),
    }
}

/// Copy an on-disk store aside before a save can overwrite data the load
/// could not read (or before a destructive rewrite). Returns the backup path,
/// or None when there is no store file yet.
pub fn backup_store_file_named(
    app: &AppHandle,
    filename: &str,
) -> Result<Option<PathBuf>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let store_path = data_dir.join(filename);
    if !store_path.exists() {
        return Ok(None);
    }

    let stamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let backup_path = data_dir.join(format!("{}.bak-{}", filename, stamp));
    std::fs::copy(&store_path, &backup_path)
        .map_err(|e| format!("Failed to back up {} store: {}", filename, e))?;
    Ok(Some(backup_path))
}

pub fn backup_store_file(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    backup_store_file_named(app, STORE_FILENAME)
}

pub fn clear_all_sessions(app: &AppHandle) -> Result<(), String> {
    let store = get_store(app)?;
    store.delete(SESSIONS_KEY);
    store.save().map_err(|e| e.to_string())
}

// ============================================================================
// WORK-LOG STORE (worklogs.json: imported ledger entries + project mappings)
// ============================================================================

pub struct LoadedWorkLogs {
    pub entries: Vec<WorkLogEntry>,
    pub mappings: Vec<ProjectTaskMapping>,
    pub skipped: usize,
}

/// Parse one stored array a record at a time so a single unreadable record
/// (e.g. after a schema change) cannot wipe the whole collection. Mirrors
/// parse_sessions.
fn parse_records<T: serde::de::DeserializeOwned>(
    value: &serde_json::Value,
    label: &str,
) -> Result<(Vec<T>, usize), String> {
    let records = value
        .as_array()
        .ok_or_else(|| format!("Stored {} value is not an array", label))?;

    let mut items = Vec::with_capacity(records.len());
    let mut skipped = 0;
    for record in records {
        match serde_json::from_value::<T>(record.clone()) {
            Ok(item) => items.push(item),
            Err(e) => {
                skipped += 1;
                eprintln!("Skipping unreadable {} record: {}", label, e);
            }
        }
    }

    Ok((items, skipped))
}

pub fn parse_work_log_entries(
    value: &serde_json::Value,
) -> Result<(Vec<WorkLogEntry>, usize), String> {
    parse_records(value, "work-log entry")
}

pub fn parse_project_mappings(
    value: &serde_json::Value,
) -> Result<(Vec<ProjectTaskMapping>, usize), String> {
    parse_records(value, "project mapping")
}

pub fn load_work_logs(app: &AppHandle) -> Result<LoadedWorkLogs, String> {
    let store = get_store_named(app, WORKLOG_STORE_FILENAME)?;
    store.reload().map_err(|e| e.to_string())?;

    let (entries, entries_skipped) = match store.get(WORKLOG_ENTRIES_KEY) {
        Some(value) => parse_work_log_entries(&value)?,
        None => (Vec::new(), 0),
    };
    let (mappings, mappings_skipped) = match store.get(WORKLOG_MAPPINGS_KEY) {
        Some(value) => parse_project_mappings(&value)?,
        None => (Vec::new(), 0),
    };

    Ok(LoadedWorkLogs {
        entries,
        mappings,
        skipped: entries_skipped + mappings_skipped,
    })
}

pub fn save_work_logs(
    app: &AppHandle,
    entries: &[WorkLogEntry],
    mappings: &[ProjectTaskMapping],
) -> Result<(), String> {
    let store = get_store_named(app, WORKLOG_STORE_FILENAME)?;
    let entries_value = serde_json::to_value(entries).map_err(|e| e.to_string())?;
    let mappings_value = serde_json::to_value(mappings).map_err(|e| e.to_string())?;
    store.set(WORKLOG_ENTRIES_KEY.to_string(), entries_value);
    store.set(WORKLOG_MAPPINGS_KEY.to_string(), mappings_value);
    store.save().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_session_json(id: &str) -> serde_json::Value {
        json!({
            "id": id,
            "taskId": "task_1",
            "taskName": "Test task",
            "timerInstances": [],
            "totalDuration": 0,
            "isActive": false,
            "date": "2026-08-18",
            "createdAt": "2026-08-18T00:00:00Z",
            "updatedAt": "2026-08-18T00:00:00Z"
        })
    }

    #[test]
    fn parse_skips_bad_records_and_keeps_good_ones() {
        let value = json!([
            valid_session_json("session_1"),
            { "garbage": true },
            valid_session_json("session_2"),
        ]);

        let loaded = parse_sessions(&value).unwrap();
        assert_eq!(loaded.sessions.len(), 2);
        assert_eq!(loaded.skipped, 1);
        assert_eq!(loaded.sessions[0].id, "session_1");
        assert_eq!(loaded.sessions[1].id, "session_2");
    }

    #[test]
    fn parse_tolerates_missing_defaultable_fields() {
        // A record written by an older schema: no totalDuration/isActive/date.
        let value = json!([
            {
                "id": "session_old",
                "taskId": "task_1",
                "taskName": "Old task",
                "timerInstances": [
                    {
                        "id": "instance_old",
                        "sessionId": "session_old",
                        "startTime": "2026-08-18T00:00:00Z"
                    }
                ]
            }
        ]);

        let loaded = parse_sessions(&value).unwrap();
        assert_eq!(loaded.skipped, 0);
        assert_eq!(loaded.sessions.len(), 1);
        let session = &loaded.sessions[0];
        assert_eq!(session.total_duration, 0);
        assert!(!session.is_active);
        assert_eq!(session.timer_instances.len(), 1);
        assert!(!session.timer_instances[0].is_running);
    }

    #[test]
    fn parse_rejects_non_array_value() {
        assert!(parse_sessions(&json!({"not": "an array"})).is_err());
    }

    #[test]
    fn parse_work_log_entries_skips_bad_records_and_keeps_good_ones() {
        let value = json!([
            {
                "id": "entry-1",
                "kind": "timed",
                "workDay": "2026-08-26",
                "amountCents": 3750
            },
            { "garbage": true },
            {
                "id": "entry-2",
                "kind": "workLog"
            },
        ]);

        let (entries, skipped) = parse_work_log_entries(&value).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(skipped, 1);
        assert_eq!(entries[0].id, "entry-1");
        assert_eq!(entries[1].id, "entry-2");
    }

    #[test]
    fn parse_work_log_entries_rejects_non_array_value() {
        assert!(parse_work_log_entries(&json!({"not": "an array"})).is_err());
    }

    #[test]
    fn parse_project_mappings_skips_records_missing_project_id() {
        let value = json!([
            { "projectId": "proj-1", "taskId": "task-1" },
            { "taskId": "orphan" },
        ]);

        let (mappings, skipped) = parse_project_mappings(&value).unwrap();
        assert_eq!(mappings.len(), 1);
        assert_eq!(skipped, 1);
        assert_eq!(mappings[0].project_id, "proj-1");
    }
}
