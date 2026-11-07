//! Unit tests for the session commands and their helpers.

use super::instances::{self, *};
use super::lifecycle::{self, *};
use super::manual::*;
use super::start::*;
use super::task_links::*;
use crate::contract::{
    ERR_ANOTHER_TIMER_RUNNING, ERR_PAUSE_NOT_RUNNING, ERR_RESUME_INACTIVE_SESSION,
    ERR_START_INACTIVE_SESSION, ERR_STOP_NOT_RUNNING, EXPORT_CANCELLED, MANUAL_SOURCE,
    MAX_TIMER_INSTANCES_PER_SESSION, WORKLOG_IMPORT_SOURCE,
};
use crate::model::{Task, TaskSession, TimerInstance, TimerTask, WorkLogEntry};
use crate::timer::*;
use crate::zone::DayZone;
use chrono::TimeZone;
use chrono::{DateTime, Local, Utc};

/// What the desktop app passes: the machine's own zone.
const LOCAL: DayZone = DayZone::Local;

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
        task: None,
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
fn tray_start_after_an_earlier_days_session_opens_a_new_one_and_finalizes_its_timer() {
    let mut running = tray_instance("r", "cur", 0);
    running.is_running = true;
    running.paused_duration = Some(0);
    let mut cur = tray_session("cur", "a", true);
    cur.date = "1960-01-01".to_string();
    cur.timer_instances = vec![running];
    let mut sessions = vec![cur];

    let (outcome, stopped) =
        start_task_timer(&mut sessions, "b", "Task b", None, ts(60), LOCAL).unwrap();

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
        start_task_timer(&mut sessions, "a", "Task a", None, ts(100), LOCAL).unwrap();

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

    let (outcome, _) = start_task_timer(&mut sessions, "a", "Task a", None, ts(90), LOCAL).unwrap();

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
        start_task_timer(&mut sessions, "a", "Task a", None, ts(90), LOCAL).unwrap();

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
        start_task_with_handoff(&mut sessions, "b", "Task b", None, ts(60), LOCAL).unwrap();

    assert_eq!(
        outcome,
        TrayStart::Started(sessions[0].timer_instances[1].id.clone())
    );
    assert_eq!(stopped, vec!["r".to_string()]);
    assert_eq!(handoff.as_deref(), Some("Task a"));
}

fn timer_task(task_id: &str, rate: Option<f64>) -> TimerTask {
    TimerTask {
        task_id: task_id.to_string(),
        task_name: format!("Task {}", task_id),
        hourly_rate: rate,
    }
}

fn running_on(id: &str, session_id: &str, task: Option<TimerTask>) -> TimerInstance {
    TimerInstance {
        is_running: true,
        paused_duration: Some(0),
        task,
        ..tray_instance(id, session_id, 0)
    }
}

fn paused_on(id: &str, session_id: &str, task: Option<TimerTask>, at: i64) -> TimerInstance {
    TimerInstance {
        is_paused: true,
        paused_at: Some(ts(at)),
        paused_duration: Some(0),
        task,
        ..tray_instance(id, session_id, 0)
    }
}

#[test]
fn a_timer_belongs_to_its_own_task_else_its_sessions() {
    let session = tray_session("s", "a", true);
    let own = tray_instance("own", "s", 0);
    let other = TimerInstance {
        task: Some(timer_task("b", None)),
        ..tray_instance("other", "s", 0)
    };
    assert_eq!(session.task_id_of(&own), "a");
    assert_eq!(session.task_name_of(&own), "Task a");
    assert_eq!(session.task_id_of(&other), "b");
    assert_eq!(session.task_name_of(&other), "Task b");
}

#[test]
fn starting_another_task_joins_the_active_session_at_its_rate() {
    let mut cur = tray_session("cur", "a", true);
    cur.hourly_rate = Some(20.0);
    cur.timer_instances = vec![running_on("r", "cur", None)];
    let mut sessions = vec![cur];

    let (outcome, stopped) =
        start_task_timer(&mut sessions, "b", "Task b", Some(50.0), ts(60), LOCAL).unwrap();

    assert_eq!(sessions.len(), 1);
    assert!(sessions[0].is_active);
    assert_eq!(stopped, vec!["r".to_string()]);
    let [first, second] = &sessions[0].timer_instances[..] else {
        panic!("expected two timers");
    };
    assert!(!first.is_running);
    assert_eq!(first.duration, Some(60_000));
    assert_eq!(sessions[0].total_duration, 60_000);
    assert_eq!(outcome, TrayStart::Started(second.id.clone()));
    assert!(second.is_running);
    assert_eq!(second.task, Some(timer_task("b", Some(50.0))));
    // The session itself is still the one opened for a, at a's rate
    assert_eq!(sessions[0].task_id, "a");
    assert_eq!(sessions[0].hourly_rate, Some(20.0));
}

#[test]
fn starting_the_sessions_own_task_records_no_timer_task() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = vec![running_on("r", "cur", Some(timer_task("b", None)))];
    let mut sessions = vec![cur];

    let (outcome, stopped) =
        start_task_timer(&mut sessions, "a", "Task a", Some(50.0), ts(60), LOCAL).unwrap();

    assert!(matches!(outcome, TrayStart::Started(_)));
    assert_eq!(stopped, vec!["r".to_string()]);
    assert_eq!(sessions[0].timer_instances[1].task, None);
}

#[test]
fn starting_the_running_timers_task_changes_nothing() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = vec![
        tray_instance("idle", "cur", 0),
        running_on("r", "cur", Some(timer_task("b", None))),
    ];
    let before = cur.clone();
    let mut sessions = vec![cur];

    let (outcome, stopped) =
        start_task_timer(&mut sessions, "b", "Task b", None, ts(60), LOCAL).unwrap();

    assert_eq!(outcome, TrayStart::AlreadyRunning);
    assert!(stopped.is_empty());
    assert_eq!(sessions[0], before);
}

