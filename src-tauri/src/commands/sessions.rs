// Session-related command handlers

use crate::state::AppState;
use crate::storage;
use crate::types::{TaskSession, TimerInstance};
use chrono::{DateTime, Local, Utc};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub(crate) const MAX_TIMER_INSTANCES_PER_SESSION: usize = 50;

fn new_session_id() -> String {
    format!("session_{}", Uuid::new_v4())
}

fn new_instance_id() -> String {
    format!("instance_{}", Uuid::new_v4())
}

/// Net tracked duration for a run that ends at `now`, together with the final
/// accumulated pause total. `active_pause_started_at` covers a stop issued
/// while the timer is still paused.
fn compute_final_duration(
    start_time: DateTime<Utc>,
    accumulated_paused_ms: u64,
    active_pause_started_at: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> (u64, u64) {
    let total_elapsed = now.timestamp_millis() - start_time.timestamp_millis();
    let mut total_paused = accumulated_paused_ms as i64;
    if let Some(paused_at) = active_pause_started_at {
        total_paused += now.timestamp_millis() - paused_at.timestamp_millis();
    }
    let total_paused = total_paused.max(0);
    ((total_elapsed - total_paused).max(0) as u64, total_paused as u64)
}

/// A timer instance may only be started when it has never run: a completed
/// instance is final (create a new instance to keep working). The error
/// strings for the inactive-session and concurrent-run cases are matched by
/// the frontend's automatic recovery in useSessionManagement.
fn validate_start(
    instance: &TimerInstance,
    session_is_active: bool,
    another_running: bool,
) -> Result<(), String> {
    if instance.is_running {
        return Err("Timer instance is already running".to_string());
    }
    if instance.is_paused {
        return Err("Cannot start a paused timer; resume it instead".to_string());
    }
    if instance.duration.is_some() || instance.end_time.is_some() {
        return Err("Timer instance has already completed; create a new timer instead".to_string());
    }
    if !session_is_active {
        return Err("Cannot start timer for inactive session".to_string());
    }
    if another_running {
        return Err("Another timer instance is already running".to_string());
    }
    Ok(())
}

pub(crate) fn recalculate_total_duration(session: &mut TaskSession) {
    session.total_duration = session
        .timer_instances
        .iter()
        .filter_map(|i| i.duration)
        .sum();
}

/// Finalize one running or paused instance with the same math as
/// `stop_timer_instance`: clear the state flags, stamp `end_time`, and store
/// the net duration. A live pause stretch is folded into `paused_duration`,
/// preserving the invariant duration = endTime - startTime - pausedDuration
/// that the frontend's edit math inverts.
fn finalize_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    let was_paused = instance.is_paused;
    let paused_at = instance.paused_at;

    instance.is_running = false;
    instance.is_paused = false;
    instance.resumed_at = None;
    instance.paused_at = None;
    instance.end_time = Some(now);

    let (duration, total_paused) = compute_final_duration(
        instance.start_time,
        instance.paused_duration.unwrap_or(0),
        if was_paused { paused_at } else { None },
        now,
    );
    instance.duration = Some(duration);
    instance.paused_duration = Some(total_paused);
    instance.updated_at = now.to_rfc3339();
}

/// Deactivating a session must not leave a running timer accruing time where
/// no UI surface can reach it (every control operates on the active session
/// only), nor a paused timer stranded (resume is rejected in inactive
/// sessions, so its tracked time would never be recorded). Finalize both, a
/// paused instance freezing at its pause point. Returns the finalized
/// instance ids so the caller can emit `timer-instance-stopped` after the
/// lock is released.
pub(crate) fn stop_active_instances(session: &mut TaskSession, now: DateTime<Utc>) -> Vec<String> {
    let mut stopped = Vec::new();
    for instance in session.timer_instances.iter_mut() {
        if instance.is_running || instance.is_paused {
            finalize_instance(instance, now);
            stopped.push(instance.id.clone());
        }
    }
    if !stopped.is_empty() {
        session.updated_at = now.to_rfc3339();
        recalculate_total_duration(session);
    }
    stopped
}

/// Startup repair for data written by older builds, which left paused timers
/// stranded in deactivated sessions (unreachable and unresumable there).
/// Finalizes running/paused instances in every inactive session. Idempotent:
/// a second run finds nothing to repair. Returns the number of instances
/// finalized.
pub fn finalize_stranded_instances(sessions: &mut [TaskSession], now: DateTime<Utc>) -> usize {
    let mut finalized = 0;
    for session in sessions.iter_mut() {
        if !session.is_active {
            finalized += stop_active_instances(session, now).len();
        }
    }
    finalized
}

