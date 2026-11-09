//! Commands on whole sessions: activate, and move a finished timer to
//! another task.

use crate::model::TaskSession;
use crate::timer::{
    ensure_not_imported, instance_not_found, session_not_found, stop_active_instances,
    timer_task_in,
};
use chrono::{DateTime, Utc};

/// Move one finished timer to another task: the time keeps its start and
/// duration, stays in its session, and earns at the new task's rate. A
/// session's only timer takes the session with it, so a single-task session
/// stays one. Returns the timer's session, and whether anything changed.
pub fn move_instance_to_task(
    sessions: &mut [TaskSession],
    instance_id: &str,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<(String, bool), String> {
    let (session, position) = sessions
        .iter_mut()
        .find_map(|session| {
            let position = session
                .timer_instances
                .iter()
                .position(|i| i.id == instance_id);
            position.map(|position| (session, position))
        })
        .ok_or_else(|| instance_not_found(instance_id))?;
    ensure_not_imported(session)?;
    let instance = &session.timer_instances[position];
    if instance.is_running || instance.is_paused {
        return Err("Stop this timer before moving it to another task".to_string());
    }
    if instance.duration.is_none() {
        return Err("This timer hasn't tracked any time yet".to_string());
    }
    if session.task_id_of(instance) == task_id {
        return Ok((session.id.clone(), false));
    }

    if session.timer_instances.len() == 1 {
        session.task_id = task_id.to_string();
        session.task_name = task_name.to_string();
        session.hourly_rate = hourly_rate;
    }
    let task = timer_task_in(session, task_id, task_name, hourly_rate);
    let instance = &mut session.timer_instances[position];
    instance.task = task;
    instance.updated_at = now.to_rfc3339();
    session.updated_at = now.to_rfc3339();
    Ok((session.id.clone(), true))
}

/// set_active_session: make one session (or none) the active one. Sessions
/// that lose active status have their live timers finalized; returns those
/// timers' ids for `timer-instance-stopped`.
pub fn set_active_session(
    sessions: &mut [TaskSession],
    session_id: Option<&str>,
    now: DateTime<Utc>,
) -> Result<Vec<String>, String> {
    if let Some(id) = session_id {
        let target = sessions
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| session_not_found(id))?;
        ensure_not_imported(target)?;
    }
    let mut stopped = Vec::new();
    for session in sessions.iter_mut() {
        let should_be_active = session_id == Some(session.id.as_str());
        if session.is_active && !should_be_active {
            stopped.extend(stop_active_instances(session, now));
        }
        session.is_active = should_be_active;
    }
    Ok(stopped)
}
