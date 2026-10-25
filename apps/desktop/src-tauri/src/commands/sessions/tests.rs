//! Unit tests for the session commands and their helpers.

use super::instances::*;
use super::lifecycle::*;
use super::manual::*;
use super::start::*;
use super::task_links::*;
use super::timer::*;
use crate::types::{Task, TaskSession, TimerInstance, WorkLogEntry};
use chrono::TimeZone;
use chrono::{DateTime, Local, Utc};

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

    let (outcome, stopped) = start_task_timer(&mut sessions, "b", "Task b", None, ts(60)).unwrap();

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

    let (outcome, stopped) = start_task_timer(&mut sessions, "a", "Task a", None, ts(100)).unwrap();

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

    let (outcome, stopped) = start_task_timer(&mut sessions, "a", "Task a", None, ts(90)).unwrap();

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
        build_manual_session(&[], "a", "Task a", None, start, 24 * HOUR_MS + 1, now).unwrap_err(),
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
    assert!(build_manual_session(&[done], "a", "Task a", None, ts(6_400), HOUR_MS, now).is_ok());

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

    let session = build_manual_session(&[], "a", "Task a", None, start, 90 * 60_000, now).unwrap();

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
        start_task_timer(&mut sessions, "a", "Task a", Some(30.0), now).unwrap();

    assert!(stopped.is_empty());
    assert!(!sessions[0].is_active);
    let today = &sessions[1];
    assert!(today.is_active);
    assert_eq!(today.date, local_day(now));
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

    let (_, stopped) = start_task_timer(&mut sessions, "a", "Task a", None, now).unwrap();

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

    let (outcome, _) = start_task_timer(&mut sessions, "a", "Task a", None, now).unwrap();
    assert_eq!(outcome, TrayStart::AlreadyRunning);
    assert_eq!(sessions.len(), 1);
}

#[test]
fn a_same_day_session_is_continued() {
    let now = ts(1_800_000_000);
    let mut cur = tray_session("cur", "a", true);
    cur.date = local_day(now);
    cur.timer_instances = vec![finished("done", "cur", 0, 60)];
    let mut sessions = vec![cur];

    start_task_timer(&mut sessions, "a", "Task a", None, now).unwrap();
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
fn moving_one_of_several_timers_splits_it_into_its_own_session() {
    let start = 1_800_000_000;
    let mut cur = tray_session("s", "a", true);
    cur.source = Some(MANUAL_SOURCE.to_string());
    cur.timer_instances = vec![
        finished("keep", "s", start, start + 60),
        finished("move", "s", start + 100, start + 400),
    ];
    recalculate_total_duration(&mut cur);
    let mut sessions = vec![cur];

    let (id, changed) =
        move_instance_to_task(&mut sessions, "move", "b", "Task b", None, ts(start + 500)).unwrap();

    assert!(changed);
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].timer_instances.len(), 1);
    assert_eq!(sessions[0].total_duration, 60_000);
    let moved = &sessions[1];
    assert_eq!(moved.id, id);
    assert!(!moved.is_active);
    assert_eq!(moved.task_id, "b");
    assert_eq!(moved.source.as_deref(), Some(MANUAL_SOURCE));
    assert_eq!(moved.date, local_day(ts(start + 100)));
    assert_eq!(moved.total_duration, 300_000);
    assert_eq!(moved.timer_instances[0].session_id, id);
}

#[test]
fn an_inactive_session_a_move_leaves_empty_is_removed() {
    let mut two = tray_session("s", "a", false);
    two.timer_instances = vec![finished("x", "s", 0, 60), finished("y", "s", 100, 160)];
    let mut sessions = vec![two];

    move_instance_to_task(&mut sessions, "x", "b", "Task b", None, ts(200)).unwrap();
    move_instance_to_task(&mut sessions, "y", "b", "Task b", None, ts(200)).unwrap();

    assert!(sessions.iter().all(|s| s.task_id == "b"));
    assert!(sessions.iter().all(|s| !s.timer_instances.is_empty()));
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
    imported.source = Some(crate::commands::worklogs::WORKLOG_IMPORT_SOURCE.to_string());
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
    imported.source = Some(crate::commands::worklogs::WORKLOG_IMPORT_SOURCE.to_string());
    assert!(ensure_not_imported(&imported).is_err());
    let mut manual = fresh_session();
    manual.source = Some(MANUAL_SOURCE.to_string());
    assert!(ensure_not_imported(&manual).is_ok());
    assert!(ensure_not_imported(&fresh_session()).is_ok());
}

/// The frontend matches these messages (useSessionManagement's start
/// recovery, useCsvExport's quiet cancel); changing one breaks it silently.
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

    assert_eq!(
        crate::commands::backup::EXPORT_CANCELLED,
        "Export cancelled by user"
    );
}