#[test]
fn start_resumes_the_tasks_latest_paused_timer_and_stops_what_runs() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = vec![
        paused_on("older", "cur", Some(timer_task("b", None)), 10),
        paused_on("latest", "cur", Some(timer_task("b", None)), 20),
        // Paused on another task: not this start's business
        paused_on("other", "cur", None, 30),
        running_on("r", "cur", Some(timer_task("c", None))),
    ];
    let mut sessions = vec![cur];

    let (outcome, stopped, handoff) =
        start_task_with_handoff(&mut sessions, "b", "Task b", None, ts(60), LOCAL).unwrap();

    assert_eq!(outcome, TrayStart::Resumed("latest".to_string()));
    assert_eq!(stopped, vec!["r".to_string()]);
    assert_eq!(handoff.as_deref(), Some("Task c"));
    let timers = &sessions[0].timer_instances;
    assert_eq!(timers.len(), 4);
    assert!(timers[0].is_paused);
    assert!(timers[1].is_running);
    assert!(timers[2].is_paused);
    assert!(!timers[3].is_running && timers[3].duration.is_some());
}

#[test]
fn start_leaves_paused_timers_of_other_tasks_alone() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = vec![paused_on("p", "cur", None, 30)];
    let mut sessions = vec![cur];

    let (outcome, stopped, handoff) =
        start_task_with_handoff(&mut sessions, "b", "Task b", None, ts(60), LOCAL).unwrap();

    assert!(matches!(outcome, TrayStart::Started(_)));
    assert!(stopped.is_empty());
    assert_eq!(handoff, None);
    assert!(sessions[0].timer_instances[0].is_paused);
}

#[test]
fn an_earlier_days_session_continues_only_for_the_task_running_in_it() {
    let now = ts(1_800_000_000);
    let earlier = |timer: TimerInstance| {
        let mut session = tray_session("old", "a", true);
        session.date = "2020-01-01".to_string();
        session.timer_instances = vec![timer];
        session
    };

    // The requested task is the one running, on a timer's own task
    let mut sessions = vec![earlier(running_on("r", "old", Some(timer_task("b", None))))];
    let (outcome, _) = start_task_timer(&mut sessions, "b", "Task b", None, now, LOCAL).unwrap();
    assert_eq!(outcome, TrayStart::AlreadyRunning);
    assert_eq!(sessions.len(), 1);

    // Any other task gets today's own session; the old one's timer stops
    let (outcome, stopped) =
        start_task_timer(&mut sessions, "c", "Task c", None, now, LOCAL).unwrap();
    assert!(matches!(outcome, TrayStart::Started(_)));
    assert_eq!(stopped, vec!["r".to_string()]);
    assert_eq!(sessions.len(), 2);
    assert!(!sessions[0].is_active);
    assert_eq!(sessions[1].task_id, "c");
    assert_eq!(sessions[1].date, LOCAL.day(now));
}

#[test]
fn a_full_session_refuses_a_new_task_without_stopping_what_runs() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = (0..MAX_TIMER_INSTANCES_PER_SESSION)
        .map(|n| finished(&format!("t{n}"), "cur", 0, 1))
        .collect();
    cur.timer_instances[0] = running_on("r", "cur", None);
    let before = cur.clone();
    let mut sessions = vec![cur];

    assert!(start_task_timer(&mut sessions, "b", "Task b", None, ts(60), LOCAL).is_err());
    assert_eq!(sessions[0], before);
}

#[test]
fn a_full_session_can_still_resume_a_paused_timer() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = (0..MAX_TIMER_INSTANCES_PER_SESSION)
        .map(|n| finished(&format!("t{n}"), "cur", 0, 1))
        .collect();
    cur.timer_instances[0] = paused_on("p", "cur", Some(timer_task("b", None)), 30);
    let mut sessions = vec![cur];

    let (outcome, _) = start_task_timer(&mut sessions, "b", "Task b", None, ts(60), LOCAL).unwrap();
    assert_eq!(outcome, TrayStart::Resumed("p".to_string()));
}

#[test]
fn the_live_timer_is_on_its_own_task_and_prefers_running_then_latest_paused() {
    let mut cur = tray_session("cur", "a", true);
    cur.timer_instances = vec![
        paused_on("older", "cur", None, 10),
        paused_on("latest", "cur", Some(timer_task("b", None)), 20),
        paused_on("middle", "cur", None, 15),
    ];
    let mut sessions = vec![cur];

    let live = live_timer(&sessions, ts(60)).unwrap();
    assert_eq!(live.instance_id, "latest");
    assert_eq!(live.task_id, "b");
    assert_eq!(live.task_name, "Task b");
    assert!(live.is_paused);

    sessions[0]
        .timer_instances
        .push(running_on("r", "cur", Some(timer_task("c", None))));
    let live = live_timer(&sessions, ts(60)).unwrap();
    assert_eq!(live.instance_id, "r");
    assert_eq!(live.task_name, "Task c");
    assert!(!live.is_paused);
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
        start_task_with_handoff(&mut sessions, "a", "Task a", None, ts(90), LOCAL).unwrap();

    assert_eq!(outcome, TrayStart::Resumed("p".to_string()));
    assert_eq!(handoff, None);
}

#[test]
fn start_has_no_handoff_when_nothing_was_live() {
    let mut sessions = vec![tray_session("old", "a", false)];
    let (_, stopped, handoff) =
        start_task_with_handoff(&mut sessions, "b", "Task b", None, ts(10), LOCAL).unwrap();
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

fn entry<'a>(
    task_id: &'a str,
    task_name: &'a str,
    hourly_rate: Option<f64>,
    start: DateTime<Utc>,
    duration_ms: u64,
) -> ManualEntry<'a> {
    ManualEntry {
        task_id,
        task_name,
        hourly_rate,
        start,
        duration_ms,
    }
}

