//! Commands on one timer instance: create, edit, start, stop, pause, resume
//! and delete. Each runs its rule from `taskmint_core::sessions::instances`,
//! saves, and announces the change.

use super::change_and_save;
use crate::events::{
    emit_instance_event, TIMER_INSTANCE_DELETED, TIMER_INSTANCE_PAUSED, TIMER_INSTANCE_RESUMED,
    TIMER_INSTANCE_STARTED, TIMER_INSTANCE_STOPPED,
};
use crate::state::AppState;
use chrono::Utc;
use taskmint_core::model::{TaskSession, TimerInstance};
use taskmint_core::sessions::instances::{self, TimerInstanceUpdates};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn create_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<TimerInstance, String> {
    let now = Utc::now();
    change_and_save(&app, &app_state, |sessions| {
        instances::create(sessions, &session_id, now)
    })
}

#[tauri::command]
pub async fn update_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
    updates: TimerInstanceUpdates,
) -> Result<TimerInstance, String> {
    let now = Utc::now();
    change_and_save(&app, &app_state, |sessions| {
        instances::update(sessions, &instance_id, &updates, now)
    })
}

#[tauri::command]
pub async fn start_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let session = change_and_save(&app, &app_state, |sessions| {
        instances::start(sessions, &instance_id, now)
    })?;
    emit_instance_event(&app, TIMER_INSTANCE_STARTED, &instance_id, "startTime", now);
    Ok(session)
}

#[tauri::command]
pub async fn stop_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let session = change_and_save(&app, &app_state, |sessions| {
        instances::stop(sessions, &instance_id, now)
    })?;
    emit_instance_event(&app, TIMER_INSTANCE_STOPPED, &instance_id, "endTime", now);
    Ok(session)
}

#[tauri::command]
pub async fn pause_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let session = change_and_save(&app, &app_state, |sessions| {
        instances::pause(sessions, &instance_id, now)
    })?;
    emit_instance_event(&app, TIMER_INSTANCE_PAUSED, &instance_id, "pausedAt", now);
    Ok(session)
}

#[tauri::command]
pub async fn resume_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let session = change_and_save(&app, &app_state, |sessions| {
        instances::resume(sessions, &instance_id, now)
    })?;
    emit_instance_event(&app, TIMER_INSTANCE_RESUMED, &instance_id, "resumedAt", now);
    Ok(session)
}

#[tauri::command]
pub async fn delete_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let session = change_and_save(&app, &app_state, |sessions| {
        instances::delete(sessions, &instance_id, now)
    })?;
    emit_instance_event(&app, TIMER_INSTANCE_DELETED, &instance_id, "deletedAt", now);
    Ok(session)
}
