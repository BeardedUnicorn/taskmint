// Task-related command handlers

use crate::state::AppState;
use crate::types::{DailyTotal, Task};
use tauri::State;

#[tauri::command]
pub fn update_tasks(app_state: State<AppState>, new_tasks: Vec<Task>) -> Result<(), String> {
    app_state.with_tasks_mut(|tasks| {
        *tasks = new_tasks;
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_tasks(app_state: State<AppState>) -> Result<Vec<Task>, String> {
    app_state.with_tasks(|tasks| tasks.clone())
}

#[tauri::command]
pub fn get_daily_total(time_entries: Vec<serde_json::Value>) -> Result<DailyTotal, String> {
    let mut total_duration_ms = 0u64;
    let task_count = time_entries.len();

    for entry in time_entries {
        if let Some(duration) = entry.get("duration").and_then(|d| d.as_u64()) {
            total_duration_ms += duration;
        }
    }

    Ok(DailyTotal {
        total_duration_ms,
        task_count,
    })
}