#[test]
fn manual_time_rejects_invalid_entries() {
    let now = ts(100_000);
    let start = ts(10_000);
    assert!(
        build_manual_session(&[], &entry("", "Task", None, start, HOUR_MS), now, LOCAL).is_err()
    );
    assert_eq!(
        build_manual_session(&[], &entry("a", "Task a", None, start, 0), now, LOCAL).unwrap_err(),
        "Duration must be greater than zero"
    );
    assert_eq!(
        build_manual_session(
            &[],
            &entry("a", "Task a", None, start, 24 * HOUR_MS + 1),
            now,
            LOCAL
        )
        .unwrap_err(),
        "A time entry can be at most 24 hours"
    );
    // Ends 30 minutes after "now"
    assert_eq!(
        build_manual_session(
            &[],
            &entry("a", "Task a", None, ts(98_000), HOUR_MS),
            now,
            LOCAL
        )
        .unwrap_err(),
        "The time entry can't end in the future"
    );
    // Ending within the clock-skew tolerance is fine
    assert!(build_manual_session(
        &[],
        &entry("a", "Task a", None, ts(96_430), HOUR_MS),
        now,
        LOCAL
    )
    .is_ok());
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
        &entry("a", "Task a", None, ts(12_000), HOUR_MS),
        now,
        LOCAL,
    )
    .unwrap_err();
    assert!(err.contains("Earlier work"), "{}", err);
    // A timer on another task is named by its own task
    let mut mixed = done.clone();
    mixed.timer_instances[0].task = Some(timer_task("b", None));
    let err = build_manual_session(
        &[mixed],
        &entry("a", "Task a", None, ts(12_000), HOUR_MS),
        now,
        LOCAL,
    )
    .unwrap_err();
    assert!(err.contains("Task b"), "{}", err);
    // Touching end to start is not an overlap
    assert!(build_manual_session(
        &[done.clone()],
        &entry("a", "Task a", None, ts(13_600), HOUR_MS),
        now,
        LOCAL
    )
    .is_ok());
    assert!(build_manual_session(
        &[done],
        &entry("a", "Task a", None, ts(6_400), HOUR_MS),
        now,
        LOCAL
    )
    .is_ok());

    // A live timer occupies its start up to now
    let mut live = tray_instance("r", "cur", 90_000);
    live.is_running = true;
    let mut cur = tray_session("cur", "b", true);
    cur.timer_instances = vec![live];
    assert!(build_manual_session(
        &[cur.clone()],
        &entry("a", "Task a", None, ts(88_000), HOUR_MS),
        now,
        LOCAL
    )
    .is_err());
    // Idle (never run) timers occupy nothing
    let mut idle_session = tray_session("idle", "c", true);
    idle_session.timer_instances = vec![tray_instance("i", "idle", 88_000)];
    assert!(build_manual_session(
        &[idle_session],
        &entry("a", "Task a", None, ts(88_000), HOUR_MS),
        now,
        LOCAL
    )
    .is_ok());
}

#[test]
fn manual_time_builds_an_inactive_manual_session_on_the_local_start_day() {
    let now = ts(100_000);
    let start = ts(20_000);

    let session = build_manual_session(
        &[],
        &entry("a", "Task a", None, start, 90 * 60_000),
        now,
        LOCAL,
    )
    .unwrap();

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
    start_task_timer(&mut sessions, "a", "Task a", Some(40.0), ts(0), LOCAL).unwrap();
    assert_eq!(sessions[0].hourly_rate, Some(40.0));

    // Pause, then start the same task again at a new rate: same session,
    // same rate.
    pause_live_timer(&mut sessions, ts(60));
    start_task_timer(&mut sessions, "a", "Task a", Some(55.0), ts(120), LOCAL).unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].hourly_rate, Some(40.0));

    // Another task's timer joins it, at that task's own rate
    start_task_timer(&mut sessions, "b", "Task b", Some(25.0), ts(180), LOCAL).unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].hourly_rate, Some(40.0));
    assert_eq!(
        sessions[0].timer_instances[1].task,
        Some(timer_task("b", Some(25.0)))
    );
}

