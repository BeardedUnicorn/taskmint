//! Commands on whole sessions: edit, clear notes, activate, and move a
//! finished timer to another task.

use crate::model::TaskSession;
use crate::timer::{
    ensure_not_imported, instance_not_found, new_task_session, recalculate_total_duration,
    session_not_found, stop_active_instances,
};
use crate::zone::DayZone;
use chrono::{DateTime, Utc};
use serde::Deserialize;

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

/// update_session: apply the patch and stamp the session. Returns it as
/// changed.
pub fn update_session(
    sessions: &mut [TaskSession],
    session_id: &str,
    updates: &SessionUpdates,
    now: DateTime<Utc>,
) -> Result<TaskSession, String> {
    let session = sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| session_not_found(session_id))?;

    if let Some(notes) = updates.notes.as_ref() {
        session.notes = Some(notes.clone());
    }
    if let Some(is_active) = updates.is_active {
        session.is_active = is_active;
    }
    session.updated_at = now.to_rfc3339();
    Ok(session.clone())
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

/// Move one finished timer to another task: the time keeps its start and
/// duration, and earns at the new task's rate. A timer that is its session's
/// only one (in an inactive session) re-points the session; otherwise it
/// moves into a new inactive session for the task, dated by the day (in
/// `zone`) the timer started. Returns the session the timer ends up in, and
/// whether anything changed.
pub fn move_instance_to_task(
    sessions: &mut Vec<TaskSession>,
    instance_id: &str,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
    zone: DayZone,
) -> Result<(String, bool), String> {
    let (index, position) = sessions
        .iter()
        .enumerate()
        .find_map(|(index, session)| {
            let position = session
                .timer_instances
                .iter()
                .position(|i| i.id == instance_id);
            position.map(|position| (index, position))
        })
        .ok_or_else(|| instance_not_found(instance_id))?;
    let session = &mut sessions[index];
    ensure_not_imported(session)?;
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

    // The session keeps at least one timer here unless it is the active one
    // (an inactive session's only timer re-points it, above), so it stays.
    let mut instance = session.timer_instances.remove(position);
    recalculate_total_duration(session);
    session.updated_at = now.to_rfc3339();
    let source = session.source.clone();

    let mut moved = new_task_session(
        task_id.to_string(),
        task_name.to_string(),
        hourly_rate,
        now,
        zone,
    );
    moved.is_active = false;
    moved.source = source;
    moved.date = zone.day(instance.start_time);
    instance.session_id = moved.id.clone();
    instance.updated_at = now.to_rfc3339();
    moved.timer_instances.push(instance);
    recalculate_total_duration(&mut moved);
    let moved_id = moved.id.clone();
    sessions.push(moved);
    Ok((moved_id, true))
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