/// Emit `timer-instance-stopped` for instances stopped as a side effect of a
/// deactivation. The stop is already persisted, so an emit failure must not
/// fail the command.
fn emit_stopped_events(app: &AppHandle, instance_ids: &[String], now: DateTime<Utc>) {
    for instance_id in instance_ids {
        let _ = app.emit(
            "timer-instance-stopped",
            serde_json::json!({
                "instanceId": instance_id,
                "endTime": now.to_rfc3339()
            }),
        );
    }
}

#[tauri::command]
pub fn create_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    task_id: String,
    task_name: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    let new_session = TaskSession {
        id: new_session_id(),
        task_id,
        task_name,
        timer_instances: Vec::new(),
        total_duration: 0,
        notes: None,
        is_active: true,
        source: None,
        // Local day, not UTC: the dashboard's today-filter and the calendar
        // compare this string against the user's local date.
        date: Local::now().format("%Y-%m-%d").to_string(),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    };

    let stopped_instance_ids = app_state.with_task_sessions_mut(|sessions| -> Result<Vec<String>, String> {
        let mut stopped = Vec::new();
        for session in sessions.iter_mut() {
            if session.is_active {
                stopped.extend(stop_active_instances(session, now));
            }
            session.is_active = false;
        }
        sessions.push(new_session.clone());
        storage::save_sessions(&app, sessions)?;
        Ok(stopped)
    })??;

    emit_stopped_events(&app, &stopped_instance_ids, now);

    Ok(new_session)
}

#[tauri::command]
pub fn get_sessions(app_state: State<'_, AppState>) -> Result<Vec<TaskSession>, String> {
    app_state.with_task_sessions(|sessions| sessions.clone())
}

/// Session fields the frontend may patch. camelCase to match the TS
/// `Partial<TaskSession>` shape; snake_case aliases keep old callers working.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdates {
    #[serde(default, alias = "task_name")]
    pub task_name: Option<String>,
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
                .ok_or_else(|| format!("Session with ID {} not found", session_id))?;

            if let Some(task_name) = updates.task_name.as_ref() {
                session.task_name = task_name.clone();
            }
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

#[tauri::command]
pub async fn delete_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    app_state.with_task_sessions_mut(|sessions| -> Result<(), String> {
        let initial_len = sessions.len();
        sessions.retain(|s| s.id != session_id);

        if sessions.len() == initial_len {
            return Err(format!("Session with ID {} not found", session_id));
        }

        storage::save_sessions(&app, sessions)
    })??;

    Ok(())
}