#[test]
fn manual_time_captures_the_rate() {
    let session = build_manual_session(
        &[],
        &entry("a", "Task a", Some(32.5), ts(1_000), 60_000),
        ts(10_000),
        LOCAL,
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
        task: None,
        duration: Some(minutes * 60_000),
        ..tray_instance(id, "imp", 0)
    };
    let mut imported = tray_session("imp", "a", false);
    imported.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
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

#[test]
fn clearing_notes_touches_only_the_given_sessions() {
    let with_notes = |id: &str, notes: Option<&str>| {
        let mut s = fresh_session();
        s.id = id.to_string();
        s.notes = notes.map(str::to_string);
        s
    };
    let mut sessions = vec![
        with_notes("a", Some("moved")),
        with_notes("b", Some("")),
        with_notes("c", None),
        with_notes("d", Some("not asked for")),
    ];
    let ids = ["a", "b", "c"].map(String::from);

    assert_eq!(clear_notes(&mut sessions, &ids), 1);
    assert_eq!(sessions[0].notes, None);
    assert_eq!(sessions[3].notes.as_deref(), Some("not asked for"));
    // Nothing left to clear the second time
    assert_eq!(clear_notes(&mut sessions, &ids), 0);
}
// --- task names, day rollover, moving time --------------------------------

#[test]
fn a_rename_reaches_every_session_of_that_task_only() {
    let mut sessions = vec![
        tray_session("s1", "a", false),
        tray_session("s2", "b", false),
        tray_session("s3", "a", true),
    ];
    let mut renamed = rated_task("a", None);
    renamed.name = "Renamed".to_string();
    let tasks = vec![renamed, rated_task("b", None)];

    assert!(sync_session_task_names(&mut sessions, &tasks));
    assert_eq!(sessions[0].task_name, "Renamed");
    assert_eq!(sessions[1].task_name, "Task b");
    assert_eq!(sessions[2].task_name, "Renamed");
    // Already in sync: nothing to save the second time
    assert!(!sync_session_task_names(&mut sessions, &tasks));
}

#[test]
fn starting_a_task_whose_active_session_is_from_an_earlier_day_opens_a_new_one() {
    let now = ts(1_800_000_000);
    let mut old = tray_session("old", "a", true);
    old.date = "2000-01-01".to_string();
    old.hourly_rate = Some(20.0);
    old.timer_instances = vec![finished("done", "old", 0, 60)];
    let mut sessions = vec![old];

    let (outcome, stopped) =
        start_task_timer(&mut sessions, "a", "Task a", Some(30.0), now, LOCAL).unwrap();

    assert!(stopped.is_empty());
    assert!(!sessions[0].is_active);
    let today = &sessions[1];
    assert!(today.is_active);
    assert_eq!(today.date, LOCAL.day(now));
    assert_eq!(today.hourly_rate, Some(30.0));
    assert_eq!(
        outcome,
        TrayStart::Started(today.timer_instances[0].id.clone())
    );
}

#[test]
fn a_timer_left_paused_on_an_earlier_day_is_finalized_by_the_rollover() {
    let now = ts(1_800_000_000);
    let mut paused = tray_instance("p", "old", 0);
    paused.is_paused = true;
    paused.paused_at = Some(ts(60));
    paused.paused_duration = Some(0);
    let mut old = tray_session("old", "a", true);
    old.date = "2000-01-01".to_string();
    old.timer_instances = vec![paused];
    let mut sessions = vec![old];

    let (_, stopped) = start_task_timer(&mut sessions, "a", "Task a", None, now, LOCAL).unwrap();

    assert_eq!(stopped, vec!["p".to_string()]);
    assert_eq!(sessions[0].timer_instances[0].duration, Some(60_000));
    assert_eq!(sessions.len(), 2);
}

#[test]
fn a_timer_still_running_from_an_earlier_day_keeps_its_session() {
    let now = ts(1_800_000_000);
    let mut running = tray_instance("r", "old", 0);
    running.is_running = true;
    let mut old = tray_session("old", "a", true);
    old.date = "2000-01-01".to_string();
    old.timer_instances = vec![running];
    let mut sessions = vec![old];

    let (outcome, _) = start_task_timer(&mut sessions, "a", "Task a", None, now, LOCAL).unwrap();
    assert_eq!(outcome, TrayStart::AlreadyRunning);
    assert_eq!(sessions.len(), 1);
}

#[test]
fn a_same_day_session_is_continued() {
    let now = ts(1_800_000_000);
    let mut cur = tray_session("cur", "a", true);
    cur.date = LOCAL.day(now);
    cur.timer_instances = vec![finished("done", "cur", 0, 60)];
    let mut sessions = vec![cur];

    start_task_timer(&mut sessions, "a", "Task a", None, now, LOCAL).unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].timer_instances.len(), 2);
}

#[test]
fn moving_a_sessions_only_timer_repoints_the_session() {
    let mut only = tray_session("s", "a", false);
    only.hourly_rate = Some(20.0);
    only.timer_instances = vec![finished("t", "s", 0, 60)];
    let mut sessions = vec![only];

    let (id, changed) =
        move_instance_to_task(&mut sessions, "t", "b", "Task b", Some(50.0), ts(100)).unwrap();

    assert!(changed);
    assert_eq!(id, "s");
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].task_id, "b");
    assert_eq!(sessions[0].task_name, "Task b");
    assert_eq!(sessions[0].hourly_rate, Some(50.0));
}

#[test]
fn moving_one_of_several_timers_keeps_it_in_its_session() {
    let start = 1_800_000_000;
    let mut cur = tray_session("s", "a", true);
    cur.hourly_rate = Some(20.0);
    cur.timer_instances = vec![
        finished("keep", "s", start, start + 60),
        finished("move", "s", start + 100, start + 400),
    ];
    recalculate_total_duration(&mut cur);
    let mut sessions = vec![cur];

    let (id, changed) = move_instance_to_task(
        &mut sessions,
        "move",
        "b",
        "Task b",
        Some(50.0),
        ts(start + 500),
    )
    .unwrap();

    assert!(changed);
    assert_eq!(id, "s");
    assert_eq!(sessions.len(), 1);
    let session = &sessions[0];
    assert_eq!(session.task_id, "a");
    assert_eq!(session.hourly_rate, Some(20.0));
    assert_eq!(session.total_duration, 360_000);
    assert_eq!(session.timer_instances[0].task, None);
    assert_eq!(
        session.timer_instances[1].task,
        Some(timer_task("b", Some(50.0)))
    );
    assert_eq!(session.updated_at, ts(start + 500).to_rfc3339());
    assert_eq!(
        session.timer_instances[1].updated_at,
        ts(start + 500).to_rfc3339()
    );
}

#[test]
fn moving_a_timer_back_to_its_sessions_task_clears_its_own() {
    let mut cur = tray_session("s", "a", false);
    cur.timer_instances = vec![
        finished("keep", "s", 0, 60),
        TimerInstance {
            task: Some(timer_task("b", Some(50.0))),
            ..finished("back", "s", 100, 160)
        },
    ];
    let mut sessions = vec![cur];

    let (_, changed) =
        move_instance_to_task(&mut sessions, "back", "a", "Task a", Some(99.0), ts(200)).unwrap();

    assert!(changed);
    assert_eq!(sessions[0].timer_instances[1].task, None);
    assert_eq!(sessions[0].hourly_rate, None);
}

#[test]
fn a_timer_on_its_own_task_already_is_not_moved() {
    let mut cur = tray_session("s", "a", false);
    cur.timer_instances = vec![
        finished("keep", "s", 0, 60),
        TimerInstance {
            task: Some(timer_task("b", None)),
            ..finished("t", "s", 100, 160)
        },
    ];
    let before = cur.clone();
    let mut sessions = vec![cur];

    let (id, changed) =
        move_instance_to_task(&mut sessions, "t", "b", "Task b", None, ts(200)).unwrap();

    assert_eq!((id.as_str(), changed), ("s", false));
    assert_eq!(sessions[0], before);
}

