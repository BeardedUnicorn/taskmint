// The frontend's records (tasks, notes, note templates, the daily goal and
// its history) in appdata.json. Values are opaque JSON the frontend
// validates; these commands only store them.

use crate::storage::{self, RecordMap};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRecordsResponse {
    pub records: RecordMap,
}

#[tauri::command]
pub fn get_app_records(app: AppHandle) -> Result<AppRecordsResponse, String> {
    storage::load_app_records(&app).map(|records| AppRecordsResponse { records })
}

/// Saves one record (a null value removes it). Only the known record keys
/// are accepted.
#[tauri::command]
pub fn set_app_record(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    storage::save_app_record(&app, &key, value)
}

/// Moves in records an older version kept in the webview's localStorage.
/// Adds to what's stored and never overwrites it, so running it again is
/// harmless; a copy of what was moved is kept beside appdata.json.
#[tauri::command]
pub fn import_app_records(
    app: AppHandle,
    records: RecordMap,
) -> Result<AppRecordsResponse, String> {
    storage::import_app_records(&app, records).map(|records| AppRecordsResponse { records })
}
