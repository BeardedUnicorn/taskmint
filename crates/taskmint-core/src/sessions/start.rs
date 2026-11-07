//! Starting work, and the tray's timer actions.
//!
//! Starting a task is one operation shared by the app (start_task) and the
//! tray, so every start path behaves the same: another task's work joins the
//! active session, which only End Session ends. Each operation upholds the
//! same invariants as the instance commands; the host saves the sessions and
//! emits the same timer-instance events.

use crate::contract::{
    MAX_TIMER_INSTANCES_PER_SESSION, START_OUTCOME_ALREADY_RUNNING, START_OUTCOME_RESUMED,
    START_OUTCOME_STARTED,
};
use crate::model::TaskSession;
use crate::timer::{
    begin_instance, compute_final_duration, finalize_instance, max_timers_reached,
    new_task_session, new_timer_instance, pause_instance, recalculate_total_duration,
    resume_instance, stop_active_instances, timer_task_in,
};
use crate::zone::DayZone;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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

/// Where the live timer is, as (session index, instance index): the running
/// instance, else the most recently paused one (a session can hold several).
fn find_live(sessions: &[TaskSession]) -> Option<(usize, usize)> {
    let timers = || {
        sessions.iter().enumerate().flat_map(|(s, session)| {
            session
                .timer_instances
                .iter()
                .enumerate()
                .map(move |(i, instance)| (s, i, instance))
        })
    };
    timers()
        .find(|(_, _, instance)| instance.is_running)
        .or_else(|| {
            timers()
                .filter(|(_, _, instance)| instance.is_paused)
                .max_by_key(|(_, _, instance)| instance.paused_at)
        })
        .map(|(s, i, _)| (s, i))
}

pub fn live_timer(sessions: &[TaskSession], now: DateTime<Utc>) -> Option<LiveTimer> {
    let (s, i) = find_live(sessions)?;
    let session = &sessions[s];
    let instance = &session.timer_instances[i];
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
        task_id: session.task_id_of(instance).to_string(),
        task_name: session.task_name_of(instance).to_string(),
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

/// "Start <task>", from the app or the tray, inside the session that's active:
/// nothing if the task is already running; otherwise whatever is running stops
/// (one timer runs at a time), and the task's paused timer resumes or a new
/// timer starts for it. Returns the outcome and any finalized ids.
fn start_in_session(
    session: &mut TaskSession,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<(TrayStart, Vec<String>), String> {
    let running = session.timer_instances.iter().position(|i| i.is_running);
    if running.is_some_and(|i| session.task_id_of(&session.timer_instances[i]) == task_id) {
        return Ok((TrayStart::AlreadyRunning, Vec::new()));
    }
    let paused = session
        .timer_instances
        .iter()
        .enumerate()
        .filter(|(_, i)| i.is_paused && session.task_id_of(i) == task_id)
        .max_by_key(|(_, i)| i.paused_at)
        .map(|(index, _)| index);
    // Before anything changes: a refused start must not stop the running timer
    if paused.is_none() && session.timer_instances.len() >= MAX_TIMER_INSTANCES_PER_SESSION {
        return Err(max_timers_reached());
    }

    let mut stopped = Vec::new();
    if let Some(index) = running {
        let instance = &mut session.timer_instances[index];
        finalize_instance(instance, now);
        stopped.push(instance.id.clone());
        recalculate_total_duration(session);
    }
    let outcome = if let Some(index) = paused {
        let instance = &mut session.timer_instances[index];
        resume_instance(instance, now);
        TrayStart::Resumed(instance.id.clone())
    } else {
        let mut instance = new_timer_instance(&session.id, now);
        instance.task = timer_task_in(session, task_id, task_name, hourly_rate);
        begin_instance(&mut instance, now);
        let id = instance.id.clone();
        session.timer_instances.push(instance);
        TrayStart::Started(id)
    };
    session.updated_at = now.to_rfc3339();
    Ok((outcome, stopped))
}

/// "Start <task>", from the app or the tray: work joins the active session
/// (see start_in_session); with none, a new active session opens for the task
/// with a running timer. Returns the outcome and any finalized ids.
///
/// Sessions are per day: an active session from an earlier day (in `zone`)
/// only continues while the requested task is what's running in it. Otherwise
/// today's work gets a new session (at the task's current rate), finalizing
/// the old one's live timers (a deactivated session must not keep one).
pub fn start_task_timer(
    sessions: &mut Vec<TaskSession>,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
    zone: DayZone,
) -> Result<(TrayStart, Vec<String>), String> {
    let today = zone.day(now);
    if let Some(session) = sessions.iter_mut().find(|s| {
        s.is_active
            && (s.date >= today
                || s.timer_instances
                    .iter()
                    .any(|i| i.is_running && s.task_id_of(i) == task_id))
    }) {
        return start_in_session(session, task_id, task_name, hourly_rate, now);
    }

    let mut stopped = Vec::new();
    for session in sessions.iter_mut() {
        if session.is_active {
            stopped.extend(stop_active_instances(session, now));
        }
        session.is_active = false;
    }
    let mut session = new_task_session(
        task_id.to_string(),
        task_name.to_string(),
        hourly_rate,
        now,
        zone,
    );
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
    let (s, i) = find_live(sessions)?;
    let session = &mut sessions[s];
    let instance = &mut session.timer_instances[i];
    finalize_instance(instance, now);
    let instance_id = instance.id.clone();
    session.updated_at = now.to_rfc3339();
    recalculate_total_duration(session);
    Some(instance_id)
}

/// Pause the running timer (a paused or absent one is left alone), like
/// pause_timer_instance. Returns its id, or None when nothing was running.
pub fn pause_live_timer(sessions: &mut [TaskSession], now: DateTime<Utc>) -> Option<String> {
    let (session, index) = sessions.iter_mut().find_map(|session| {
        let index = session.timer_instances.iter().position(|i| i.is_running);
        index.map(|index| (session, index))
    })?;
    let instance = &mut session.timer_instances[index];
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
    zone: DayZone,
) -> Result<(TrayStart, Vec<String>, Option<String>), String> {
    let previous = live_timer(sessions, now);
    let (outcome, stopped) =
        start_task_timer(sessions, task_id, task_name, hourly_rate, now, zone)?;
    let handoff = previous
        .filter(|live| stopped.contains(&live.instance_id))
        .map(|live| live.task_name);
    Ok((outcome, stopped, handoff))
}

/// What start_task reports back to the app (camelCase for the frontend).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct StartTaskResult {
    #[cfg_attr(
        feature = "ts",
        ts(type = r#""started" | "resumed" | "alreadyRunning""#)
    )]
    pub outcome: String,
    pub instance_id: Option<String>,
    /// Task whose live timer this start finalized, if any.
    pub stopped_task_name: Option<String>,
}

impl StartTaskResult {
    pub fn new(outcome: TrayStart, stopped_task_name: Option<String>) -> Self {
        let (outcome, instance_id) = match outcome {
            TrayStart::Started(id) => (START_OUTCOME_STARTED, Some(id)),
            TrayStart::Resumed(id) => (START_OUTCOME_RESUMED, Some(id)),
            TrayStart::AlreadyRunning => (START_OUTCOME_ALREADY_RUNNING, None),
        };
        Self {
            outcome: outcome.to_string(),
            instance_id,
            stopped_task_name,
        }
    }
}