#[test]
fn a_sole_timer_on_another_task_takes_the_session_with_it() {
    let mut only = tray_session("s", "a", true);
    only.timer_instances = vec![TimerInstance {
        task: Some(timer_task("b", None)),
        ..finished("t", "s", 0, 60)
    }];
    let mut sessions = vec![only];

    move_instance_to_task(&mut sessions, "t", "c", "Task c", Some(70.0), ts(100)).unwrap();

    assert_eq!(sessions[0].task_id, "c");
    assert_eq!(sessions[0].task_name, "Task c");
    assert_eq!(sessions[0].hourly_rate, Some(70.0));
    assert_eq!(sessions[0].timer_instances[0].task, None);
}

#[test]
fn moves_refuse_live_timers_and_imported_time_and_skip_the_same_task() {
    let mut running = tray_instance("r", "s", 0);
    running.is_running = true;
    let mut live = tray_session("s", "a", true);
    live.timer_instances = vec![running];
    let mut sessions = vec![live];
    assert!(
        move_instance_to_task(&mut sessions, "r", "b", "Task b", None, ts(10))
            .unwrap_err()
            .contains("Stop this timer")
    );

    let mut imported = tray_session("i", "a", false);
    imported.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
    imported.timer_instances = vec![finished("t", "i", 0, 60)];
    let mut sessions = vec![imported];
    assert!(
        move_instance_to_task(&mut sessions, "t", "b", "Task b", None, ts(100))
            .unwrap_err()
            .contains("work-log import")
    );

    let mut mine = tray_session("m", "a", false);
    mine.timer_instances = vec![finished("t", "m", 0, 60)];
    let mut sessions = vec![mine];
    let (id, changed) =
        move_instance_to_task(&mut sessions, "t", "a", "Task a", None, ts(100)).unwrap();
    assert_eq!((id.as_str(), changed), ("m", false));
}

#[test]
fn imported_sessions_are_read_only() {
    let mut imported = fresh_session();
    imported.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
    assert!(ensure_not_imported(&imported).is_err());
    let mut manual = fresh_session();
    manual.source = Some(MANUAL_SOURCE.to_string());
    assert!(ensure_not_imported(&manual).is_ok());
    assert!(ensure_not_imported(&fresh_session()).is_ok());
}

/// The frontend matches these messages (useSessionManagement's start
/// recovery, the desktop shell's quiet cancel); changing one breaks it silently.
#[test]
fn frontend_matched_error_strings_stay_verbatim() {
    let inactive = validate_start(&fresh_instance(), false, false).unwrap_err();
    assert!(inactive.contains("inactive session"), "{}", inactive);

    let concurrent = validate_start(&fresh_instance(), true, true).unwrap_err();
    assert!(
        concurrent.contains("Another timer instance is already running"),
        "{}",
        concurrent
    );

    let not_running = ensure_stoppable(&fresh_instance()).unwrap_err();
    assert!(
        not_running.contains("timer is not running"),
        "{}",
        not_running
    );

    assert_eq!(EXPORT_CANCELLED, "Export cancelled by user");
}

// --- instance commands -------------------------------------------------------

fn session_with(id: &str, active: bool, instances: Vec<TimerInstance>) -> TaskSession {
    let mut session = tray_session(id, &format!("task-{}", id), active);
    session.timer_instances = instances;
    recalculate_total_duration(&mut session);
    session
}

fn running(id: &str, session_id: &str, start: i64) -> TimerInstance {
    TimerInstance {
        is_running: true,
        resumed_at: Some(ts(start)),
        paused_duration: Some(0),
        ..tray_instance(id, session_id, start)
    }
}

fn paused(id: &str, session_id: &str, start: i64, paused_at: i64) -> TimerInstance {
    TimerInstance {
        is_paused: true,
        paused_at: Some(ts(paused_at)),
        paused_duration: Some(0),
        ..tray_instance(id, session_id, start)
    }
}

fn imported(mut session: TaskSession) -> TaskSession {
    session.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
    session
}

#[test]
fn create_adds_an_idle_timer_to_the_session() {
    let mut sessions = vec![
        session_with("a", false, vec![]),
        session_with("b", true, vec![]),
    ];

    let created = instances::create(&mut sessions, "b", None, ts(5)).unwrap();

    assert_eq!(created.session_id, "b");
    assert!(!created.is_running && !created.is_paused && created.duration.is_none());
    assert_eq!(sessions[1].timer_instances, vec![created]);
    assert_eq!(sessions[1].updated_at, ts(5).to_rfc3339());
    assert!(sessions[0].timer_instances.is_empty());
}

#[test]
fn create_refuses_unknown_imported_and_full_sessions() {
    let mut sessions = vec![
        imported(session_with("imp", false, vec![])),
        session_with(
            "full",
            true,
            (0..MAX_TIMER_INSTANCES_PER_SESSION)
                .map(|n| finished(&format!("t{n}"), "full", 0, 1))
                .collect(),
        ),
    ];

    assert_eq!(
        instances::create(&mut sessions, "gone", None, ts(0)).unwrap_err(),
        "Session with ID gone not found"
    );
    assert!(instances::create(&mut sessions, "imp", None, ts(0))
        .unwrap_err()
        .contains("work-log import"));
    assert_eq!(
        instances::create(&mut sessions, "full", None, ts(0)).unwrap_err(),
        "Maximum number of timers (50) reached for this session"
    );
    assert_eq!(
        sessions[1].timer_instances.len(),
        MAX_TIMER_INSTANCES_PER_SESSION
    );
}

#[test]
fn instance_commands_find_the_timer_in_any_session() {
    let mut sessions = vec![
        session_with("a", false, vec![finished("done", "a", 0, 60)]),
        session_with("b", true, vec![tray_instance("idle", "b", 0)]),
    ];

    let session = instances::start(&mut sessions, "idle", ts(100)).unwrap();

    assert_eq!(session.id, "b");
    let started = &session.timer_instances[0];
    assert!(started.is_running);
    assert_eq!(started.start_time, ts(100));
    assert_eq!(sessions[1], session);
    assert_eq!(session.updated_at, ts(100).to_rfc3339());
}

