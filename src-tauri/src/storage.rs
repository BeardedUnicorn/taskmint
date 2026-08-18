use tauri::{AppHandle, Manager};
use tauri_plugin_store::{Store, StoreBuilder};
use crate::types::TaskSession;
use std::path::PathBuf;
use tauri::Wry;
use std::sync::Arc;

const STORE_FILENAME: &str = "sessions.json";
const SESSIONS_KEY: &str = "sessions";

fn get_store(app: &AppHandle) -> Result<Arc<Store<Wry>>, String> {
    let path = STORE_FILENAME
        .parse::<PathBuf>()
        .map_err(|e| format!("Invalid store path: {}", e))?;
    StoreBuilder::new(app, path)
        .build()
        .map_err(|e| format!("Failed to open session store: {}", e))
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

/// Copy the on-disk store aside before a save can overwrite data the load
/// could not read. Returns the backup path, or None when there is no store
/// file yet.
pub fn backup_store_file(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let store_path = data_dir.join(STORE_FILENAME);
    if !store_path.exists() {
        return Ok(None);
    }

    let stamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let backup_path = data_dir.join(format!("{}.bak-{}", STORE_FILENAME, stamp));
    std::fs::copy(&store_path, &backup_path)
        .map_err(|e| format!("Failed to back up session store: {}", e))?;
    Ok(Some(backup_path))
}

pub fn clear_all_sessions(app: &AppHandle) -> Result<(), String> {
    let store = get_store(app)?;
    store.delete(SESSIONS_KEY);
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
}
