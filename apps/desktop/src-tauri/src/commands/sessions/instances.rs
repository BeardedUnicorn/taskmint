//! Commands on one timer instance: create, edit, start, stop, pause, resume
//! and delete. Each finds the instance's session, applies one transition from
//! `timer`, saves, and announces the change.

use super::timer::{
    begin_instance, ensure_not_imported, ensure_stoppable, finalize_instance, instance_not_found,
    new_timer_instance, pause_instance, recalculate_total_duration, resume_instance,
    session_not_found, validate_start, MAX_TIMER_INSTANCES_PER_SESSION,
};
use crate::events::{
    emit_instance_event, TIMER_INSTANCE_DELETED, TIMER_INSTANCE_PAUSED, TIMER_INSTANCE_RESUMED,
    TIMER_INSTANCE_STARTED, TIMER_INSTANCE_STOPPED,
};
use crate::state::AppState;
use crate::storage;
use crate::types::{TaskSession, TimerInstance};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use tauri::{AppHandle, State};

/// Find the session holding `instance_id`, let `change` modify it, then stamp
/// it, recalculate its total and save, all under the sessions lock. `change`
/// gets the session, the instance's index in it, and whether some other timer
/// (in any session) is running. Imported sessions are refused: they change
/// only by importing. Returns the saved session and `change`'s result.
pub(super) fn mutate_instance<R>(
    app: &AppHandle,
    app_state: &AppState,
    instance_id: &str,
    now: DateTime<Utc>,
    change: impl FnOnce(&mut TaskSession, usize, bool) -> Result<R, String>,
) -> Result<(TaskSession, R), String> {
    app_state.with_task_sessions_mut(|sessions| -> Result<(TaskSession, R), String> {
        let another_running = sessions
            .iter()
            .flat_map(|s| s.timer_instances.iter())
            .any(|i| i.is_running && i.id != instance_id);
        let session = sessions
            .iter_mut()
            .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
            .ok_or_else(|| instance_not_found(instance_id))?;
        ensure_not_imported(session)?;
        let index = session
            .timer_instances
            .iter()
            .position(|i| i.id == instance_id)
            .ok_or_else(|| instance_not_found(instance_id))?;

        let result = change(session, index, another_running)?;
        session.updated_at = now.to_rfc3339();
        recalculate_total_duration(session);
        let saved = session.clone();

        storage::save_sessions(app, sessions)?;
        Ok((saved, result))
    })?
}

#[tauri::command]
pub async fn create_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<TimerInstance, String> {
    let now = Utc::now();

    let new_instance = new_timer_instance(&session_id, now);

    app_state.with_task_sessions_mut(|sessions| -> Result<(), String> {
        {
            let session = sessions
                .iter_mut()
                .find(|s| s.id == session_id)
                .ok_or_else(|| session_not_found(&session_id))?;
            ensure_not_imported(session)?;

            if session.timer_instances.len() >= MAX_TIMER_INSTANCES_PER_SESSION {
                return Err(format!(
                    "Maximum number of timers ({}) reached for this session",
                    MAX_TIMER_INSTANCES_PER_SESSION
                ));
            }

            session.timer_instances.push(new_instance.clone());
            session.updated_at = now.to_rfc3339();
        }

        storage::save_sessions(&app, sessions)
    })??;

    Ok(new_instance)
}

/// Timer-instance fields the frontend may patch. camelCase with snake_case
/// aliases, same as `SessionUpdates`.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerInstanceUpdates {
    #[serde(default, alias = "is_running")]
    pub is_running: Option<bool>,
    #[serde(default, alias = "is_paused")]
    pub is_paused: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub duration: Option<u64>,
    #[serde(default, alias = "resumed_at")]
    pub resumed_at: Option<String>,
    #[serde(default, alias = "start_time")]
    pub start_time: Option<String>,
    #[serde(default, alias = "end_time")]
    pub end_time: Option<String>,
}

/// Patches may only clear the running/paused flags (the finalization shape
/// every edit save sends). Raising them here would bypass the start/pause
/// commands' invariants — the single-running-timer check, the start-time and
/// pause-bookkeeping resets, and the event emission every listener syncs on.
pub(super) fn validate_timer_instance_updates(
    updates: &TimerInstanceUpdates,
) -> Result<(), String> {
    if updates.is_running == Some(true) {
        return Err("Cannot set a timer running via update; use start_timer_instance".to_string());
    }
    if updates.is_paused == Some(true) {
        return Err("Cannot pause a timer via update; use pause_timer_instance".to_string());
    }
    Ok(())
}