#[test]
fn instance_commands_refuse_unknown_timers_and_imported_time() {
    let mut sessions = vec![
        session_with("a", true, vec![]),
        imported(session_with(
            "imp",
            false,
            vec![finished("t", "imp", 0, 60)],
        )),
    ];
    let before = sessions.clone();

    assert_eq!(
        instances::stop(&mut sessions, "gone", ts(0)).unwrap_err(),
        "Timer instance with ID gone not found"
    );
    assert!(instances::delete(&mut sessions, "t", ts(0))
        .unwrap_err()
        .contains("work-log import"));
    // llvm-cov scores a generic function by its best instantiation, so one
    // command (stop) walks every path through mutate_instance
    assert!(instances::stop(&mut sessions, "t", ts(0))
        .unwrap_err()
        .contains("work-log import"));
    assert_eq!(sessions, before);
}

#[test]
fn start_refuses_while_another_timer_runs_or_in_an_inactive_session() {
    let mut sessions = vec![
        session_with("a", false, vec![running("r", "a", 0)]),
        session_with("b", true, vec![tray_instance("idle", "b", 0)]),
        session_with("c", false, vec![tray_instance("other", "c", 0)]),
    ];

    assert_eq!(
        instances::start(&mut sessions, "idle", ts(10)).unwrap_err(),
        ERR_ANOTHER_TIMER_RUNNING
    );
    assert_eq!(
        instances::start(&mut sessions, "other", ts(10)).unwrap_err(),
        ERR_START_INACTIVE_SESSION
    );
    // A refused change leaves the session's stamp alone
    assert_eq!(sessions[1].updated_at, ts(0).to_rfc3339());
}

#[test]
fn stop_finalizes_a_live_timer_and_refuses_an_idle_one() {
    let mut sessions = vec![session_with(
        "a",
        true,
        vec![running("r", "a", 0), tray_instance("idle", "a", 0)],
    )];

    let session = instances::stop(&mut sessions, "r", ts(90)).unwrap();

    assert_eq!(session.timer_instances[0].duration, Some(90_000));
    assert_eq!(session.total_duration, 90_000);
    assert_eq!(
        instances::stop(&mut sessions, "idle", ts(90)).unwrap_err(),
        ERR_STOP_NOT_RUNNING
    );
}

#[test]
fn pause_needs_a_running_timer() {
    let mut sessions = vec![session_with("a", true, vec![running("r", "a", 0)])];

    let session = instances::pause(&mut sessions, "r", ts(30)).unwrap();

    let timer = &session.timer_instances[0];
    assert!(timer.is_paused && !timer.is_running);
    assert_eq!(timer.paused_at, Some(ts(30)));
    assert_eq!(
        instances::pause(&mut sessions, "r", ts(40)).unwrap_err(),
        ERR_PAUSE_NOT_RUNNING
    );
}

#[test]
fn resume_continues_a_paused_timer_in_the_active_session() {
    let mut sessions = vec![session_with("a", true, vec![paused("p", "a", 0, 30)])];

    let session = instances::resume(&mut sessions, "p", ts(50)).unwrap();

    let timer = &session.timer_instances[0];
    assert!(timer.is_running && !timer.is_paused);
    assert_eq!(timer.paused_duration, Some(20_000));
    assert_eq!(timer.resumed_at, Some(ts(50)));
}

#[test]
fn resume_upholds_the_same_rules_as_start() {
    let mut sessions = vec![
        session_with(
            "a",
            true,
            vec![running("r", "a", 0), paused("p", "a", 0, 5)],
        ),
        session_with("b", false, vec![paused("q", "b", 0, 5)]),
    ];

    assert_eq!(
        instances::resume(&mut sessions, "r", ts(10)).unwrap_err(),
        "Cannot resume timer: timer is not paused"
    );
    assert_eq!(
        instances::resume(&mut sessions, "q", ts(10)).unwrap_err(),
        ERR_RESUME_INACTIVE_SESSION
    );
    assert_eq!(
        instances::resume(&mut sessions, "p", ts(10)).unwrap_err(),
        ERR_ANOTHER_TIMER_RUNNING
    );
}

#[test]
fn delete_removes_a_stopped_timer_and_keeps_a_live_one() {
    let mut sessions = vec![session_with(
        "a",
        true,
        vec![finished("done", "a", 0, 60), running("r", "a", 100)],
    )];

    let session = instances::delete(&mut sessions, "done", ts(200)).unwrap();

    assert_eq!(session.timer_instances.len(), 1);
    assert_eq!(session.total_duration, 0);
    assert!(instances::delete(&mut sessions, "r", ts(200))
        .unwrap_err()
        .contains("running"));
    assert_eq!(sessions[0].timer_instances.len(), 1);
}

#[test]
fn update_applies_every_patched_field() {
    let mut sessions = vec![session_with("a", true, vec![paused("p", "a", 0, 30)])];
    let updates = TimerInstanceUpdates {
        is_running: Some(false),
        is_paused: Some(false),
        notes: Some("edited".to_string()),
        duration: Some(45_000),
        resumed_at: Some("1970-01-01T00:00:20Z".to_string()),
        start_time: Some("1970-01-01T00:00:05+00:00".to_string()),
        end_time: Some("1970-01-01T00:00:50Z".to_string()),
    };

    let timer = instances::update(&mut sessions, "p", &updates, ts(60)).unwrap();

    assert!(!timer.is_running && !timer.is_paused);
    assert_eq!(timer.notes.as_deref(), Some("edited"));
    assert_eq!(timer.duration, Some(45_000));
    assert_eq!(timer.start_time, ts(5));
    assert_eq!(timer.end_time, Some(ts(50)));
    // Finalizing clears the pause bookkeeping, including the patched resume
    assert_eq!((timer.paused_at, timer.resumed_at), (None, None));
    assert_eq!(sessions[0].timer_instances[0], timer);
    assert_eq!(sessions[0].total_duration, 45_000);
}

