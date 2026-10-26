//! Starting work, and the tray's timer actions.
//!
//! Starting a task is one operation shared by the app (start_task) and the
//! tray, so every start path behaves the same. Each operation upholds the
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
    resume_instance, stop_active_instances,
};
use crate::zone::DayZone;
use chrono::{DateTime, Utc};
use serde::Serialize;

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
/// instance, else a paused one.
fn find_live(sessions: &[TaskSession]) -> Option<(usize, usize)> {
    let find = |paused: bool| {
        sessions.iter().enumerate().find_map(|(s, session)| {
            session
                .timer_instances
                .iter()
                .position(|i| if paused { i.is_paused } else { i.is_running })
                .map(|i| (s, i))
        })
    };
    find(false).or_else(|| find(true))
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
/// Sessions are per day: an active session from an earlier day (in `zone`)
/// is only continued while its timer is still running. Otherwise today's work
/// gets a new session (at the task's current rate), and a timer left paused
/// there is finalized like any other deactivation.
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
                return Err(max_timers_reached());
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
