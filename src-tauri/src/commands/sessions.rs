// Session-related command handlers

use crate::state::AppState;
use crate::storage;
use crate::types::{Task, TaskSession, TimerInstance, WorkLogEntry};
use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
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
    (
        (total_elapsed - total_paused).max(0) as u64,
        total_paused as u64,
    )
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

/// A new, active session for a task, carrying the task's current rate.
/// Callers deactivate the others first.
fn new_task_session(
    task_id: String,
    task_name: String,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> TaskSession {
    TaskSession {
        id: new_session_id(),
        task_id,
        task_name,
        timer_instances: Vec::new(),
        total_duration: 0,
        notes: None,
        is_active: true,
        source: None,
        hourly_rate,
        // Local day, not UTC: the dashboard's today-filter and the calendar
        // compare this string against the user's local date.
        date: Local::now().format("%Y-%m-%d").to_string(),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    }
}

/// A fresh (idle, never-run) timer instance.
fn new_timer_instance(session_id: &str, now: DateTime<Utc>) -> TimerInstance {
    TimerInstance {
        id: new_instance_id(),
        session_id: session_id.to_string(),
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
    }
}

/// Put a validated, never-run instance into the running state.
fn begin_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    instance.is_running = true;
    instance.is_paused = false;
    instance.start_time = now;
    instance.resumed_at = Some(now);
    instance.paused_duration = Some(0);
    instance.updated_at = now.to_rfc3339();
}

/// Resume a validated, paused instance, folding the pause into
/// `paused_duration` (the frontend's elapsed math subtracts it).
pub(crate) fn resume_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    if let Some(paused_at) = instance.paused_at {
        let pause_duration = (now.timestamp_millis() - paused_at.timestamp_millis()).max(0) as u64;
        instance.paused_duration = Some(instance.paused_duration.unwrap_or(0) + pause_duration);
    }
    instance.is_running = true;
    instance.is_paused = false;
    instance.paused_at = None;
    instance.resumed_at = Some(now);
    instance.updated_at = now.to_rfc3339();
}

/// Pause a validated, running instance; `paused_at` starts the pause stretch
/// that resume (or stop) folds into `paused_duration`.
fn pause_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    pause_instance_at(instance, now, now);
}

/// Pause a running instance as of an earlier moment (idle detection backdates
/// the pause to when input stopped, so the away time isn't counted). Callers
/// keep `paused_at` at or after the run's start.
pub(crate) fn pause_instance_at(
    instance: &mut TimerInstance,
    paused_at: DateTime<Utc>,
    now: DateTime<Utc>,
) {
    instance.is_running = false;
    instance.is_paused = true;
    instance.paused_at = Some(paused_at);
    instance.updated_at = now.to_rfc3339();
}

