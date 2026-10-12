use crate::types::{ProjectTaskMapping, TaskSession, WorkLogEntry};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Wry;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::{Store, StoreBuilder};

const STORE_FILENAME: &str = "sessions.json";
const SESSIONS_KEY: &str = "sessions";

pub const WORKLOG_STORE_FILENAME: &str = "worklogs.json";
const WORKLOG_ENTRIES_KEY: &str = "entries";
const WORKLOG_MAPPINGS_KEY: &str = "mappings";

/// The frontend's records (tasks, notes, note templates, the daily goal and
/// its history), stored as opaque JSON: the frontend owns their schemas, so
/// fields Rust doesn't model are never dropped.
pub const APP_RECORDS_STORE_FILENAME: &str = "appdata.json";
/// The record keys (the frontend's STORAGE_KEYS names).
pub const APP_RECORD_KEYS: [&str; 5] = [
    "predefinedTasks",
    "taskNotes",
    "noteTemplates",
    "dailyGoal",
    "dailyGoalAchievements",
];
/// Set once the records have been moved in from the webview's localStorage.
const APP_RECORDS_INITIALIZED_KEY: &str = "initialized";

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
                log::warn!("Skipping unreadable session record: {}", e);
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
pub fn backup_store_file_named(app: &AppHandle, filename: &str) -> Result<Option<PathBuf>, String> {
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

/// Wipe every key in a store file and persist the empty store. Goes through
/// the store plugin (not fs::remove_file) so the plugin's cached instance
/// cannot resurrect the old contents on the next open.
fn clear_store_named(app: &AppHandle, filename: &str) -> Result<(), String> {
    let store = get_store_named(app, filename)?;
    store.clear();
    store.save().map_err(|e| e.to_string())
}

pub fn clear_sessions_store(app: &AppHandle) -> Result<(), String> {
    clear_store_named(app, STORE_FILENAME)
}

pub fn clear_work_logs_store(app: &AppHandle) -> Result<(), String> {
    clear_store_named(app, WORKLOG_STORE_FILENAME)
}

pub fn clear_app_records_store(app: &AppHandle) -> Result<(), String> {
    clear_store_named(app, APP_RECORDS_STORE_FILENAME)
}

/// True for the timestamped safety copies backup_store_file_named writes
/// (e.g. "sessions.json.bak-20260831120000").
pub fn is_store_backup_filename(name: &str) -> bool {
    [
        STORE_FILENAME,
        WORKLOG_STORE_FILENAME,
        APP_RECORDS_STORE_FILENAME,
    ]
    .iter()
    .any(|store| {
        name.strip_prefix(store)
            .is_some_and(|rest| rest.starts_with(".bak-"))
    })
}

/// Delete the on-disk .bak-* copies of both stores. They hold the same user
/// data as the stores, so a full app-data reset must remove them too.
/// Returns how many files were deleted.
pub fn delete_store_backups(app: &AppHandle) -> Result<usize, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let entries = match std::fs::read_dir(&data_dir) {
        Ok(entries) => entries,
        // No data dir yet means there is nothing to delete.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(format!("Failed to read app data dir: {}", e)),
    };

    let mut deleted = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if is_store_backup_filename(name) {
            std::fs::remove_file(entry.path())
                .map_err(|e| format!("Failed to delete backup {}: {}", name, e))?;
            deleted += 1;
        }
    }
    Ok(deleted)
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
                log::warn!("Skipping unreadable {} record: {}", label, e);
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

// ============================================================================
// APP RECORDS STORE (appdata.json: tasks, notes, templates, goal)
// ============================================================================

pub type RecordMap = serde_json::Map<String, serde_json::Value>;

pub struct LoadedAppRecords {
    pub records: RecordMap,
    pub initialized: bool,
}

pub fn is_app_record_key(key: &str) -> bool {
    APP_RECORD_KEYS.contains(&key)
}

/// Adds imported records only where the key is absent (or null), so moving
/// records in can never overwrite what's already stored. Unknown keys are
/// ignored. Returns the keys that were set.
pub fn merge_imported_records(existing: &mut RecordMap, imported: RecordMap) -> Vec<String> {
    let mut set = Vec::new();
    for (key, value) in imported {
        if !is_app_record_key(&key) || value.is_null() {
            continue;
        }
        if existing.get(&key).is_some_and(|current| !current.is_null()) {
            continue;
        }
        existing.insert(key.clone(), value);
        set.push(key);
    }
    set
}

