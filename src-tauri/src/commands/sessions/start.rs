//! Starting work, and the tray's timer actions.
//!
//! Starting a task is one operation shared by the app (start_task) and the
//! tray, so every start path behaves the same. The tray drives sessions
//! directly in Rust (no webview round trip), so it works whatever state the
//! window is in. Each operation upholds the same invariants as the instance
//! commands and emits the same timer-instance events, which the frontend's
//! session context reloads on.

use super::task_links::task_rate;
use super::timer::{
    begin_instance, compute_final_duration, finalize_instance, local_day, new_task_session,
    new_timer_instance, pause_instance, recalculate_total_duration, resume_instance,
    stop_active_instances, MAX_TIMER_INSTANCES_PER_SESSION,
};
use crate::events::{
    emit_instance_event, emit_stopped, TIMER_INSTANCE_PAUSED, TIMER_INSTANCE_RESUMED,
    TIMER_INSTANCE_STARTED,
};
use crate::state::AppState;
use crate::storage;
use crate::types::TaskSession;
use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, State};

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
///
/// Sessions are per day: an active session from an earlier local day is only
/// continued while its timer is still running. Otherwise today's work gets a
/// new session (at the task's current rate), and a timer left paused there is
/// finalized like any other deactivation.
pub fn start_task_timer(
    sessions: &mut Vec<TaskSession>,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<(TrayStart, Vec<String>), String> {
    let today = local_day(now);
    if let Some(session) = sessions.iter_mut().find(|s| {
        s.is_active
            && s.task_id == task_id
            && (s.date >= today || s.timer_instances.iter().any(|i| i.is_running))
    }) {
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
    pub(super) fn new(outcome: TrayStart, stopped_task_name: Option<String>) -> Self {
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
