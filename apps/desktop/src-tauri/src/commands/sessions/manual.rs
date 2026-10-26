//! "Add time": finished timers logged after the fact
//! (`taskmint_core::sessions::manual`).

use super::{change_and_save, current_task_rate};
use crate::events::emit_stopped;
use crate::state::AppState;
use chrono::{DateTime, Utc};
use taskmint_core::model::TaskSession;
use taskmint_core::sessions::manual::{build_manual_session, ManualEntry};
use taskmint_core::DayZone;
use tauri::{AppHandle, State};

/// Log time after the fact ("Add time"): a finished timer in its own session
/// on the day it started.
#[tauri::command]
pub fn add_manual_time(
    app: AppHandle,
    app_state: State<'_, AppState>,
    task_id: String,
    task_name: String,
    start_time: String,
    duration_ms: u64,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let start = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| format!("Invalid start time: {}", e))?
        .with_timezone(&Utc);
    let entry = ManualEntry {
        task_id: task_id.trim(),
        task_name: task_name.trim(),
        hourly_rate: current_task_rate(&app_state, task_id.trim()),
        start,
        duration_ms,
    };

    let session = change_and_save(&app, &app_state, |sessions| {
        let session = build_manual_session(sessions, &entry, now, DayZone::Local)?;
        sessions.push(session.clone());
        Ok(session)
    })?;

    // Persisted already; the event only prompts listeners to reload.
    if let Some(instance) = session.timer_instances.first() {
        emit_stopped(&app, std::slice::from_ref(&instance.id), now);
    }
    Ok(session)
}
