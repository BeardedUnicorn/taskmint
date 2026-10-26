// Task-related command handlers

use crate::events::{emit_quiet, SESSIONS_CHANGED};
use crate::state::AppState;
use crate::storage;
use taskmint_core::model::Task;
use taskmint_core::sessions::task_links::{
    fill_imported_session_rates, fill_missing_session_rates, sync_session_task_names,
};
use taskmint_core::worklogs::sync_work_log_task_names;
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
    //
    // Sessions, ledger entries and mappings also keep a copy of their task's
    // name, which follows a rename here.
    let ledger = app_state.with_work_logs(|work_logs| work_logs.entries.clone())?;
    let (rates_filled, renamed) =
        app_state.with_task_sessions_mut(|sessions| -> Result<(bool, bool), String> {
            let imported = fill_imported_session_rates(sessions, &ledger);
            let rates = fill_missing_session_rates(sessions, &tasks) || imported;
            let renamed = sync_session_task_names(sessions, &tasks);
            if rates || renamed {
                storage::save_sessions(&app, sessions)?;
            }
            Ok((rates, renamed))
        })??;
    if rates_filled {
        log::info!("Filled in hourly rates on sessions that had none");
    }
    if renamed {
        emit_quiet(&app, SESSIONS_CHANGED, ());
    }
    app_state.with_work_logs_mut(|work_logs| -> Result<(), String> {
        if sync_work_log_task_names(&mut work_logs.entries, &mut work_logs.mappings, &tasks) {
            storage::save_work_logs(&app, &work_logs.entries, &work_logs.mappings)?;
        }
        Ok(())
    })??;

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
