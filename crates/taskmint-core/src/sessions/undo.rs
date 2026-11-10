//! Undo for deletes. `remove_session` (delete_session) returns what it
//! removed; the others put a deleted session, or one deleted timer, back.
//!
//! A restore is checked against the sessions as they are now: the snapshot
//! may be a few seconds old, and in that time the session may have gone or a
//! new timer may have taken the id.

use crate::contract::MAX_TIMER_INSTANCES_PER_SESSION;
use crate::model::{TaskSession, TimerInstance};
use crate::timer::{
    ensure_not_imported, recalculate_total_duration, session_not_found, stop_active_instances,
};
use chrono::{DateTime, Utc};
use std::collections::HashSet;

/// Removes a session and returns it as it would be saved: any live timer
/// finalized at `now`, and inactive. Also returns the ids of the timers that
/// were finalized, for `timer-instance-stopped`.
pub fn remove_session(
    sessions: &mut Vec<TaskSession>,
    session_id: &str,
    now: DateTime<Utc>,
) -> Result<(TaskSession, Vec<String>), String> {
    let index = sessions
        .iter()
        .position(|s| s.id == session_id)
        .ok_or_else(|| session_not_found(session_id))?;
    ensure_not_imported(&sessions[index])?;

    let mut removed = sessions.remove(index);
    let stopped = stop_active_instances(&mut removed, now);
    removed.is_active = false;
    Ok((removed, stopped))
}

fn instance_ids(sessions: &[TaskSession]) -> HashSet<&str> {
    sessions
        .iter()
        .flat_map(|s| s.timer_instances.iter().map(|i| i.id.as_str()))
        .collect()
}

/// Puts a deleted session back, as history (inactive, no live timer).
pub fn restore_session_into(
    sessions: &mut Vec<TaskSession>,
    mut session: TaskSession,
    now: DateTime<Utc>,
) -> Result<TaskSession, String> {
    if sessions.iter().any(|s| s.id == session.id) {
        return Err("This session already exists".to_string());
    }
    ensure_not_imported(&session)?;
    if session.timer_instances.len() > MAX_TIMER_INSTANCES_PER_SESSION {
        return Err(format!(
            "A session can hold at most {} timers",
            MAX_TIMER_INSTANCES_PER_SESSION
        ));
    }
    let existing = instance_ids(sessions);
    let mut seen = HashSet::new();
    for instance in &session.timer_instances {
        if existing.contains(instance.id.as_str()) || !seen.insert(instance.id.as_str()) {
            return Err("A timer in this session already exists".to_string());
        }
    }

    for instance in session.timer_instances.iter_mut() {
        instance.session_id = session.id.clone();
    }
    // A snapshot from delete_session is already finalized; this covers one
    // that wasn't
    stop_active_instances(&mut session, now);
    session.is_active = false;
    recalculate_total_duration(&mut session);
    session.updated_at = now.to_rfc3339();

    sessions.push(session.clone());
    Ok(session)
}

