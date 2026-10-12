// The frontend's records (tasks, notes, note templates, the daily goal and
// its history) in appdata.json. Values are opaque JSON the frontend
// validates; these commands only store them.

use crate::storage::{self, LoadedAppRecords, RecordMap};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRecordsResponse {
    pub records: RecordMap,
    /// False until the records have been moved in from localStorage once.
    pub initialized: bool,
}

impl From<LoadedAppRecords> for AppRecordsResponse {
    fn from(loaded: LoadedAppRecords) -> Self {
        Self {
            records: loaded.records,
            initialized: loaded.initialized,
        }
    }
}

#[tauri::command]
pub fn get_app_records(app: AppHandle) -> Result<AppRecordsResponse, String> {
    storage::load_app_records(&app).map(Into::into)
}

/// Saves one record (a null value removes it). Only the known record keys
/// are accepted.
#[tauri::command]
pub fn set_app_record(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    storage::save_app_record(&app, &key, value)
}

/// The one-time move from the webview's localStorage. Never overwrites a
/// stored record, so running it again (after a crash) is harmless.
#[tauri::command]
pub fn import_app_records(
    app: AppHandle,
    records: RecordMap,
) -> Result<AppRecordsResponse, String> {
    storage::import_app_records(&app, records).map(Into::into)
}
