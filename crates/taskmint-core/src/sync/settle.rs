//! After other devices' changes come in, the sessions may break the rules a
//! single device keeps: two sessions active, or two timers running (one
//! started on the phone, one on the computer, before either heard of the
//! other). Settling puts them right the way a hand-off would have: the timer
//! started last keeps running, and every other one stops when it started.
//!
//! It never reads the clock, so every device settles the same data the same
//! way and they agree without another round of changes.

use crate::model::TaskSession;
use crate::timer::{finalize_instance, recalculate_total_duration};
use chrono::{DateTime, Utc};

/// When a timer last started running: its last resume, or its start.
fn started(instance: &crate::model::TimerInstance) -> DateTime<Utc> {
    instance.resumed_at.unwrap_or(instance.start_time)
}

/// The session and timer that keep going: the timer that started running
/// last (by id when two started together), else the active session last
/// changed. None when nothing is live or active.
fn winner(sessions: &[TaskSession]) -> Option<(usize, Option<usize>)> {
    let running = sessions
        .iter()
        .enumerate()
        .flat_map(|(s, session)| {
            session
                .timer_instances
                .iter()
                .enumerate()
                .filter(|(_, instance)| instance.is_running && !instance.is_paused)
                .map(move |(i, instance)| ((started(instance), &instance.id), s, i))
        })
        .max_by(|a, b| a.0.cmp(&b.0));
    if let Some((_, s, i)) = running {
        return Some((s, Some(i)));
    }
    sessions
        .iter()
        .enumerate()
        .filter(|(_, session)| session.is_active)
        .max_by(|(_, a), (_, b)| (&a.updated_at, &a.id).cmp(&(&b.updated_at, &b.id)))
        .map(|(s, _)| (s, None))
}

