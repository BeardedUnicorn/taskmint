// Task-related command handlers

use crate::state::AppState;
use crate::types::Task;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn update_tasks(
    app: AppHandle,
    app_state: State<AppState>,
    tasks: Vec<Task>,
) -> Result<(), String> {
    let tasks_changed = app_state.with_tasks_mut(|stored_tasks| {
        let changed = *stored_tasks != tasks;
        *stored_tasks = tasks;
        changed
    })?;

    // The tray menu lists tasks, so it must be rebuilt when they change.
    if tasks_changed {
        if let Err(e) = crate::tray::update_tray_menu(&app, &app_state) {
            log::error!("Failed to update tray menu after task change: {:?}", e);
        }
    }
    Ok(())
}
