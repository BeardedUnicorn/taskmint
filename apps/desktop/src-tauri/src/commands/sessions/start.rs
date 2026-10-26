//! Starting work, and the tray's timer actions.
//!
//! The tray drives sessions directly in Rust (no webview round trip), so it
//! works whatever state the window is in. Each operation emits the same
//! timer-instance events as the instance commands, which the frontend's
//! session context reloads on.

use super::current_task_rate;
use crate::events::{
    emit_instance_event, emit_stopped, TIMER_INSTANCE_PAUSED, TIMER_INSTANCE_RESUMED,
    TIMER_INSTANCE_STARTED,
};
use crate::state::AppState;
use crate::storage;
use chrono::Utc;
use taskmint_core::sessions::start::{
    pause_live_timer, start_task_with_handoff, stop_live_timer, StartTaskResult, TrayStart,
};
use taskmint_core::DayZone;
use tauri::{AppHandle, State};

/// Start a task's timer: mutate, persist, notify. Shared by the start_task
/// command and the tray. Returns the outcome and the hand-off task name.
pub fn start_task_now(
    app: &AppHandle,
    app_state: &AppState,
    task_id: &str,
    task_name: &str,
) -> Result<(TrayStart, Option<String>), String> {
    let now = Utc::now();
    // Read before taking the sessions lock (the two locks are never nested)
    let hourly_rate = current_task_rate(app_state, task_id);
    let (outcome, stopped, handoff) = app_state.with_task_sessions_mut(
        |sessions| -> Result<(TrayStart, Vec<String>, Option<String>), String> {
            let result = start_task_with_handoff(
                sessions,
                task_id,
                task_name,
                hourly_rate,
                now,
                DayZone::Local,
            )?;
            if result.0 != TrayStart::AlreadyRunning {
                storage::save_sessions(app, sessions)?;
            }
            Ok(result)
        },
    )??;

    // Persisted already; emit failures only delay the frontend's refresh.
    emit_stopped(app, &stopped, now);
    match &outcome {
        TrayStart::Started(instance_id) => {
            emit_instance_event(app, TIMER_INSTANCE_STARTED, instance_id, "startTime", now);
        }
        TrayStart::Resumed(instance_id) => {
            emit_instance_event(app, TIMER_INSTANCE_RESUMED, instance_id, "resumedAt", now);
        }
        TrayStart::AlreadyRunning => {}
    }
    Ok((outcome, handoff))
}

/// Start (or continue) work on an existing task: the app's single start path,
/// with the same semantics as the tray's Start submenu.
#[tauri::command]
pub fn start_task(
    app: AppHandle,
    app_state: State<'_, AppState>,
    task_id: String,
    task_name: String,
) -> Result<StartTaskResult, String> {
    let task_id = task_id.trim();
    let task_name = task_name.trim();
    if task_id.is_empty() || task_name.is_empty() {
        return Err("Choose a task to start".to_string());
    }
    let (outcome, handoff) = start_task_now(&app, &app_state, task_id, task_name)?;
    crate::tray::sync_tray(&app, &app_state);
    Ok(StartTaskResult::new(outcome, handoff))
}

/// Tray entry point for Pause: pause the running timer, persist, notify.
pub fn tray_pause_timer(app: &AppHandle, app_state: &AppState) -> Result<Option<String>, String> {
    let now = Utc::now();
    let paused =
        app_state.with_task_sessions_mut(|sessions| -> Result<Option<String>, String> {
            let paused = pause_live_timer(sessions, now);
            if paused.is_some() {
                storage::save_sessions(app, sessions)?;
            }
            Ok(paused)
        })??;
    if let Some(instance_id) = &paused {
        emit_instance_event(app, TIMER_INSTANCE_PAUSED, instance_id, "pausedAt", now);
    }
    Ok(paused)
}

/// Tray entry point for Stop: finalize the live timer, persist, notify.
pub fn tray_stop_timer(app: &AppHandle, app_state: &AppState) -> Result<Option<String>, String> {
    let now = Utc::now();
    let stopped =
        app_state.with_task_sessions_mut(|sessions| -> Result<Option<String>, String> {
            let stopped = stop_live_timer(sessions, now);
            if stopped.is_some() {
                storage::save_sessions(app, sessions)?;
            }
            Ok(stopped)
        })??;
    if let Some(instance_id) = &stopped {
        emit_stopped(app, std::slice::from_ref(instance_id), now);
    }
    Ok(stopped)
}
