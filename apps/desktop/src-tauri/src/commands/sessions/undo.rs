//! Undo for deletes: delete_session returns what it removed, and the restore
//! commands put a deleted session, or one deleted timer, back. The checks
//! are in `taskmint_core::sessions::undo`.

use super::change_and_save;
use crate::events::{emit_quiet, emit_stopped, SESSIONS_CHANGED};
use crate::state::AppState;
use chrono::Utc;
use taskmint_core::model::{TaskSession, TimerInstance};
use taskmint_core::sessions::undo::{remove_session, restore_instance_into, restore_session_into};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn delete_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let (removed, stopped) = change_and_save(&app, &app_state, |sessions| {
        remove_session(sessions, &session_id, now)
    })?;

    emit_stopped(&app, &stopped, now);
    emit_quiet(&app, SESSIONS_CHANGED, ());
    Ok(removed)
}

#[tauri::command]
pub async fn restore_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session: TaskSession,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let restored = change_and_save(&app, &app_state, |sessions| {
        restore_session_into(sessions, session, now)
    })?;

    emit_quiet(&app, SESSIONS_CHANGED, ());
    Ok(restored)
}

#[tauri::command]
pub async fn restore_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
    instance: TimerInstance,
    index: Option<usize>,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let restored = change_and_save(&app, &app_state, |sessions| {
        restore_instance_into(sessions, &session_id, instance, index, now)
    })?;

    emit_quiet(&app, SESSIONS_CHANGED, ());
    Ok(restored)
}
