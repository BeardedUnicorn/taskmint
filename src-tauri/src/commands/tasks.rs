// Task-related command handlers

use crate::commands::sessions::{fill_imported_session_rates, fill_missing_session_rates};
use crate::state::AppState;
use crate::storage;
use crate::types::Task;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn update_tasks(
    app: AppHandle,
    app_state: State<AppState>,
    tasks: Vec<Task>,
) -> Result<(), String> {
    // Sessions without a rate (from older builds, or tracked before the task
    // had one) get one: imported days the rate the site's pay implies, others
    // the task's current rate. Sessions keep the rate they were given, so
    // later rate changes never rewrite past earnings.
    let ledger = app_state.with_work_logs(|work_logs| work_logs.entries.clone())?;
    let rates_filled = app_state.with_task_sessions_mut(|sessions| -> Result<bool, String> {
        let imported = fill_imported_session_rates(sessions, &ledger);
        let changed = fill_missing_session_rates(sessions, &tasks) || imported;
        if changed {
            storage::save_sessions(&app, sessions)?;
        }
        Ok(changed)
    })??;
    if rates_filled {
        log::info!("Filled in hourly rates on sessions that had none");
    }

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