/// Resume a paused instance *without* folding the pause into
/// `paused_duration`, so the paused stretch counts as tracked time ("keep the
/// away time" after an idle pause).
pub(crate) fn keep_idle_time(instance: &mut TimerInstance, now: DateTime<Utc>) {
    instance.is_running = true;
    instance.is_paused = false;
    instance.paused_at = None;
    instance.resumed_at = Some(now);
    instance.updated_at = now.to_rfc3339();
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

    let new_instance = new_timer_instance(&session_id, now);

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

    let updated_session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
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
                        .ok_or_else(|| {
                            format!("Timer instance with ID {} not found", instance_id)
                        })?;

                    validate_start(instance, session_is_active, another_running)?;
                    begin_instance(instance, now);
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

    let updated_session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
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
                        .ok_or_else(|| {
                            format!("Timer instance with ID {} not found", instance_id)
                        })?;

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

    let updated_session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
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
                        .ok_or_else(|| {
                            format!("Timer instance with ID {} not found", instance_id)
                        })?;

                    if !instance.is_running {
                        return Err("Cannot pause timer: timer is not running".to_string());
                    }

                    pause_instance(instance, now);
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

    let updated_session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
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
                        .ok_or_else(|| {
                            format!("Timer instance with ID {} not found", instance_id)
                        })?;

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

    let updated_session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
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
                        .ok_or_else(|| {
                            format!("Timer instance with ID {} not found", instance_id)
                        })?;
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

/// Non-fatal problems from the startup sessions load (skipped records or a
/// full load failure). The frontend fetches this once and shows it to the
/// user instead of the data silently vanishing.
#[tauri::command]
pub fn get_session_load_warning(app_state: State<'_, AppState>) -> Result<Option<String>, String> {
    app_state.with_session_load_warning(|warning| warning.clone())
}

// ============================================================================
// STARTING WORK AND SYSTEM TRAY OPERATIONS
// ============================================================================
//
// Starting a task is one operation shared by the app (start_task) and the
// tray, so every start path behaves the same. The tray drives sessions
// directly in Rust (no webview round trip), so it works whatever state the
// window is in. Each operation upholds the same invariants as the commands
// above and emits the same timer-instance events, which the frontend's
// session context reloads on.

/// The timer the tray shows: the running instance, else a paused one.
#[derive(Debug, Clone, PartialEq)]
pub struct LiveTimer {
    pub instance_id: String,
    pub task_id: String,
    pub task_name: String,
    pub is_paused: bool,
    /// Net tracked time at `now` (a paused timer's value is frozen).
    pub elapsed_ms: u64,
}

pub fn live_timer(sessions: &[TaskSession], now: DateTime<Utc>) -> Option<LiveTimer> {
    let find = |paused: bool| {
        sessions.iter().find_map(|session| {
            session
                .timer_instances
                .iter()
                .find(|i| if paused { i.is_paused } else { i.is_running })
                .map(|instance| (session, instance))
        })
    };
    let (session, instance) = find(false).or_else(|| find(true))?;
    let (elapsed_ms, _) = compute_final_duration(
        instance.start_time,
        instance.paused_duration.unwrap_or(0),
        if instance.is_paused {
            instance.paused_at
        } else {
            None
        },
        now,
    );
    Some(LiveTimer {
        instance_id: instance.id.clone(),
        task_id: session.task_id.clone(),
        task_name: session.task_name.clone(),
        is_paused: instance.is_paused,
        elapsed_ms,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub enum TrayStart {
    /// The task's timer is already running; nothing changed.
    AlreadyRunning,
    Resumed(String),
    Started(String),
}

/// "Start <task>", from the app or the tray: if the task's session is already
/// the active one, continue it (resume a paused timer, or start a new timer in
/// it); otherwise open a new active session for the task with a running timer,
/// finalizing the previous active session's live timers (a deactivated
/// session must not keep one). Returns the outcome and any finalized ids.
pub fn start_task_timer(
    sessions: &mut Vec<TaskSession>,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<(TrayStart, Vec<String>), String> {
    if let Some(session) = sessions
        .iter_mut()
        .find(|s| s.is_active && s.task_id == task_id)
    {
        if session.timer_instances.iter().any(|i| i.is_running) {
            return Ok((TrayStart::AlreadyRunning, Vec::new()));
        }
        let outcome = if let Some(paused) = session.timer_instances.iter_mut().find(|i| i.is_paused)
        {
            resume_instance(paused, now);
            TrayStart::Resumed(paused.id.clone())
        } else {
            if session.timer_instances.len() >= MAX_TIMER_INSTANCES_PER_SESSION {
                return Err(format!(
                    "Maximum number of timers ({}) reached for this session",
                    MAX_TIMER_INSTANCES_PER_SESSION
                ));
            }
            let mut instance = new_timer_instance(&session.id, now);
            begin_instance(&mut instance, now);
            let id = instance.id.clone();
            session.timer_instances.push(instance);
            TrayStart::Started(id)
        };
        session.updated_at = now.to_rfc3339();
        return Ok((outcome, Vec::new()));
    }

    let mut stopped = Vec::new();
    for session in sessions.iter_mut() {
        if session.is_active {
            stopped.extend(stop_active_instances(session, now));
        }
        session.is_active = false;
    }
    let mut session =
        new_task_session(task_id.to_string(), task_name.to_string(), hourly_rate, now);
    let mut instance = new_timer_instance(&session.id, now);
    begin_instance(&mut instance, now);
    let id = instance.id.clone();
    session.timer_instances.push(instance);
    sessions.push(session);
    Ok((TrayStart::Started(id), stopped))
}

/// Finalize the live timer (running, else paused), like stop_timer_instance.
/// Returns its id, or None when nothing is live.
pub fn stop_live_timer(sessions: &mut [TaskSession], now: DateTime<Utc>) -> Option<String> {
    let instance_id = live_timer(sessions, now)?.instance_id;
    let session = sessions
        .iter_mut()
        .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))?;
    let instance = session
        .timer_instances
        .iter_mut()
        .find(|i| i.id == instance_id)?;
    finalize_instance(instance, now);
    session.updated_at = now.to_rfc3339();
    recalculate_total_duration(session);
    Some(instance_id)
}

/// Pause the running timer (a paused or absent one is left alone), like
/// pause_timer_instance. Returns its id, or None when nothing was running.
pub fn pause_live_timer(sessions: &mut [TaskSession], now: DateTime<Utc>) -> Option<String> {
    let session = sessions
        .iter_mut()
        .find(|s| s.timer_instances.iter().any(|i| i.is_running))?;
    let instance = session.timer_instances.iter_mut().find(|i| i.is_running)?;
    pause_instance(instance, now);
    let instance_id = instance.id.clone();
    session.updated_at = now.to_rfc3339();
    Some(instance_id)
}

/// start_task_timer plus the name of the task whose live timer the start
/// finalized, so callers can announce the hand-off instead of it being silent.
pub fn start_task_with_handoff(
    sessions: &mut Vec<TaskSession>,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<(TrayStart, Vec<String>, Option<String>), String> {
    let previous = live_timer(sessions, now);
    let (outcome, stopped) = start_task_timer(sessions, task_id, task_name, hourly_rate, now)?;
    let handoff = previous
        .filter(|live| stopped.contains(&live.instance_id))
        .map(|live| live.task_name);
    Ok((outcome, stopped, handoff))
}

/// A task's current hourly rate from the mirrored task list (None when the
/// task has no rate, or isn't mirrored yet; fill_missing_session_rates
/// catches the session up later).
fn task_rate(app_state: &AppState, task_id: &str) -> Option<f64> {
    app_state
        .with_tasks(|tasks| {
            tasks
                .iter()
                .find(|t| t.id == task_id)
                .and_then(|t| t.hourly_rate)
                .filter(|rate| *rate > 0.0)
        })
        .ok()
        .flatten()
}

/// Give sessions without a rate their task's current rate (when it has one).
/// Sessions keep the rate they were given, so this only reaches sessions from
/// older builds and time tracked before the task had a rate. Returns whether
/// anything changed.
pub fn fill_missing_session_rates(sessions: &mut [TaskSession], tasks: &[Task]) -> bool {
    let mut changed = false;
    for session in sessions.iter_mut().filter(|s| s.hourly_rate.is_none()) {
        let rate = tasks
            .iter()
            .find(|t| t.id == session.task_id)
            .and_then(|t| t.hourly_rate)
            .filter(|rate| *rate > 0.0);
        if rate.is_some() {
            session.hourly_rate = rate;
            changed = true;
        }
    }
    changed
}

/// Imported sessions saved before rates were captured: give them the rate the
/// site's pay implies, from their timers' ledger entries (matched by
/// external_id), so rate × time reproduces the imported amount. Runs before
/// fill_missing_session_rates, which would otherwise give them the task's
/// rate. Returns whether anything changed.
pub fn fill_imported_session_rates(sessions: &mut [TaskSession], entries: &[WorkLogEntry]) -> bool {
    use std::collections::HashMap;
    let cents_by_entry: HashMap<&str, i64> = entries
        .iter()
        .map(|entry| (entry.id.as_str(), entry.amount_cents))
        .collect();
    let mut changed = false;
    for session in sessions.iter_mut().filter(|s| {
        s.hourly_rate.is_none()
            && s.source.as_deref() == Some(crate::commands::worklogs::WORKLOG_IMPORT_SOURCE)
    }) {
        let (mut cents, mut ms) = (0_i64, 0_u64);
        for instance in &session.timer_instances {
            let (Some(entry_id), Some(duration)) = (&instance.external_id, instance.duration)
            else {
                continue;
            };
            if let Some(entry_cents) = cents_by_entry.get(entry_id.as_str()) {
                cents += entry_cents;
                ms += duration;
            }
        }
        if cents > 0 && ms > 0 {
            session.hourly_rate = Some(cents as f64 / 100.0 / (ms as f64 / 3_600_000.0));
            changed = true;
        }
    }
    changed
}

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
    let hourly_rate = task_rate(app_state, task_id);
    let (outcome, stopped, handoff) = app_state.with_task_sessions_mut(
        |sessions| -> Result<(TrayStart, Vec<String>, Option<String>), String> {
            let result = start_task_with_handoff(sessions, task_id, task_name, hourly_rate, now)?;
            if result.0 != TrayStart::AlreadyRunning {
                storage::save_sessions(app, sessions)?;
            }
            Ok(result)
        },
    )??;

    // Persisted already; emit failures only delay the frontend's refresh.
    emit_stopped_events(app, &stopped, now);
    match &outcome {
        TrayStart::Started(instance_id) => {
            let _ = app.emit(
                "timer-instance-started",
                serde_json::json!({ "instanceId": instance_id, "startTime": now.to_rfc3339() }),
            );
        }
        TrayStart::Resumed(instance_id) => {
            let _ = app.emit(
                "timer-instance-resumed",
                serde_json::json!({ "instanceId": instance_id, "resumedAt": now.to_rfc3339() }),
            );
        }
        TrayStart::AlreadyRunning => {}
    }
    Ok((outcome, handoff))
}

/// What start_task reports back to the app (camelCase for the frontend).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskResult {
    /// "started" | "resumed" | "alreadyRunning"
    pub outcome: String,
    pub instance_id: Option<String>,
    /// Task whose live timer this start finalized, if any.
    pub stopped_task_name: Option<String>,
}

impl StartTaskResult {
    fn new(outcome: TrayStart, stopped_task_name: Option<String>) -> Self {
        let (outcome, instance_id) = match outcome {
            TrayStart::Started(id) => ("started", Some(id)),
            TrayStart::Resumed(id) => ("resumed", Some(id)),
            TrayStart::AlreadyRunning => ("alreadyRunning", None),
        };
        Self {
            outcome: outcome.to_string(),
            instance_id,
            stopped_task_name,
        }
    }
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
        let _ = app.emit(
            "timer-instance-paused",
            serde_json::json!({ "instanceId": instance_id, "pausedAt": now.to_rfc3339() }),
        );
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
        emit_stopped_events(app, std::slice::from_ref(instance_id), now);
    }
    Ok(stopped)
}

// ============================================================================
// MANUAL TIME ENTRIES
// ============================================================================

/// `source` of sessions created by "Add time" (must match MANUAL_SOURCE in
/// src/types/timer.ts).
pub const MANUAL_SOURCE: &str = "manual";

const MAX_MANUAL_DURATION_MS: u64 = 24 * 60 * 60 * 1000;

/// Clock skew allowed between the dialog computing "ends now" and this check.
const MANUAL_FUTURE_TOLERANCE_MS: i64 = 60_000;

/// The wall-clock span an instance occupies, or None for an idle (never run)
/// one. Live timers occupy up to `now`.
fn instance_span(
    instance: &TimerInstance,
    now: DateTime<Utc>,
) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    if instance.is_running || instance.is_paused {
        return Some((instance.start_time, now));
    }
    instance.end_time.map(|end| (instance.start_time, end))
}