fn records_from_store(store: &Store<Wry>) -> LoadedAppRecords {
    let mut records = RecordMap::new();
    for key in APP_RECORD_KEYS {
        if let Some(value) = store.get(key) {
            records.insert(key.to_string(), value);
        }
    }
    let initialized = store
        .get(APP_RECORDS_INITIALIZED_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    LoadedAppRecords {
        records,
        initialized,
    }
}

pub fn load_app_records(app: &AppHandle) -> Result<LoadedAppRecords, String> {
    let store = get_store_named(app, APP_RECORDS_STORE_FILENAME)?;
    store.reload().map_err(|e| e.to_string())?;
    Ok(records_from_store(&store))
}

/// Saves one record; null removes it.
pub fn save_app_record(app: &AppHandle, key: &str, value: serde_json::Value) -> Result<(), String> {
    if !is_app_record_key(key) {
        return Err(format!("Unknown record \"{}\"", key));
    }
    let store = get_store_named(app, APP_RECORDS_STORE_FILENAME)?;
    if value.is_null() {
        store.delete(key);
    } else {
        store.set(key.to_string(), value);
    }
    store.save().map_err(|e| e.to_string())
}

/// The one-time move from localStorage: stores the imported records where
/// none exist yet, marks the store initialized, and returns what's stored.
pub fn import_app_records(
    app: &AppHandle,
    imported: RecordMap,
) -> Result<LoadedAppRecords, String> {
    let store = get_store_named(app, APP_RECORDS_STORE_FILENAME)?;
    store.reload().map_err(|e| e.to_string())?;
    let mut records = records_from_store(&store).records;
    for key in merge_imported_records(&mut records, imported) {
        if let Some(value) = records.get(&key) {
            store.set(key.clone(), value.clone());
        }
    }
    store.set(
        APP_RECORDS_INITIALIZED_KEY.to_string(),
        serde_json::Value::Bool(true),
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(LoadedAppRecords {
        records,
        initialized: true,
    })
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
    fn backup_filename_matcher_accepts_only_store_bak_files() {
        assert!(is_store_backup_filename("sessions.json.bak-20260831120000"));
        assert!(is_store_backup_filename("worklogs.json.bak-20260831120000"));

        // The live stores and unrelated files must never match.
        assert!(!is_store_backup_filename("sessions.json"));
        assert!(!is_store_backup_filename("worklogs.json"));
        assert!(!is_store_backup_filename("sessions.json.bak"));
        assert!(!is_store_backup_filename("other.json.bak-20260831120000"));
        assert!(!is_store_backup_filename(
            "mysessions.json.bak-20260831120000"
        ));
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

    #[test]
    fn only_the_five_record_keys_are_records() {
        for key in APP_RECORD_KEYS {
            assert!(is_app_record_key(key));
        }
        assert!(!is_app_record_key("sessions"));
        assert!(!is_app_record_key("initialized"));
        assert!(!is_app_record_key("theme-mode"));
    }

    #[test]
    fn importing_records_never_overwrites_stored_ones() {
        let mut existing = RecordMap::new();
        existing.insert("predefinedTasks".into(), json!([{ "id": "kept" }]));
        existing.insert("dailyGoal".into(), serde_json::Value::Null);

        let mut imported = RecordMap::new();
        imported.insert("predefinedTasks".into(), json!([{ "id": "from-webview" }]));
        imported.insert("taskNotes".into(), json!([{ "id": "note" }]));
        imported.insert("dailyGoal".into(), json!({ "targetAmount": 100 }));
        imported.insert("noteTemplates".into(), serde_json::Value::Null);
        imported.insert("theme-mode".into(), json!("dark"));

        let mut set = merge_imported_records(&mut existing, imported.clone());
        set.sort();

        assert_eq!(set, vec!["dailyGoal", "taskNotes"]);
        assert_eq!(existing["predefinedTasks"], json!([{ "id": "kept" }]));
        assert_eq!(existing["dailyGoal"], json!({ "targetAmount": 100 }));
        assert!(!existing.contains_key("noteTemplates"));
        assert!(!existing.contains_key("theme-mode"));

        // A second import changes nothing
        assert!(merge_imported_records(&mut existing, imported).is_empty());
    }

    #[test]
    fn backup_files_of_the_records_store_are_recognized() {
        assert!(is_store_backup_filename("appdata.json.bak-20261012120000"));
        assert!(!is_store_backup_filename("appdata.json"));
    }
}
