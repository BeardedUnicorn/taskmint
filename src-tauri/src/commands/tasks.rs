// Task-related command handlers

use crate::state::AppState;
use crate::types::{DailyTotal, Task};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn update_tasks(app: AppHandle, app_state: State<AppState>, tasks: Vec<Task>) -> Result<(), String> {
    let tasks_changed = app_state.with_tasks_mut(|stored_tasks| {
        let changed = *stored_tasks != tasks;
        *stored_tasks = tasks;
        changed
    })?;

    // The tray menu lists tasks, so it must be rebuilt when they change.
    if tasks_changed {
        if let Err(e) = crate::tray::update_tray_menu(&app, &*app_state) {
            eprintln!("Failed to update tray menu after task change: {:?}", e);
        }
    }
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