#[tauri::command]
pub async fn create_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<TimerInstance, String> {
    let now = Utc::now();

    let new_instance = TimerInstance {
        id: new_instance_id(),
        session_id: session_id.clone(),
        start_time: now,
        end_time: None,
        duration: None,
        is_running: false,
        is_paused: false,
        paused_at: None,
        paused_duration: None,
        resumed_at: None,
        external_id: None,
        notes: None,
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    };

    app_state.with_task_sessions_mut(|sessions| -> Result<(), String> {
        {
            let session = sessions
                .iter_mut()
                .find(|s| s.id == session_id)
                .ok_or_else(|| format!("Session with ID {} not found", session_id))?;

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
fn validate_timer_instance_updates(updates: &TimerInstanceUpdates) -> Result<(), String> {
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
fn ensure_deletable(instance: &TimerInstance) -> Result<(), String> {
    if instance.is_running {
        return Err("Cannot delete a running timer; stop it first".to_string());
    }
    if instance.is_paused {
        return Err("Cannot delete a paused timer; stop it first".to_string());
    }
    Ok(())
}

fn parse_rfc3339(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid timestamp '{}': {}", value, e))
}

/// Apply pre-parsed patch fields to a timer instance. A patch that clears
/// both flags finalizes the instance (the shape every edit save sends), so
/// stale pause bookkeeping is cleared too — the same finalization contract as
/// `stop_timer_instance` and `stop_running_instances`.
fn apply_timer_instance_updates(
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
    let resumed_at = updates.resumed_at.as_deref().map(parse_rfc3339).transpose()?;
    let start_time = updates.start_time.as_deref().map(parse_rfc3339).transpose()?;
    let end_time = updates.end_time.as_deref().map(parse_rfc3339).transpose()?;

    app_state.with_task_sessions_mut(|sessions| -> Result<TimerInstance, String> {
        let updated_instance = {
            let session = sessions
                .iter_mut()
                .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

            {
                let instance = session
                    .timer_instances
                    .iter_mut()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

                apply_timer_instance_updates(
                    instance, &updates, resumed_at, start_time, end_time, now,
                );
            }

            session.updated_at = now.to_rfc3339();
            recalculate_total_duration(session);

            session
                .timer_instances
                .iter()
                .find(|i| i.id == instance_id)
                .cloned()
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?
        };

        storage::save_sessions(&app, sessions)?;
        Ok(updated_instance)
    })?
}

#[tauri::command]
pub async fn start_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    let updated_session = app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
        let another_running = sessions
            .iter()
            .flat_map(|s| s.timer_instances.iter())
            .any(|i| i.is_running && i.id != instance_id);

        let result = {
            let session = sessions
                .iter_mut()
                .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;
            let session_is_active = session.is_active;

            {
                let instance = session
                    .timer_instances
                    .iter_mut()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

                validate_start(instance, session_is_active, another_running)?;

                instance.is_running = true;
                instance.is_paused = false;
                instance.start_time = now;
                instance.resumed_at = Some(now);
                instance.paused_duration = Some(0);
                instance.updated_at = now.to_rfc3339();
            }

            session.updated_at = now.to_rfc3339();
            session.clone()
        };

        storage::save_sessions(&app, sessions)?;
        Ok(result)
    })??;

    app.emit(
        "timer-instance-started",
        serde_json::json!({
            "instanceId": instance_id,
            "startTime": now.to_rfc3339()
        }),
    )
    .map_err(|e| format!("Failed to emit timer instance started event: {}", e))?;

    Ok(updated_session)
}

#[tauri::command]
pub async fn stop_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    let updated_session = app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
        let result = {
            let session = sessions
                .iter_mut()
                .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

            {
                let instance = session
                    .timer_instances
                    .iter_mut()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

                if !instance.is_running && !instance.is_paused {
                    return Err("Cannot stop timer: timer is not running".to_string());
                }

                finalize_instance(instance, now);
            }

            session.updated_at = now.to_rfc3339();
            recalculate_total_duration(session);
            session.clone()
        };

        storage::save_sessions(&app, sessions)?;
        Ok(result)
    })??;

    app.emit(
        "timer-instance-stopped",
        serde_json::json!({
            "instanceId": instance_id,
            "endTime": now.to_rfc3339()
        }),
    )
    .map_err(|e| format!("Failed to emit timer instance stopped event: {}", e))?;

    Ok(updated_session)
}

#[tauri::command]
pub async fn pause_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    let updated_session = app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
        let result = {
            let session = sessions
                .iter_mut()
                .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

            {
                let instance = session
                    .timer_instances
                    .iter_mut()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

                if !instance.is_running {
                    return Err("Cannot pause timer: timer is not running".to_string());
                }

                instance.is_running = false;
                instance.is_paused = true;
                instance.paused_at = Some(now);
                instance.updated_at = now.to_rfc3339();
            }

            session.updated_at = now.to_rfc3339();
            session.clone()
        };

        storage::save_sessions(&app, sessions)?;
        Ok(result)
    })??;

    app.emit(
        "timer-instance-paused",
        serde_json::json!({
            "instanceId": instance_id,
            "pausedAt": now.to_rfc3339()
        }),
    )
    .map_err(|e| format!("Failed to emit timer instance paused event: {}", e))?;

    Ok(updated_session)
}