/// Settles `sessions`; whether anything changed.
pub fn settle(sessions: &mut [TaskSession]) -> bool {
    let Some((winner_session, winner_timer)) = winner(sessions) else {
        return false;
    };
    // Timers that lose stop when the winner started (a paused one keeps the
    // time it had when paused, whenever it's stopped)
    let at = winner_timer.map(|i| started(&sessions[winner_session].timer_instances[i]));
    let mut changed = false;
    for (s, session) in sessions.iter_mut().enumerate() {
        let wins = s == winner_session;
        let mut stopped = false;
        for (i, instance) in session.timer_instances.iter_mut().enumerate() {
            let live = instance.is_running || instance.is_paused;
            // The winning session keeps its winning timer and its paused ones
            let keeps = wins && (winner_timer == Some(i) || instance.is_paused);
            if !live || keeps {
                continue;
            }
            let own = instance.paused_at.unwrap_or(instance.start_time);
            finalize_instance(instance, at.map_or(own, |at| at.max(own)));
            stopped = true;
        }
        if stopped {
            recalculate_total_duration(session);
        }
        if session.is_active != wins {
            session.is_active = wins;
            if let Some(at) = at {
                session.updated_at = at.to_rfc3339();
            }
            stopped = true;
        }
        changed |= stopped;
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TimerInstance;
    use chrono::TimeZone;
    use serde_json::json;

    fn at(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_800_000_000 + secs, 0).unwrap()
    }

    fn timer(id: &str, start: i64) -> TimerInstance {
        serde_json::from_value(json!({
            "id": id,
            "sessionId": "s",
            "startTime": at(start),
            "endTime": null,
            "duration": null,
            "isRunning": true,
            "isPaused": false,
            "pausedAt": null,
            "pausedDuration": 0,
            "resumedAt": null,
            "notes": null,
        }))
        .unwrap()
    }

    fn paused(id: &str, start: i64, paused_at: i64) -> TimerInstance {
        TimerInstance {
            is_running: false,
            is_paused: true,
            paused_at: Some(at(paused_at)),
            ..timer(id, start)
        }
    }

    fn finished(id: &str, start: i64, secs: u64) -> TimerInstance {
        TimerInstance {
            is_running: false,
            end_time: Some(at(start + secs as i64)),
            duration: Some(secs * 1000),
            ..timer(id, start)
        }
    }

    fn session(id: &str, active: bool, updated: &str, timers: Vec<TimerInstance>) -> TaskSession {
        let mut session: TaskSession = serde_json::from_value(json!({
            "id": id,
            "taskId": "t",
            "taskName": "T",
            "notes": null,
            "isActive": active,
            "updatedAt": updated,
        }))
        .unwrap();
        session.timer_instances = timers;
        recalculate_total_duration(&mut session);
        session
    }

    #[test]
    fn the_timer_started_last_keeps_running_and_the_others_stop_when_it_started() {
        let mut sessions = vec![
            session("desk", true, "a", vec![timer("d", 0)]),
            session(
                "phone",
                true,
                "b",
                vec![finished("old", -100, 10), timer("p", 60)],
            ),
        ];
        assert!(settle(&mut sessions));
        let desk = &sessions[0];
        assert!(!desk.is_active);
        assert_eq!(desk.timer_instances[0].end_time, Some(at(60)));
        assert_eq!(desk.timer_instances[0].duration, Some(60_000));
        assert_eq!(desk.total_duration, 60_000);
        assert_eq!(desk.updated_at, at(60).to_rfc3339());
        let phone = &sessions[1];
        assert!(phone.is_active);
        assert!(phone.timer_instances[1].is_running);
        // Settled data settles to itself
        assert!(!settle(&mut sessions));
    }

    #[test]
    fn a_resume_counts_as_a_start_and_ties_go_by_id() {
        let resumed = TimerInstance {
            resumed_at: Some(at(100)),
            ..timer("b", 0)
        };
        let mut sessions = vec![session(
            "s",
            true,
            "a",
            vec![timer("a", 100), resumed, timer("c", 50)],
        )];
        assert!(settle(&mut sessions));
        let timers = &sessions[0].timer_instances;
        assert!(!timers[0].is_running);
        assert!(timers[1].is_running);
        assert_eq!(timers[2].end_time, Some(at(100)));
    }

    #[test]
    fn a_paused_timer_in_the_winning_session_stays_paused_and_elsewhere_keeps_its_time() {
        let mut sessions = vec![
            session("old", true, "a", vec![paused("p", 0, 30)]),
            session("new", false, "b", vec![paused("q", 0, 10), timer("r", 60)]),
        ];
        assert!(settle(&mut sessions));
        let stopped = &sessions[0].timer_instances[0];
        assert!(!stopped.is_paused);
        assert_eq!(stopped.end_time, Some(at(60)));
        assert_eq!(stopped.duration, Some(30_000));
        assert!(!sessions[0].is_active);
        assert!(sessions[1].is_active);
        assert!(sessions[1].timer_instances[0].is_paused);
    }

    #[test]
    fn with_nothing_running_the_active_session_changed_last_stays_active() {
        let mut sessions = vec![
            session("a", true, "2026-11-01", vec![paused("p", 0, 30)]),
            session("b", true, "2026-11-02", vec![paused("q", 0, 10)]),
            session("c", true, "2026-11-02", vec![]),
        ];
        assert!(settle(&mut sessions));
        assert_eq!(
            sessions.iter().map(|s| s.is_active).collect::<Vec<_>>(),
            [false, false, true]
        );
        // Stopped at its pause, and its session's time stays as it was
        let p = &sessions[0].timer_instances[0];
        assert_eq!((p.end_time, p.duration), (Some(at(30)), Some(30_000)));
        assert_eq!(sessions[0].updated_at, "2026-11-01");
        let q = &sessions[1].timer_instances[0];
        assert_eq!(q.end_time, Some(at(10)));
    }

    #[test]
    fn nothing_live_or_active_is_left_alone() {
        let mut sessions = vec![session("a", false, "a", vec![finished("f", 0, 5)])];
        assert!(!settle(&mut sessions));
        assert!(!settle(&mut []));
    }
}
