//! Commands on whole sessions: list, edit, clear notes, activate, and move a
//! finished timer to another task. The rules are in
//! `taskmint_core::sessions::lifecycle`.

use super::{change_and_save, current_task_rate};
use crate::events::{emit_quiet, emit_stopped, SESSIONS_CHANGED};
use crate::state::AppState;
use crate::storage;
use chrono::Utc;
use taskmint_core::model::TaskSession;
use taskmint_core::sessions::lifecycle::{
    self, clear_notes, move_instance_to_task, SessionUpdates,
};
use taskmint_core::DayZone;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_sessions(app_state: State<'_, AppState>) -> Result<Vec<TaskSession>, String> {
    app_state.with_task_sessions(|sessions| sessions.clone())
}

#[tauri::command]
pub async fn update_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
    updates: SessionUpdates,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    change_and_save(&app, &app_state, |sessions| {
        lifecycle::update_session(sessions, &session_id, &updates, now)
    })
}

#[tauri::command]
pub fn clear_session_notes(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_ids: Vec<String>,
) -> Result<usize, String> {
    app_state.with_task_sessions_mut(|sessions| -> Result<usize, String> {
        let cleared = clear_notes(sessions, &session_ids);
        if cleared > 0 {
            storage::save_sessions(&app, sessions)?;
        }
        Ok(cleared)
    })?
}

#[tauri::command]
pub fn move_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
    task_id: String,
    task_name: String,
) -> Result<String, String> {
    let task_id = task_id.trim();
    let task_name = task_name.trim();
    if task_id.is_empty() || task_name.is_empty() {
        return Err("Choose a task to move this time to".to_string());
    }
    let known = app_state.with_tasks(|tasks| tasks.iter().any(|t| t.id == task_id))?;
    if !known {
        return Err("That task no longer exists".to_string());
    }
    // Read before taking the sessions lock (the two locks are never nested)
    let hourly_rate = current_task_rate(&app_state, task_id);
    let now = Utc::now();
    let (session_id, changed) =
        app_state.with_task_sessions_mut(|sessions| -> Result<(String, bool), String> {
            let result = move_instance_to_task(
                sessions,
                &instance_id,
                task_id,
                task_name,
                hourly_rate,
                now,
                DayZone::Local,
            )?;
            if result.1 {
                storage::save_sessions(&app, sessions)?;
            }
            Ok(result)
        })??;
    if changed {
        emit_quiet(&app, SESSIONS_CHANGED, ());
    }
    Ok(session_id)
}

#[tauri::command]
pub async fn set_active_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<Vec<TaskSession>, String> {
    let now = Utc::now();
    let (updated_sessions, stopped_instance_ids) = change_and_save(&app, &app_state, |sessions| {
        let stopped = lifecycle::set_active_session(sessions, session_id.as_deref(), now)?;
        Ok((sessions.clone(), stopped))
    })?;

    emit_stopped(&app, &stopped_instance_ids, now);

    Ok(updated_sessions)
}

/// Non-fatal problems from the startup sessions load (skipped records or a
/// full load failure). The frontend fetches this once and shows it to the
/// user instead of the data silently vanishing.
#[tauri::command]
pub fn get_session_load_warning(app_state: State<'_, AppState>) -> Result<Option<String>, String> {
    app_state.with_session_load_warning(|warning| warning.clone())
}
