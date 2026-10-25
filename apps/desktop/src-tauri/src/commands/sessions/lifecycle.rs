//! Commands on whole sessions: list, edit, delete, activate, and move a
//! finished timer to another task.

use super::task_links::task_rate;
use super::timer::{
    ensure_not_imported, instance_not_found, local_day, new_task_session,
    recalculate_total_duration, session_not_found, stop_active_instances,
};
use crate::events::{emit_quiet, emit_stopped, SESSIONS_CHANGED};
use crate::state::AppState;
use crate::storage;
use crate::types::TaskSession;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_sessions(app_state: State<'_, AppState>) -> Result<Vec<TaskSession>, String> {
    app_state.with_task_sessions(|sessions| sessions.clone())
}

/// Session fields the frontend may patch. camelCase to match the TS
/// `Partial<TaskSession>` shape; snake_case aliases keep old callers working.
/// The task name isn't one: it follows the task (`sync_session_task_names`),
/// and moving time to another task is `move_timer_instance`.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdates {
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default, alias = "is_active")]
    pub is_active: Option<bool>,
}

#[tauri::command]
pub async fn update_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
    updates: SessionUpdates,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
        let updated_session = {
            let session = sessions
                .iter_mut()
                .find(|s| s.id == session_id)
                .ok_or_else(|| session_not_found(&session_id))?;

            if let Some(notes) = updates.notes.as_ref() {
                session.notes = Some(notes.clone());
            }
            if let Some(is_active) = updates.is_active {
                session.is_active = is_active;
            }
            session.updated_at = now.to_rfc3339();
            session.clone()
        };

        storage::save_sessions(&app, sessions)?;
        Ok(updated_session)
    })?
}

/// Clears the plain-text notes of the given sessions; returns how many had
/// text. Session notes now live in the app's notes store, which copies the
/// text first (see `sessionNotesToTaskNotes`), so this is the second half of
/// that move.
pub fn clear_notes(sessions: &mut [TaskSession], session_ids: &[String]) -> usize {
    let mut cleared = 0;
    for session in sessions.iter_mut() {
        if !session_ids.contains(&session.id) {
            continue;
        }
        if session.notes.take().is_some_and(|n| !n.is_empty()) {
            cleared += 1;
        }
    }
    cleared
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

/// Move one finished timer to another task: the time keeps its start and
/// duration, and earns at the new task's rate. A timer that is its session's
/// only one (in an inactive session) re-points the session; otherwise it
/// moves into a new inactive session for the task, dated by the day the timer
/// started, and an inactive session it leaves empty is removed. Returns the
/// session the timer ends up in, and whether anything changed.
pub fn move_instance_to_task(
    sessions: &mut Vec<TaskSession>,
    instance_id: &str,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<(String, bool), String> {
    let index = sessions
        .iter()
        .position(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
        .ok_or_else(|| instance_not_found(instance_id))?;
    let session = &mut sessions[index];
    ensure_not_imported(session)?;
    let position = session
        .timer_instances
        .iter()
        .position(|i| i.id == instance_id)
        .ok_or_else(|| instance_not_found(instance_id))?;
    let instance = &session.timer_instances[position];
    if instance.is_running || instance.is_paused {
        return Err("Stop this timer before moving it to another task".to_string());
    }
    if instance.duration.is_none() {
        return Err("This timer hasn't tracked any time yet".to_string());
    }
    if session.task_id == task_id {
        return Ok((session.id.clone(), false));
    }

    if session.timer_instances.len() == 1 && !session.is_active {
        session.task_id = task_id.to_string();
        session.task_name = task_name.to_string();
        session.hourly_rate = hourly_rate;
        session.updated_at = now.to_rfc3339();
        return Ok((session.id.clone(), true));
    }

    let mut instance = session.timer_instances.remove(position);
    recalculate_total_duration(session);
    session.updated_at = now.to_rfc3339();
    let source = session.source.clone();
    let left_empty = session.timer_instances.is_empty()
        && !session.is_active
        && session.notes.as_deref().is_none_or(|n| n.trim().is_empty());
    if left_empty {
        sessions.remove(index);
    }

    let mut moved = new_task_session(task_id.to_string(), task_name.to_string(), hourly_rate, now);
    moved.is_active = false;
    moved.source = source;
    moved.date = local_day(instance.start_time);
    instance.session_id = moved.id.clone();
    instance.updated_at = now.to_rfc3339();
    moved.timer_instances.push(instance);
    recalculate_total_duration(&mut moved);
    let moved_id = moved.id.clone();
    sessions.push(moved);
    Ok((moved_id, true))
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
    let hourly_rate = task_rate(&app_state, task_id);
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

    let (updated_sessions, stopped_instance_ids) = app_state.with_task_sessions_mut(
        |sessions| -> Result<(Vec<TaskSession>, Vec<String>), String> {
            if let Some(id) = &session_id {
                let target = sessions
                    .iter()
                    .find(|s| &s.id == id)
                    .ok_or_else(|| session_not_found(id))?;
                ensure_not_imported(target)?;
            }
            let mut stopped = Vec::new();
            for session in sessions.iter_mut() {
                let should_be_active = match &session_id {
                    Some(id) => &session.id == id,
                    None => false,
                };
                if session.is_active && !should_be_active {
                    stopped.extend(stop_active_instances(session, now));
                }
                session.is_active = should_be_active;
            }

            storage::save_sessions(&app, sessions)?;
            Ok((sessions.clone(), stopped))
        },
    )??;

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