/// Deletion is only valid for instances with no live state: deleting a
/// running timer would leave the global running slot untracked, and deleting
/// a paused one silently discards its tracked-but-unrecorded time.
pub(crate) fn ensure_deletable(instance: &TimerInstance) -> Result<(), String> {
    if instance.is_running {
        return Err("Cannot delete a running timer; stop it first".to_string());
    }
    if instance.is_paused {
        return Err("Cannot delete a paused timer; stop it first".to_string());
    }
    Ok(())
}

pub(super) fn parse_rfc3339(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid timestamp '{}': {}", value, e))
}

/// Apply pre-parsed patch fields to a timer instance. A patch that clears
/// both flags finalizes the instance (the shape every edit save sends), so
/// stale pause bookkeeping is cleared too — the same finalization contract as
/// `stop_timer_instance` and `stop_running_instances`.
pub(super) fn apply_timer_instance_updates(
    instance: &mut TimerInstance,
    updates: &TimerInstanceUpdates,
    resumed_at: Option<DateTime<Utc>>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) {
    if let Some(is_running) = updates.is_running {
        instance.is_running = is_running;
    }
    if let Some(is_paused) = updates.is_paused {
        instance.is_paused = is_paused;
    }
    if let Some(notes) = updates.notes.as_ref() {
        instance.notes = Some(notes.clone());
    }
    if let Some(duration) = updates.duration {
        instance.duration = Some(duration);
    }
    if let Some(resumed_at) = resumed_at {
        instance.resumed_at = Some(resumed_at);
    }
    if let Some(start_time) = start_time {
        instance.start_time = start_time;
    }
    if let Some(end_time) = end_time {
        instance.end_time = Some(end_time);
    }
    if updates.is_running == Some(false) && updates.is_paused == Some(false) {
        instance.paused_at = None;
        instance.resumed_at = None;
    }
    instance.updated_at = now.to_rfc3339();
}

#[tauri::command]
pub async fn update_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
    updates: TimerInstanceUpdates,
) -> Result<TimerInstance, String> {
    let now = Utc::now();

    // Validate and parse up front so a bad payload fails before any mutation.
    validate_timer_instance_updates(&updates)?;
    let resumed_at = updates
        .resumed_at
        .as_deref()
        .map(parse_rfc3339)
        .transpose()?;
    let start_time = updates
        .start_time
        .as_deref()
        .map(parse_rfc3339)
        .transpose()?;
    let end_time = updates.end_time.as_deref().map(parse_rfc3339).transpose()?;

    let (_, instance) =
        mutate_instance(&app, &app_state, &instance_id, now, |session, index, _| {
            let instance = &mut session.timer_instances[index];
            apply_timer_instance_updates(instance, &updates, resumed_at, start_time, end_time, now);
            Ok(instance.clone())
        })?;
    Ok(instance)
}

#[tauri::command]
pub async fn start_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let (session, _) = mutate_instance(
        &app,
        &app_state,
        &instance_id,
        now,
        |session, index, another_running| {
            let session_is_active = session.is_active;
            let instance = &mut session.timer_instances[index];
            validate_start(instance, session_is_active, another_running)?;
            begin_instance(instance, now);
            Ok(())
        },
    )?;
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
    let (session, _) =
        mutate_instance(&app, &app_state, &instance_id, now, |session, index, _| {
            let instance = &mut session.timer_instances[index];
            ensure_stoppable(instance)?;
            finalize_instance(instance, now);
            Ok(())
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
    let (session, _) =
        mutate_instance(&app, &app_state, &instance_id, now, |session, index, _| {
            let instance = &mut session.timer_instances[index];
            if !instance.is_running {
                return Err("Cannot pause timer: timer is not running".to_string());
            }
            pause_instance(instance, now);
            Ok(())
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
    let (session, _) = mutate_instance(
        &app,
        &app_state,
        &instance_id,
        now,
        |session, index, another_running| {
            // Resume re-enters the running state, so it must uphold the same
            // invariants as start: one running timer at a time, active session
            // only ("Resume All" would otherwise set several timers running and
            // double-count the same wall-clock time).
            let session_is_active = session.is_active;
            let instance = &mut session.timer_instances[index];
            if !instance.is_paused {
                return Err("Cannot resume timer: timer is not paused".to_string());
            }
            if !session_is_active {
                return Err("Cannot resume timer for inactive session".to_string());
            }
            if another_running {
                return Err("Another timer instance is already running".to_string());
            }
            resume_instance(instance, now);
            Ok(())
        },
    )?;
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
    let (session, _) =
        mutate_instance(&app, &app_state, &instance_id, now, |session, index, _| {
            ensure_deletable(&session.timer_instances[index])?;
            session.timer_instances.remove(index);
            Ok(())
        })?;
    emit_instance_event(&app, TIMER_INSTANCE_DELETED, &instance_id, "deletedAt", now);
    Ok(session)
}