/// Puts a deleted, finished timer back into its session, at `index` (its old
/// place) when given.
pub fn restore_instance_into(
    sessions: &mut [TaskSession],
    session_id: &str,
    mut instance: TimerInstance,
    index: Option<usize>,
    now: DateTime<Utc>,
) -> Result<TaskSession, String> {
    if instance_ids(sessions).contains(instance.id.as_str()) {
        return Err("This timer already exists".to_string());
    }
    if instance.is_running || instance.is_paused {
        return Err("Only a stopped timer can be restored".to_string());
    }
    let session = sessions
        .iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| "The session this timer belonged to no longer exists".to_string())?;
    ensure_not_imported(session)?;
    if session.timer_instances.len() >= MAX_TIMER_INSTANCES_PER_SESSION {
        return Err(format!(
            "A session can hold at most {} timers",
            MAX_TIMER_INSTANCES_PER_SESSION
        ));
    }

    instance.session_id = session.id.clone();
    let at = index
        .unwrap_or(session.timer_instances.len())
        .min(session.timer_instances.len());
    session.timer_instances.insert(at, instance);
    recalculate_total_duration(session);
    session.updated_at = now.to_rfc3339();
    Ok(session.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::WORKLOG_IMPORT_SOURCE;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn instance(id: &str, session_id: &str, duration: Option<u64>) -> TimerInstance {
        TimerInstance {
            id: id.to_string(),
            session_id: session_id.to_string(),
            start_time: ts(0),
            end_time: duration.map(|d| ts((d / 1000) as i64)),
            duration,
            is_running: false,
            is_paused: false,
            paused_at: None,
            paused_duration: None,
            resumed_at: None,
            external_id: None,
            task: None,
            notes: None,
            created_at: ts(0).to_rfc3339(),
            updated_at: ts(0).to_rfc3339(),
            running_on: None,
        }
    }

    fn session(id: &str, instances: Vec<TimerInstance>) -> TaskSession {
        let mut session = TaskSession {
            id: id.to_string(),
            task_id: "task-1".to_string(),
            task_name: "Annotation".to_string(),
            timer_instances: instances,
            total_duration: 0,
            notes: Some("kept".to_string()),
            is_active: false,
            source: None,
            hourly_rate: Some(42.0),
            date: "2026-10-01".to_string(),
            created_at: ts(0).to_rfc3339(),
            updated_at: ts(0).to_rfc3339(),
        };
        recalculate_total_duration(&mut session);
        session
    }

    #[test]
    fn deleting_a_live_session_returns_it_finalized_and_inactive() {
        let mut running = instance("run", "s-1", None);
        running.is_running = true;
        let mut live = session("s-1", vec![instance("done", "s-1", Some(60_000)), running]);
        live.is_active = true;
        let mut sessions = vec![live, session("s-2", vec![])];

        let (removed, stopped) = remove_session(&mut sessions, "s-1", ts(300)).unwrap();

        assert_eq!(sessions.len(), 1);
        assert_eq!(stopped, vec!["run".to_string()]);
        assert!(!removed.is_active);
        assert!(removed
            .timer_instances
            .iter()
            .all(|i| !i.is_running && !i.is_paused));
        assert_eq!(removed.total_duration, 60_000 + 300_000);
    }

    #[test]
    fn imported_sessions_cannot_be_deleted() {
        let mut imported = session("s-1", vec![]);
        imported.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
        let mut sessions = vec![imported];
        assert!(remove_session(&mut sessions, "s-1", ts(0)).is_err());
        assert_eq!(sessions.len(), 1);
    }

    #[test]
    fn a_deleted_session_comes_back_as_it_was() {
        let mut sessions = vec![session("s-1", vec![instance("a", "s-1", Some(1_000))])];
        let (removed, _) = remove_session(&mut sessions, "s-1", ts(10)).unwrap();

        let restored = restore_session_into(&mut sessions, removed, ts(20)).unwrap();

        assert_eq!(sessions.len(), 1);
        assert_eq!(restored.date, "2026-10-01");
        assert_eq!(restored.hourly_rate, Some(42.0));
        assert_eq!(restored.notes.as_deref(), Some("kept"));
        assert_eq!(restored.total_duration, 1_000);
    }

    #[test]
    fn a_restored_session_is_inactive_with_no_live_timer() {
        let mut running = instance("run", "elsewhere", None);
        running.is_running = true;
        let mut snapshot = session("s-1", vec![running]);
        snapshot.is_active = true;
        let mut sessions = vec![];

        let restored = restore_session_into(&mut sessions, snapshot, ts(90)).unwrap();

        assert!(!restored.is_active);
        assert!(!restored.timer_instances[0].is_running);
        assert_eq!(restored.timer_instances[0].session_id, "s-1");
        assert_eq!(restored.total_duration, 90_000);
    }

    #[test]
    fn restoring_a_session_rejects_clashes() {
        let mut sessions = vec![session("s-1", vec![instance("a", "s-1", Some(1_000))])];

        let same_id = session("s-1", vec![]);
        assert_eq!(
            restore_session_into(&mut sessions, same_id, ts(0)).unwrap_err(),
            "This session already exists"
        );

        let timer_taken = session("s-2", vec![instance("a", "s-2", Some(1_000))]);
        assert!(restore_session_into(&mut sessions, timer_taken, ts(0)).is_err());

        let duplicated = session(
            "s-3",
            vec![instance("b", "s-3", Some(1)), instance("b", "s-3", Some(1))],
        );
        assert!(restore_session_into(&mut sessions, duplicated, ts(0)).is_err());

        let mut imported = session("s-4", vec![]);
        imported.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
        assert!(restore_session_into(&mut sessions, imported, ts(0)).is_err());

        let too_many = session(
            "s-5",
            (0..=MAX_TIMER_INSTANCES_PER_SESSION)
                .map(|n| instance(&format!("t{n}"), "s-5", Some(1)))
                .collect(),
        );
        assert!(restore_session_into(&mut sessions, too_many, ts(0)).is_err());

        assert_eq!(sessions.len(), 1);
    }

    #[test]
    fn a_deleted_timer_returns_to_its_place() {
        let mut sessions = vec![session(
            "s-1",
            vec![
                instance("a", "s-1", Some(1_000)),
                instance("c", "s-1", Some(3_000)),
            ],
        )];

        let restored = restore_instance_into(
            &mut sessions,
            "s-1",
            instance("b", "x", Some(2_000)),
            Some(1),
            ts(5),
        )
        .unwrap();

        let ids: Vec<&str> = restored
            .timer_instances
            .iter()
            .map(|i| i.id.as_str())
            .collect();
        assert_eq!(ids, vec!["a", "b", "c"]);
        assert_eq!(restored.timer_instances[1].session_id, "s-1");
        assert_eq!(restored.total_duration, 6_000);
        assert_eq!(sessions[0], restored);
    }

    #[test]
    fn an_out_of_range_place_appends() {
        let mut sessions = vec![session("s-1", vec![instance("a", "s-1", Some(1))])];
        let restored = restore_instance_into(
            &mut sessions,
            "s-1",
            instance("b", "s-1", Some(1)),
            Some(9),
            ts(0),
        )
        .unwrap();
        assert_eq!(restored.timer_instances[1].id, "b");
    }

    #[test]
    fn restoring_a_timer_rejects_what_cannot_come_back() {
        let mut sessions = vec![session("s-1", vec![instance("a", "s-1", Some(1))])];

        assert_eq!(
            restore_instance_into(
                &mut sessions,
                "gone",
                instance("b", "gone", Some(1)),
                None,
                ts(0)
            )
            .unwrap_err(),
            "The session this timer belonged to no longer exists"
        );
        assert!(restore_instance_into(
            &mut sessions,
            "s-1",
            instance("a", "s-1", Some(1)),
            None,
            ts(0)
        )
        .is_err());

        let mut running = instance("r", "s-1", None);
        running.is_running = true;
        assert!(restore_instance_into(&mut sessions, "s-1", running, None, ts(0)).is_err());

        let mut paused = instance("p", "s-1", None);
        paused.is_paused = true;
        assert!(restore_instance_into(&mut sessions, "s-1", paused, None, ts(0)).is_err());

        sessions[0].source = Some(WORKLOG_IMPORT_SOURCE.to_string());
        assert!(restore_instance_into(
            &mut sessions,
            "s-1",
            instance("b", "s-1", Some(1)),
            None,
            ts(0)
        )
        .is_err());

        let mut full = vec![session(
            "s-2",
            (0..MAX_TIMER_INSTANCES_PER_SESSION)
                .map(|n| instance(&format!("t{n}"), "s-2", Some(1)))
                .collect(),
        )];
        assert!(restore_instance_into(
            &mut full,
            "s-2",
            instance("extra", "s-2", Some(1)),
            None,
            ts(0)
        )
        .is_err());
    }

    #[test]
    fn deleting_an_unknown_session_is_refused() {
        let mut sessions = vec![session("s-1", vec![])];
        assert_eq!(
            remove_session(&mut sessions, "gone", ts(0)).unwrap_err(),
            "Session with ID gone not found"
        );
        assert_eq!(sessions.len(), 1);
    }
}