#[test]
fn update_sets_resumed_at_when_not_finalizing() {
    let mut sessions = vec![session_with("a", true, vec![running("r", "a", 0)])];
    let updates = TimerInstanceUpdates {
        resumed_at: Some("1970-01-01T00:00:20Z".to_string()),
        ..Default::default()
    };

    let timer = instances::update(&mut sessions, "r", &updates, ts(60)).unwrap();

    assert_eq!(timer.resumed_at, Some(ts(20)));
    assert!(timer.is_running);
}

#[test]
fn update_rejects_a_bad_patch_before_changing_anything() {
    let mut sessions = vec![session_with("a", true, vec![finished("t", "a", 0, 60)])];
    let before = sessions.clone();
    let bad = |field: &str| {
        let value = Some("yesterday".to_string());
        match field {
            "resumedAt" => TimerInstanceUpdates {
                resumed_at: value,
                ..Default::default()
            },
            "startTime" => TimerInstanceUpdates {
                start_time: value,
                ..Default::default()
            },
            _ => TimerInstanceUpdates {
                end_time: value,
                ..Default::default()
            },
        }
    };

    for field in ["resumedAt", "startTime", "endTime"] {
        let err = instances::update(&mut sessions, "t", &bad(field), ts(90)).unwrap_err();
        assert!(
            err.starts_with("Invalid timestamp 'yesterday': "),
            "{}",
            err
        );
    }
    let raise = TimerInstanceUpdates {
        is_running: Some(true),
        ..Default::default()
    };
    assert!(instances::update(&mut sessions, "t", &raise, ts(90)).is_err());
    assert_eq!(
        instances::update(
            &mut sessions,
            "gone",
            &TimerInstanceUpdates::default(),
            ts(90)
        )
        .unwrap_err(),
        "Timer instance with ID gone not found"
    );
    assert_eq!(sessions, before);
}

#[test]
fn updates_take_camel_case_keys_only() {
    let camel: TimerInstanceUpdates =
        serde_json::from_value(serde_json::json!({ "isRunning": false, "endTime": "x" })).unwrap();
    assert_eq!(camel.is_running, Some(false));
    assert_eq!(camel.end_time.as_deref(), Some("x"));
    // The snake_case spellings very old frontends sent are ignored
    let snake: TimerInstanceUpdates =
        serde_json::from_value(serde_json::json!({ "is_running": false, "end_time": "x" }))
            .unwrap();
    assert_eq!((snake.is_running, snake.end_time), (None, None));
}

// --- session commands ---------------------------------------------------------

#[test]
fn activating_a_session_finalizes_the_others_live_timers() {
    let mut sessions = vec![
        session_with("a", true, vec![running("r", "a", 0)]),
        session_with("b", false, vec![]),
        session_with("c", false, vec![]),
    ];

    let stopped = lifecycle::set_active_session(&mut sessions, Some("b"), ts(60)).unwrap();

    assert_eq!(stopped, vec!["r".to_string()]);
    assert_eq!(sessions[0].timer_instances[0].duration, Some(60_000));
    assert_eq!(
        sessions.iter().map(|s| s.is_active).collect::<Vec<_>>(),
        vec![false, true, false]
    );

    // Re-activating the active session finalizes nothing
    assert!(
        lifecycle::set_active_session(&mut sessions, Some("b"), ts(70))
            .unwrap()
            .is_empty()
    );
    // None deactivates every session
    assert!(lifecycle::set_active_session(&mut sessions, None, ts(80))
        .unwrap()
        .is_empty());
    assert!(sessions.iter().all(|s| !s.is_active));
}

#[test]
fn only_an_existing_tracked_session_can_be_activated() {
    let mut sessions = vec![
        session_with("a", true, vec![running("r", "a", 0)]),
        imported(session_with("imp", false, vec![])),
    ];
    let before = sessions.clone();

    assert_eq!(
        lifecycle::set_active_session(&mut sessions, Some("gone"), ts(5)).unwrap_err(),
        "Session with ID gone not found"
    );
    assert!(
        lifecycle::set_active_session(&mut sessions, Some("imp"), ts(5))
            .unwrap_err()
            .contains("work-log import")
    );
    assert_eq!(sessions, before);
}

#[test]
fn a_timer_that_never_ran_cannot_be_moved() {
    let mut sessions = vec![session_with(
        "a",
        false,
        vec![tray_instance("idle", "a", 0)],
    )];
    assert_eq!(
        move_instance_to_task(&mut sessions, "idle", "b", "Task b", None, ts(10)).unwrap_err(),
        "This timer hasn't tracked any time yet"
    );
    assert_eq!(
        move_instance_to_task(&mut sessions, "gone", "b", "Task b", None, ts(10)).unwrap_err(),
        "Timer instance with ID gone not found"
    );
}

#[test]
fn moving_the_active_sessions_only_timer_keeps_the_active_session() {
    let mut sessions = vec![session_with("a", true, vec![finished("t", "a", 0, 60)])];

    let (id, changed) =
        move_instance_to_task(&mut sessions, "t", "b", "Task b", None, ts(100)).unwrap();

    assert!(changed);
    assert_eq!(id, "a");
    assert_eq!(sessions.len(), 1);
    assert!(sessions[0].is_active);
    assert_eq!(sessions[0].task_id, "b");
    assert_eq!(sessions[0].timer_instances.len(), 1);
}

#[test]
fn a_new_timer_can_be_for_another_task() {
    let mut sessions = vec![tray_session("s", "a", true)];

    let own =
        instances::create(&mut sessions, "s", Some(timer_task("a", Some(50.0))), ts(5)).unwrap();
    assert_eq!(own.task, None);

    let other =
        instances::create(&mut sessions, "s", Some(timer_task("b", Some(50.0))), ts(5)).unwrap();
    assert_eq!(other.task, Some(timer_task("b", Some(50.0))));
    assert_eq!(sessions[0].timer_instances[1], other);
}