#[tauri::command]
pub async fn resume_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    let updated_session = app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
        // Resume re-enters the running state, so it must uphold the same
        // invariants as start: one running timer at a time, active session
        // only ("Resume All" would otherwise set several timers running and
        // double-count the same wall-clock time).
        let another_running = sessions
            .iter()
            .flat_map(|s| s.timer_instances.iter())
            .any(|i| i.is_running && i.id != instance_id);

        let result = {
            let session = sessions
                .iter_mut()
                .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;
            let session_is_active = session.is_active;

            {
                let instance = session
                    .timer_instances
                    .iter_mut()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

                if !instance.is_paused {
                    return Err("Cannot resume timer: timer is not paused".to_string());
                }
                if !session_is_active {
                    return Err("Cannot resume timer for inactive session".to_string());
                }
                if another_running {
                    return Err("Another timer instance is already running".to_string());
                }

                if let Some(paused_at) = instance.paused_at {
                    let pause_duration =
                        (now.timestamp_millis() - paused_at.timestamp_millis()).max(0) as u64;
                    instance.paused_duration =
                        Some(instance.paused_duration.unwrap_or(0) + pause_duration);
                }

                instance.is_running = true;
                instance.is_paused = false;
                instance.paused_at = None;
                instance.resumed_at = Some(now);
                instance.updated_at = now.to_rfc3339();
            }

            session.updated_at = now.to_rfc3339();
            session.clone()
        };

        storage::save_sessions(&app, sessions)?;
        Ok(result)
    })??;

    app.emit(
        "timer-instance-resumed",
        serde_json::json!({
            "instanceId": instance_id,
            "resumedAt": now.to_rfc3339()
        }),
    )
    .map_err(|e| format!("Failed to emit timer instance resumed event: {}", e))?;

    Ok(updated_session)
}

#[tauri::command]
pub async fn delete_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();

    let updated_session = app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
        let result = {
            let session = sessions
                .iter_mut()
                .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
                .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;

            {
                let instance = session
                    .timer_instances
                    .iter()
                    .find(|i| i.id == instance_id)
                    .ok_or_else(|| format!("Timer instance with ID {} not found", instance_id))?;
                ensure_deletable(instance)?;
            }

            session.timer_instances.retain(|i| i.id != instance_id);
            session.updated_at = now.to_rfc3339();
            recalculate_total_duration(session);
            session.clone()
        };

        storage::save_sessions(&app, sessions)?;
        Ok(result)
    })??;

    app.emit(
        "timer-instance-deleted",
        serde_json::json!({
            "instanceId": instance_id,
            "deletedAt": now.to_rfc3339()
        }),
    )
    .map_err(|e| format!("Failed to emit timer instance deleted event: {}", e))?;

    Ok(updated_session)
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

    emit_stopped_events(&app, &stopped_instance_ids, now);

    Ok(updated_sessions)
}

#[tauri::command]
pub async fn clear_all_sessions(
    app: AppHandle,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    // Persist inside the lock like every other mutation — clearing the store
    // after releasing it could wipe a save another command made in between.
    app_state.with_task_sessions_mut(|sessions| -> Result<(), String> {
        sessions.clear();
        storage::clear_all_sessions(&app)
    })??;

    Ok(())
}