fn local_time_label(at: DateTime<Utc>) -> String {
    at.with_timezone(&Local).format("%-I:%M %p").to_string()
}

/// Validate a manual entry and build its session: inactive, sourced "manual",
/// dated by the local day of its start (as the frontend buckets instances),
/// holding one finished timer. Time already tracked can't be overlapped, or
/// the same minutes would count twice.
pub fn build_manual_session(
    sessions: &[TaskSession],
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    start: DateTime<Utc>,
    duration_ms: u64,
    now: DateTime<Utc>,
) -> Result<TaskSession, String> {
    if task_id.trim().is_empty() || task_name.trim().is_empty() {
        return Err("Choose a task for the time entry".to_string());
    }
    if duration_ms == 0 {
        return Err("Duration must be greater than zero".to_string());
    }
    if duration_ms > MAX_MANUAL_DURATION_MS {
        return Err("A time entry can be at most 24 hours".to_string());
    }
    let end = start + chrono::Duration::milliseconds(duration_ms as i64);
    if end.timestamp_millis() > now.timestamp_millis() + MANUAL_FUTURE_TOLERANCE_MS {
        return Err("The time entry can't end in the future".to_string());
    }

    for session in sessions {
        for instance in &session.timer_instances {
            if let Some((other_start, other_end)) = instance_span(instance, now) {
                if start < other_end && other_start < end {
                    return Err(format!(
                        "This overlaps time already tracked for \"{}\" ({}–{} on {}). Adjust the start time or duration.",
                        session.task_name,
                        local_time_label(other_start),
                        local_time_label(other_end),
                        other_start.with_timezone(&Local).format("%b %-d"),
                    ));
                }
            }
        }
    }

    let mut session =
        new_task_session(task_id.to_string(), task_name.to_string(), hourly_rate, now);
    session.is_active = false;
    session.source = Some(MANUAL_SOURCE.to_string());
    session.date = start.with_timezone(&Local).format("%Y-%m-%d").to_string();

    let mut instance = new_timer_instance(&session.id, now);
    instance.start_time = start;
    instance.end_time = Some(end);
    instance.duration = Some(duration_ms);
    instance.paused_duration = Some(0);
    session.timer_instances.push(instance);
    recalculate_total_duration(&mut session);
    Ok(session)
}

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
    let hourly_rate = task_rate(&app_state, task_id.trim());

    let session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
            let session = build_manual_session(
                sessions,
                task_id.trim(),
                task_name.trim(),
                hourly_rate,
                start,
                duration_ms,
                now,
            )?;
            sessions.push(session.clone());
            storage::save_sessions(&app, sessions)?;
            Ok(session)
        })??;

    // Persisted already; the event only prompts listeners to reload.
    if let Some(instance) = session.timer_instances.first() {
        emit_stopped_events(&app, std::slice::from_ref(&instance.id), now);
    }
    Ok(session)
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
            hourly_rate: None,
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

    // --- system tray operations -------------------------------------------

    fn tray_session(id: &str, task_id: &str, active: bool) -> TaskSession {
        TaskSession {
            id: id.to_string(),
            task_id: task_id.to_string(),
            task_name: format!("Task {}", task_id),
            is_active: active,
            ..fresh_session()
        }
    }

    fn tray_instance(id: &str, session_id: &str, start: i64) -> TimerInstance {
        TimerInstance {
            id: id.to_string(),
            session_id: session_id.to_string(),
            start_time: ts(start),
            ..fresh_instance()
        }
    }

    #[test]
    fn live_timer_prefers_running_and_reports_net_elapsed() {
        let mut paused = tray_instance("p", "old", 0);
        paused.is_paused = true;
        paused.paused_at = Some(ts(30));
        paused.paused_duration = Some(0);
        let mut old = tray_session("old", "a", false);
        old.timer_instances = vec![paused];

        let mut running = tray_instance("r", "cur", 100);
        running.is_running = true;
        running.paused_duration = Some(20_000);
        let mut cur = tray_session("cur", "b", true);
        cur.timer_instances = vec![running];

        let live = live_timer(&[old, cur], ts(200)).unwrap();
        assert_eq!(live.instance_id, "r");
        assert_eq!(live.task_id, "b");
        assert!(!live.is_paused);
        assert_eq!(live.elapsed_ms, 80_000); // 100s wall - 20s paused
    }

    #[test]
    fn live_timer_freezes_a_paused_timer() {
        let mut paused = tray_instance("p", "s", 0);
        paused.is_paused = true;
        paused.paused_at = Some(ts(45));
        paused.paused_duration = Some(5_000);
        let mut session = tray_session("s", "a", true);
        session.timer_instances = vec![paused];

        let live = live_timer(&[session], ts(500)).unwrap();
        assert!(live.is_paused);
        assert_eq!(live.elapsed_ms, 40_000);
        assert!(live_timer(&[tray_session("x", "a", true)], ts(500)).is_none());
    }

    #[test]
    fn tray_start_opens_a_new_session_and_finalizes_the_previous_timer() {
        let mut running = tray_instance("r", "cur", 0);
        running.is_running = true;
        running.paused_duration = Some(0);
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![running];
        let mut sessions = vec![cur];

        let (outcome, stopped) =
            start_task_timer(&mut sessions, "b", "Task b", None, ts(60)).unwrap();

        assert_eq!(stopped, vec!["r".to_string()]);
        assert!(!sessions[0].is_active);
        assert_eq!(sessions[0].timer_instances[0].duration, Some(60_000));
        let new_session = &sessions[1];
        assert!(new_session.is_active);
        assert_eq!(new_session.task_id, "b");
        assert_eq!(new_session.task_name, "Task b");
        let started = &new_session.timer_instances[0];
        assert!(started.is_running);
        assert_eq!(started.start_time, ts(60));
        assert_eq!(outcome, TrayStart::Started(started.id.clone()));
        // Exactly one running timer overall
        let running_count = sessions
            .iter()
            .flat_map(|s| s.timer_instances.iter())
            .filter(|i| i.is_running)
            .count();
        assert_eq!(running_count, 1);
    }

    #[test]
    fn tray_start_for_the_active_task_continues_its_session() {
        let mut done = tray_instance("done", "cur", 0);
        done.duration = Some(10_000);
        done.end_time = Some(ts(10));
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![done];
        let mut sessions = vec![cur];

        let (outcome, stopped) =
            start_task_timer(&mut sessions, "a", "Task a", None, ts(100)).unwrap();

        assert!(stopped.is_empty());
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].timer_instances.len(), 2);
        let started = &sessions[0].timer_instances[1];
        assert!(started.is_running);
        assert_eq!(outcome, TrayStart::Started(started.id.clone()));
    }

    #[test]
    fn tray_start_for_the_active_task_resumes_a_paused_timer() {
        let mut paused = tray_instance("p", "cur", 0);
        paused.is_paused = true;
        paused.paused_at = Some(ts(30));
        paused.paused_duration = Some(0);
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![paused];
        let mut sessions = vec![cur];

        let (outcome, _) = start_task_timer(&mut sessions, "a", "Task a", None, ts(90)).unwrap();

        assert_eq!(outcome, TrayStart::Resumed("p".to_string()));
        let resumed = &sessions[0].timer_instances[0];
        assert!(resumed.is_running && !resumed.is_paused);
        assert_eq!(resumed.paused_duration, Some(60_000));
        assert_eq!(sessions[0].timer_instances.len(), 1);
    }

    #[test]
    fn tray_start_is_a_no_op_when_the_task_is_already_running() {
        let mut running = tray_instance("r", "cur", 0);
        running.is_running = true;
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![running];
        let mut sessions = vec![cur];
        let before = sessions.clone();

        let (outcome, stopped) =
            start_task_timer(&mut sessions, "a", "Task a", None, ts(90)).unwrap();

        assert_eq!(outcome, TrayStart::AlreadyRunning);
        assert!(stopped.is_empty());
        assert_eq!(sessions, before);
    }

    #[test]
    fn tray_stop_finalizes_the_live_timer() {
        let mut running = tray_instance("r", "cur", 0);
        running.is_running = true;
        running.paused_duration = Some(15_000);
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![running];
        let mut sessions = vec![cur];

        assert_eq!(
            stop_live_timer(&mut sessions, ts(75)),
            Some("r".to_string())
        );
        let stopped = &sessions[0].timer_instances[0];
        assert!(!stopped.is_running);
        assert_eq!(stopped.duration, Some(60_000));
        assert_eq!(sessions[0].total_duration, 60_000);
        assert_eq!(stop_live_timer(&mut sessions, ts(80)), None);
    }

    // --- start_task, pause and manual time -------------------------------

    #[test]
    fn start_reports_the_task_whose_timer_it_handed_off_from() {
        let mut running = tray_instance("r", "cur", 0);
        running.is_running = true;
        running.paused_duration = Some(0);
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![running];
        let mut sessions = vec![cur];

        let (outcome, stopped, handoff) =
            start_task_with_handoff(&mut sessions, "b", "Task b", None, ts(60)).unwrap();

        assert!(matches!(outcome, TrayStart::Started(_)));
        assert_eq!(stopped, vec!["r".to_string()]);
        assert_eq!(handoff.as_deref(), Some("Task a"));
    }

    #[test]
    fn start_has_no_handoff_when_continuing_the_same_task() {
        let mut paused = tray_instance("p", "cur", 0);
        paused.is_paused = true;
        paused.paused_at = Some(ts(30));
        paused.paused_duration = Some(0);
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![paused];
        let mut sessions = vec![cur];

        let (outcome, _, handoff) =
            start_task_with_handoff(&mut sessions, "a", "Task a", None, ts(90)).unwrap();

        assert_eq!(outcome, TrayStart::Resumed("p".to_string()));
        assert_eq!(handoff, None);
    }

    #[test]
    fn start_has_no_handoff_when_nothing_was_live() {
        let mut sessions = vec![tray_session("old", "a", false)];
        let (_, stopped, handoff) =
            start_task_with_handoff(&mut sessions, "b", "Task b", None, ts(10)).unwrap();
        assert!(stopped.is_empty());
        assert_eq!(handoff, None);
    }

    #[test]
    fn start_task_result_maps_each_outcome() {
        assert_eq!(
            StartTaskResult::new(TrayStart::Started("i".into()), Some("Old".into())),
            StartTaskResult {
                outcome: "started".into(),
                instance_id: Some("i".into()),
                stopped_task_name: Some("Old".into()),
            }
        );
        assert_eq!(
            StartTaskResult::new(TrayStart::Resumed("i".into()), None).outcome,
            "resumed"
        );
        let already = StartTaskResult::new(TrayStart::AlreadyRunning, None);
        assert_eq!(already.outcome, "alreadyRunning");
        assert_eq!(already.instance_id, None);
        // The frontend reads camelCase keys
        let json = serde_json::to_value(&already).unwrap();
        assert!(json.get("stoppedTaskName").is_some());
        assert!(json.get("instanceId").is_some());
    }

    #[test]
    fn pause_live_timer_pauses_only_a_running_timer() {
        let mut running = tray_instance("r", "cur", 0);
        running.is_running = true;
        running.paused_duration = Some(0);
        let mut cur = tray_session("cur", "a", true);
        cur.timer_instances = vec![running];
        let mut sessions = vec![cur];

        assert_eq!(
            pause_live_timer(&mut sessions, ts(40)),
            Some("r".to_string())
        );
        let paused = &sessions[0].timer_instances[0];
        assert!(paused.is_paused && !paused.is_running);
        assert_eq!(paused.paused_at, Some(ts(40)));
        // Already paused: nothing to do
        assert_eq!(pause_live_timer(&mut sessions, ts(50)), None);
        assert_eq!(sessions[0].timer_instances[0].paused_at, Some(ts(40)));
        // Nothing live at all
        assert_eq!(
            pause_live_timer(&mut [tray_session("x", "a", true)], ts(50)),
            None
        );
    }

    fn finished(id: &str, session_id: &str, start: i64, end: i64) -> TimerInstance {
        TimerInstance {
            end_time: Some(ts(end)),
            duration: Some(((end - start) * 1000) as u64),
            paused_duration: Some(0),
            ..tray_instance(id, session_id, start)
        }
    }

    const HOUR_MS: u64 = 3_600_000;

    #[test]
    fn manual_time_rejects_invalid_entries() {
        let now = ts(100_000);
        let start = ts(10_000);
        assert!(build_manual_session(&[], "", "Task", None, start, HOUR_MS, now).is_err());
        assert_eq!(
            build_manual_session(&[], "a", "Task a", None, start, 0, now).unwrap_err(),
            "Duration must be greater than zero"
        );
        assert_eq!(
            build_manual_session(&[], "a", "Task a", None, start, 24 * HOUR_MS + 1, now)
                .unwrap_err(),
            "A time entry can be at most 24 hours"
        );
        // Ends 30 minutes after "now"
        assert_eq!(
            build_manual_session(&[], "a", "Task a", None, ts(98_000), HOUR_MS, now).unwrap_err(),
            "The time entry can't end in the future"
        );
        // Ending within the clock-skew tolerance is fine
        assert!(build_manual_session(&[], "a", "Task a", None, ts(96_430), HOUR_MS, now).is_ok());
    }

    #[test]
    fn manual_time_rejects_overlap_with_tracked_time() {
        let now = ts(100_000);
        let mut done = tray_session("done", "x", false);
        done.task_name = "Earlier work".to_string();
        done.timer_instances = vec![finished("f", "done", 10_000, 13_600)];

        // Starts inside the finished timer
        let err = build_manual_session(
            &[done.clone()],
            "a",
            "Task a",
            None,
            ts(12_000),
            HOUR_MS,
            now,
        )
        .unwrap_err();
        assert!(err.contains("Earlier work"), "{}", err);
        // Touching end to start is not an overlap
        assert!(build_manual_session(
            &[done.clone()],
            "a",
            "Task a",
            None,
            ts(13_600),
            HOUR_MS,
            now
        )
        .is_ok());
        assert!(
            build_manual_session(&[done], "a", "Task a", None, ts(6_400), HOUR_MS, now).is_ok()
        );

        // A live timer occupies its start up to now
        let mut live = tray_instance("r", "cur", 90_000);
        live.is_running = true;
        let mut cur = tray_session("cur", "b", true);
        cur.timer_instances = vec![live];
        assert!(build_manual_session(
            &[cur.clone()],
            "a",
            "Task a",
            None,
            ts(88_000),
            HOUR_MS,
            now
        )
        .is_err());
        // Idle (never run) timers occupy nothing
        let mut idle_session = tray_session("idle", "c", true);
        idle_session.timer_instances = vec![tray_instance("i", "idle", 88_000)];
        assert!(build_manual_session(
            &[idle_session],
            "a",
            "Task a",
            None,
            ts(88_000),
            HOUR_MS,
            now
        )
        .is_ok());
    }

    #[test]
    fn manual_time_builds_an_inactive_manual_session_on_the_local_start_day() {
        let now = ts(100_000);
        let start = ts(20_000);

        let session =
            build_manual_session(&[], "a", "Task a", None, start, 90 * 60_000, now).unwrap();

        assert!(!session.is_active);
        assert_eq!(session.source.as_deref(), Some(MANUAL_SOURCE));
        assert_eq!(session.task_id, "a");
        assert_eq!(session.task_name, "Task a");
        assert_eq!(
            session.date,
            start.with_timezone(&Local).format("%Y-%m-%d").to_string()
        );
        assert_eq!(session.total_duration, 90 * 60_000);
        let instance = &session.timer_instances[0];
        assert_eq!(instance.session_id, session.id);
        assert_eq!(instance.start_time, start);
        assert_eq!(
            instance.end_time,
            Some(start + chrono::Duration::minutes(90))
        );
        assert_eq!(instance.duration, Some(90 * 60_000));
        assert_eq!(instance.paused_duration, Some(0));
        assert!(!instance.is_running && !instance.is_paused);
    }

    // --- hourly rates ------------------------------------------------------

    fn rated_task(id: &str, rate: Option<f64>) -> Task {
        Task {
            id: id.to_string(),
            name: format!("Task {}", id),
            hourly_rate: rate,
            default_note_template_id: None,
            is_archived: false,
            is_favorite: false,
            created_at: ts(0).to_rfc3339(),
            updated_at: ts(0).to_rfc3339(),
        }
    }

    #[test]
    fn a_new_session_captures_the_rate_and_continuing_keeps_it() {
        let mut sessions = Vec::new();
        start_task_timer(&mut sessions, "a", "Task a", Some(40.0), ts(0)).unwrap();
        assert_eq!(sessions[0].hourly_rate, Some(40.0));

        // Pause, then start the same task again at a new rate: same session,
        // same rate.
        pause_live_timer(&mut sessions, ts(60));
        start_task_timer(&mut sessions, "a", "Task a", Some(55.0), ts(120)).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].hourly_rate, Some(40.0));

        // Another task opens its own session at its own rate
        start_task_timer(&mut sessions, "b", "Task b", Some(25.0), ts(180)).unwrap();
        assert_eq!(sessions[1].hourly_rate, Some(25.0));
    }

    #[test]
    fn manual_time_captures_the_rate() {
        let session = build_manual_session(
            &[],
            "a",
            "Task a",
            Some(32.5),
            ts(1_000),
            60_000,
            ts(10_000),
        )
        .unwrap();
        assert_eq!(session.hourly_rate, Some(32.5));
    }

    #[test]
    fn filling_rates_reaches_only_sessions_without_one() {
        let mut keeps = tray_session("keeps", "a", false);
        keeps.hourly_rate = Some(20.0);
        let missing_a = tray_session("missing-a", "a", false);
        let missing_unrated = tray_session("missing-b", "b", false);
        let mut sessions = vec![keeps, missing_a, missing_unrated];
        let tasks = vec![rated_task("a", Some(30.0)), rated_task("b", None)];

        assert!(fill_missing_session_rates(&mut sessions, &tasks));
        assert_eq!(sessions[0].hourly_rate, Some(20.0)); // past rate kept
        assert_eq!(sessions[1].hourly_rate, Some(30.0)); // filled from the task
        assert_eq!(sessions[2].hourly_rate, None); // task has no rate yet

        // Nothing left to fill: reports no change
        assert!(!fill_missing_session_rates(&mut sessions, &tasks));
        // Once task b gets a rate, its earlier time picks it up
        let tasks = vec![rated_task("a", Some(99.0)), rated_task("b", Some(15.0))];
        assert!(fill_missing_session_rates(&mut sessions, &tasks));
        assert_eq!(sessions[1].hourly_rate, Some(30.0));
        assert_eq!(sessions[2].hourly_rate, Some(15.0));
    }

    #[test]
    fn older_imported_sessions_get_the_rate_the_site_pay_implies() {
        let ledger: Vec<WorkLogEntry> = serde_json::from_value(serde_json::json!([
            { "id": "e1", "kind": "timed", "amountCents": 2_000 },
            { "id": "e2", "kind": "timed", "amountCents": 1_000 }
        ]))
        .unwrap();
        let timer = |id: &str, entry: &str, minutes: u64| TimerInstance {
            external_id: Some(entry.to_string()),
            duration: Some(minutes * 60_000),
            ..tray_instance(id, "imp", 0)
        };
        let mut imported = tray_session("imp", "a", false);
        imported.source = Some(crate::commands::worklogs::WORKLOG_IMPORT_SOURCE.to_string());
        imported.timer_instances = vec![timer("i1", "e1", 40), timer("i2", "e2", 20)];
        let tracked = tray_session("tracked", "a", false);
        let mut sessions = vec![imported, tracked];

        assert!(fill_imported_session_rates(&mut sessions, &ledger));
        // $30 over one hour
        assert_eq!(sessions[0].hourly_rate, Some(30.0));
        // Tracked sessions are left to fill_missing_session_rates
        assert_eq!(sessions[1].hourly_rate, None);
        assert!(!fill_imported_session_rates(&mut sessions, &ledger));
    }

    #[test]
    fn sessions_saved_without_a_rate_still_load() {
        let json = serde_json::json!({
            "id": "s",
            "taskId": "a",
            "taskName": "Task a",
            "timerInstances": [],
            "notes": null
        });
        let session: TaskSession = serde_json::from_value(json).unwrap();
        assert_eq!(session.hourly_rate, None);
        let round_trip = serde_json::to_value(&session).unwrap();
        assert!(round_trip.get("hourlyRate").is_some());
    }
}
