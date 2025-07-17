use tauri::AppHandle;
use tauri_plugin_store::{StoreBuilder, Store};
use crate::types::TaskSession;
use std::path::PathBuf;
use tauri::Wry;
use std::sync::Arc;

const STORE_FILENAME: &str = "sessions.json";

fn get_store(app: &AppHandle) -> Arc<Store<Wry>> {
    StoreBuilder::new(app, STORE_FILENAME.parse::<PathBuf>().unwrap())
        .build()
        .unwrap() // Unwrap the Result from build()
}

pub fn save_sessions(app: &AppHandle, sessions: &[TaskSession]) -> Result<(), String> {
    let store = get_store(app);
    let sessions_value = serde_json::to_value(sessions).map_err(|e| e.to_string())?;
    store.set("sessions".to_string(), sessions_value);
    store.save().map_err(|e| e.to_string())
}

pub fn load_sessions(app: &AppHandle) -> Result<Vec<TaskSession>, String> {
    let store = get_store(app);
    store.reload().map_err(|e| e.to_string())?;
    match store.get("sessions") {
        Some(sessions_value) => {
            serde_json::from_value(sessions_value.clone()).map_err(|e| e.to_string())
        }
        None => Ok(Vec::new()),
    }
}

pub fn clear_all_sessions(app: &AppHandle) -> Result<(), String> {
    let store = get_store(app);
    store.clear();
    store.save().map_err(|e| e.to_string())
}