/// Non-fatal problems from the startup sessions load (skipped records or a
/// full load failure). The frontend fetches this once and shows it to the
/// user instead of the data silently vanishing.
#[tauri::command]
pub fn get_session_load_warning(app_state: State<'_, AppState>) -> Result<Option<String>, String> {
    app_state.with_session_load_warning(|warning| warning.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn fresh_instance() -> TimerInstance {
        TimerInstance {
            id: "instance_test".to_string(),
            session_id: "session_test".to_string(),
            start_time: ts(0),
            end_time: None,
            duration: None,
            is_running: false,
            is_paused: false,
            paused_at: None,
            paused_duration: None,
            resumed_at: None,
            external_id: None,
            notes: None,
            created_at: ts(0).to_rfc3339(),
            updated_at: ts(0).to_rfc3339(),
        }
    }

    #[test]
    fn duration_subtracts_accumulated_pauses() {
        // 100s wall clock, 30s previously paused -> 70s tracked
        let (duration, paused) = compute_final_duration(ts(0), 30_000, None, ts(100));
        assert_eq!(duration, 70_000);
        assert_eq!(paused, 30_000);
    }

    #[test]
    fn duration_includes_active_pause_at_stop() {
        // paused at t=80 and stopped at t=100 while still paused:
        // 20s of live pause joins the 30s already accumulated
        let (duration, paused) = compute_final_duration(ts(0), 30_000, Some(ts(80)), ts(100));
        assert_eq!(duration, 50_000);
        assert_eq!(paused, 50_000);
    }

    #[test]
    fn duration_clamps_negative_to_zero() {
        let (duration, _) = compute_final_duration(ts(100), 0, None, ts(50));
        assert_eq!(duration, 0);
    }

    #[test]
    fn start_allows_only_fresh_instances() {
        let instance = fresh_instance();
        assert!(validate_start(&instance, true, false).is_ok());
    }

    #[test]
    fn start_rejects_running_paused_and_completed() {
        let mut running = fresh_instance();
        running.is_running = true;
        assert!(validate_start(&running, true, false).is_err());

        let mut paused = fresh_instance();
        paused.is_paused = true;
        assert!(validate_start(&paused, true, false)
            .unwrap_err()
            .contains("resume"));

        let mut completed = fresh_instance();
        completed.duration = Some(1_000);
        completed.end_time = Some(ts(10));
        assert!(validate_start(&completed, true, false)
            .unwrap_err()
            .contains("already completed"));
    }

    #[test]
    fn start_rejects_inactive_session_and_concurrent_run() {
        let instance = fresh_instance();
        // These exact substrings drive the frontend's automatic recovery.
        assert!(validate_start(&instance, false, false)
            .unwrap_err()
            .contains("inactive session"));
        assert!(validate_start(&instance, true, true)
            .unwrap_err()
            .contains("Another timer instance is already running"));
    }

    fn fresh_session() -> TaskSession {
        TaskSession {
            id: "session_test".to_string(),
            task_id: "task_test".to_string(),
            task_name: "Test Task".to_string(),
            timer_instances: Vec::new(),
            total_duration: 0,
            notes: None,
            is_active: true,
            source: None,
            date: "2026-08-19".to_string(),
            created_at: ts(0).to_rfc3339(),
            updated_at: ts(0).to_rfc3339(),
        }
    }

    #[test]
    fn edit_applies_duration_end_time_and_stops_instance() {
        // The shape every edit save sends: duration + endTime + both flags
        // cleared. Applied to a running instance it must finalize it.
        let mut instance = fresh_instance();
        instance.is_running = true;

        let updates = TimerInstanceUpdates {
            is_running: Some(false),
            is_paused: Some(false),
            duration: Some(90_000),
            ..Default::default()
        };
        apply_timer_instance_updates(&mut instance, &updates, None, None, Some(ts(90)), ts(100));

        assert!(!instance.is_running);
        assert!(!instance.is_paused);
        assert_eq!(instance.duration, Some(90_000));
        assert_eq!(instance.end_time, Some(ts(90)));
        assert_eq!(instance.updated_at, ts(100).to_rfc3339());
    }

    #[test]
    fn edit_finalization_clears_stale_pause_state() {
        // Editing an actively-paused timer must not leave pause bookkeeping
        // on a stopped instance — same contract as stop_timer_instance.
        let mut instance = fresh_instance();
        instance.is_paused = true;
        instance.paused_at = Some(ts(50));
        instance.resumed_at = Some(ts(40));

        let updates = TimerInstanceUpdates {
            is_running: Some(false),
            is_paused: Some(false),
            duration: Some(60_000),
            ..Default::default()
        };
        apply_timer_instance_updates(&mut instance, &updates, None, None, Some(ts(60)), ts(100));

        assert_eq!(instance.paused_at, None);
        assert_eq!(instance.resumed_at, None);
    }

    #[test]
    fn partial_update_preserves_pause_state() {
        // A patch that doesn't clear both flags (e.g. notes-only) must leave
        // pause bookkeeping untouched.
        let mut instance = fresh_instance();
        instance.is_paused = true;
        instance.paused_at = Some(ts(50));

        let updates = TimerInstanceUpdates {
            notes: Some("edited".to_string()),
            ..Default::default()
        };
        apply_timer_instance_updates(&mut instance, &updates, None, None, None, ts(100));

        assert!(instance.is_paused);
        assert_eq!(instance.paused_at, Some(ts(50)));
        assert_eq!(instance.notes.as_deref(), Some("edited"));
    }

    #[test]
    fn update_rejects_raising_running_or_paused_flags() {
        let running = TimerInstanceUpdates {
            is_running: Some(true),
            ..Default::default()
        };
        assert!(validate_timer_instance_updates(&running)
            .unwrap_err()
            .contains("start_timer_instance"));

        let paused = TimerInstanceUpdates {
            is_paused: Some(true),
            ..Default::default()
        };
        assert!(validate_timer_instance_updates(&paused)
            .unwrap_err()
            .contains("pause_timer_instance"));

        // The finalization shape every edit save sends, and notes-only
        // patches, stay valid.
        let finalize = TimerInstanceUpdates {
            is_running: Some(false),
            is_paused: Some(false),
            duration: Some(1_000),
            ..Default::default()
        };
        assert!(validate_timer_instance_updates(&finalize).is_ok());

        let notes_only = TimerInstanceUpdates {
            notes: Some("n".to_string()),
            ..Default::default()
        };
        assert!(validate_timer_instance_updates(&notes_only).is_ok());
    }

    #[test]
    fn delete_rejects_running_and_paused_instances() {
        let mut running = fresh_instance();
        running.is_running = true;
        assert!(ensure_deletable(&running).unwrap_err().contains("running"));

        let mut paused = fresh_instance();
        paused.is_paused = true;
        assert!(ensure_deletable(&paused).unwrap_err().contains("paused"));

        // Idle and completed instances may be deleted.
        assert!(ensure_deletable(&fresh_instance()).is_ok());
        let mut stopped = fresh_instance();
        stopped.duration = Some(1_000);
        stopped.end_time = Some(ts(10));
        assert!(ensure_deletable(&stopped).is_ok());
    }

    #[test]
    fn deactivation_finalizes_paused_instances() {
        // Paused at t=80 with 30s already accumulated, deactivated at t=100:
        // frozen at the pause point (50s tracked), the live pause stretch
        // folded into paused_duration — exactly like stopping while paused.
        let mut session = fresh_session();
        let mut paused = fresh_instance();
        paused.is_paused = true;
        paused.paused_at = Some(ts(80));
        paused.paused_duration = Some(30_000);
        session.timer_instances = vec![paused];

        let stopped = stop_active_instances(&mut session, ts(100));

        assert_eq!(stopped, vec!["instance_test".to_string()]);
        let instance = &session.timer_instances[0];
        assert!(!instance.is_running);
        assert!(!instance.is_paused);
        assert_eq!(instance.paused_at, None);
        assert_eq!(instance.end_time, Some(ts(100)));
        assert_eq!(instance.duration, Some(50_000));
        assert_eq!(instance.paused_duration, Some(50_000));
        assert_eq!(session.total_duration, 50_000);
    }

    #[test]
    fn migration_finalizes_only_inactive_sessions() {
        let mut inactive = fresh_session();
        inactive.id = "session_inactive".to_string();
        inactive.is_active = false;
        let mut stranded = fresh_instance();
        stranded.is_paused = true;
        stranded.paused_at = Some(ts(80));
        inactive.timer_instances = vec![stranded];

        let mut active = fresh_session();
        active.id = "session_active".to_string();
        let mut live_paused = fresh_instance();
        live_paused.id = "instance_live".to_string();
        live_paused.is_paused = true;
        live_paused.paused_at = Some(ts(90));
        active.timer_instances = vec![live_paused];

        let mut sessions = vec![inactive, active];
        assert_eq!(finalize_stranded_instances(&mut sessions, ts(100)), 1);
        assert_eq!(sessions[0].timer_instances[0].duration, Some(80_000));
        assert!(sessions[1].timer_instances[0].is_paused);

        // Idempotent: a second run finds nothing to repair.
        assert_eq!(finalize_stranded_instances(&mut sessions, ts(200)), 0);
        assert_eq!(sessions[0].timer_instances[0].duration, Some(80_000));
    }

    #[test]
    fn migration_finalizes_stranded_running_instances() {
        // Defensive: no current code path leaves a runner in an inactive
        // session, but repair one if found in stored data.
        let mut session = fresh_session();
        session.is_active = false;
        let mut runner = fresh_instance();
        runner.is_running = true;
        session.timer_instances = vec![runner];

        let mut sessions = vec![session];
        assert_eq!(finalize_stranded_instances(&mut sessions, ts(60)), 1);
        let instance = &sessions[0].timer_instances[0];
        assert!(!instance.is_running);
        assert_eq!(instance.duration, Some(60_000));
        assert_eq!(instance.end_time, Some(ts(60)));
    }

    #[test]
    fn total_duration_sums_completed_instance_durations() {
        let mut session = fresh_session();
        let mut a = fresh_instance();
        a.duration = Some(30_000);
        let mut b = fresh_instance();
        b.id = "instance_b".to_string();
        b.duration = Some(45_000);
        let mut running = fresh_instance();
        running.id = "instance_c".to_string();
        running.is_running = true; // no duration yet

        session.timer_instances = vec![a, b, running];
        recalculate_total_duration(&mut session);

        assert_eq!(session.total_duration, 75_000);
    }
}