#[test]
fn renames_and_missing_rates_reach_timers_on_other_tasks() {
    let task = |id: &str, name: &str, rate: Option<f64>| Task {
        id: id.to_string(),
        name: name.to_string(),
        hourly_rate: rate,
        default_note_template_id: None,
        is_archived: false,
        is_favorite: false,
        created_at: String::new(),
        updated_at: String::new(),
    };
    let tasks = vec![task("b", "Renamed", Some(50.0))];
    let mut cur = tray_session("s", "gone", true);
    cur.timer_instances = vec![
        TimerInstance {
            task: Some(timer_task("b", None)),
            ..finished("named", "s", 0, 60)
        },
        TimerInstance {
            // Kept: it has its rate, and its task is unknown here
            task: Some(timer_task("other", Some(9.0))),
            ..finished("kept", "s", 100, 160)
        },
        finished("own", "s", 200, 260),
    ];
    let mut sessions = vec![cur];

    assert!(sync_session_task_names(&mut sessions, &tasks));
    assert!(!sync_session_task_names(&mut sessions, &tasks));
    assert!(fill_missing_session_rates(&mut sessions, &tasks));
    assert!(!fill_missing_session_rates(&mut sessions, &tasks));

    let timers = &sessions[0].timer_instances;
    let named = timers[0].task.as_ref().unwrap();
    assert_eq!(named.task_name, "Renamed");
    assert_eq!(named.hourly_rate, Some(50.0));
    assert_eq!(timers[1].task, Some(timer_task("other", Some(9.0))));
    assert_eq!(timers[2].task, None);
    assert_eq!(sessions[0].task_name, "Task gone");
}

// --- start and rename edge cases ---------------------------------------------

#[test]
fn continuing_a_full_session_is_refused() {
    let now = ts(1_800_000_000);
    let mut full = tray_session("cur", "a", true);
    full.date = LOCAL.day(now);
    full.timer_instances = (0..MAX_TIMER_INSTANCES_PER_SESSION)
        .map(|n| finished(&format!("t{n}"), "cur", 0, 1))
        .collect();
    let mut sessions = vec![full];

    assert_eq!(
        start_task_timer(&mut sessions, "a", "Task a", None, now, LOCAL).unwrap_err(),
        "Maximum number of timers (50) reached for this session"
    );
    assert_eq!(
        sessions[0].timer_instances.len(),
        MAX_TIMER_INSTANCES_PER_SESSION
    );
}

#[test]
fn renames_skip_sessions_whose_task_is_unknown() {
    let mut sessions = vec![tray_session("s", "deleted-task", false)];
    assert!(!sync_session_task_names(
        &mut sessions,
        &[rated_task("a", None)]
    ));
    assert_eq!(sessions[0].task_name, "Task deleted-task");
}

#[test]
fn imported_rates_ignore_timers_without_a_ledger_entry() {
    let ledger: Vec<WorkLogEntry> = serde_json::from_value(serde_json::json!([
        { "id": "e1", "kind": "timed", "amountCents": 1_500 }
    ]))
    .unwrap();
    let mut imported_session = imported(tray_session("imp", "a", false));
    imported_session.timer_instances = vec![
        TimerInstance {
            external_id: Some("e1".to_string()),
            task: None,
            duration: Some(30 * 60_000),
            ..tray_instance("i1", "imp", 0)
        },
        // No ledger link, and a link to an entry the ledger doesn't have
        TimerInstance {
            duration: Some(30 * 60_000),
            ..tray_instance("i2", "imp", 0)
        },
        TimerInstance {
            external_id: Some("e-missing".to_string()),
            task: None,
            duration: Some(30 * 60_000),
            ..tray_instance("i3", "imp", 0)
        },
    ];
    let mut sessions = vec![imported_session];

    assert!(fill_imported_session_rates(&mut sessions, &ledger));
    // $15 over the half hour the ledger accounts for
    assert_eq!(sessions[0].hourly_rate, Some(30.0));
}

#[test]
fn task_rate_ignores_missing_and_zero_rates() {
    let tasks = vec![
        rated_task("a", Some(25.0)),
        rated_task("b", Some(0.0)),
        rated_task("c", None),
    ];
    assert_eq!(task_rate(&tasks, "a"), Some(25.0));
    assert_eq!(task_rate(&tasks, "b"), None);
    assert_eq!(task_rate(&tasks, "c"), None);
    assert_eq!(task_rate(&tasks, "gone"), None);
}

#[test]
fn a_refused_start_reports_no_handoff() {
    let now = ts(1_800_000_000);
    let mut full = tray_session("cur", "a", true);
    full.date = LOCAL.day(now);
    full.timer_instances = (0..MAX_TIMER_INSTANCES_PER_SESSION)
        .map(|n| finished(&format!("t{n}"), "cur", 0, 1))
        .collect();
    let mut sessions = vec![full];

    assert!(start_task_with_handoff(&mut sessions, "a", "Task a", None, now, LOCAL).is_err());
}

#[test]
fn imported_time_the_ledger_paid_nothing_for_gets_no_rate() {
    let ledger: Vec<WorkLogEntry> = serde_json::from_value(serde_json::json!([
        { "id": "e1", "kind": "timed", "amountCents": 0 }
    ]))
    .unwrap();
    let mut unpaid = imported(tray_session("imp", "a", false));
    unpaid.timer_instances = vec![TimerInstance {
        external_id: Some("e1".to_string()),
        task: None,
        duration: Some(60_000),
        ..tray_instance("i1", "imp", 0)
    }];
    let mut sessions = vec![unpaid];

    assert!(!fill_imported_session_rates(&mut sessions, &ledger));
    assert_eq!(sessions[0].hourly_rate, None);
}

#[test]
fn resuming_a_pause_with_no_start_adds_no_paused_time() {
    // Defensive: data from an older build could carry is_paused without
    // paused_at
    let mut timer = TimerInstance {
        is_paused: true,
        paused_duration: Some(5_000),
        ..fresh_instance()
    };

    resume_instance(&mut timer, ts(100));

    assert!(timer.is_running && !timer.is_paused);
    assert_eq!(timer.paused_duration, Some(5_000));
    assert_eq!(timer.resumed_at, Some(ts(100)));
}
