//! What the scenarios don't show: parsing, the host's side of a command
//! (backups, purging, event payloads), and refusals no client can reach.

use super::*;
use crate::contract::{MAX_TIMER_INSTANCES_PER_SESSION, TASKS_RECORD_KEY};
use crate::workspace::Workspace;
use chrono::TimeZone;
use serde_json::json;

fn ctx() -> Ctx {
    Ctx {
        now: Utc.with_ymd_and_hms(2026, 3, 2, 15, 0, 0).unwrap(),
        zone: DayZone::Named(chrono_tz::UTC),
    }
}

fn run(workspace: &mut Workspace, name: &str, args: Value) -> Result<Executed, CoreError> {
    execute(Command::parse(name, args)?, workspace, &ctx())
}

#[test]
fn a_command_is_parsed_by_name_with_camel_case_args() {
    assert!(matches!(
        Command::parse("start_task", json!({ "taskId": "t1", "taskName": "A", "extra": 1 })),
        Ok(Command::StartTask(StartTaskArgs { task_id, .. })) if task_id == "t1"
    ));
    // No-arg commands take {}, null, or anything else
    for args in [json!({}), Value::Null, json!({ "ignored": true })] {
        assert!(matches!(
            Command::parse("get_sessions", args),
            Ok(Command::GetSessions(_))
        ));
    }
    assert_eq!(
        Command::parse("launch", json!({})).unwrap_err(),
        CoreError::UnknownCommand("launch".to_string())
    );
    assert_eq!(
        Command::parse("delete_session", json!({ "sessionId": 1 }))
            .unwrap_err()
            .to_string(),
        "Invalid arguments for delete_session: invalid type: integer `1`, expected a string"
    );
}

#[test]
fn every_name_is_a_command() {
    let mut names = COMMAND_NAMES.to_vec();
    names.sort();
    names.dedup();
    assert_eq!(names.len(), COMMAND_NAMES.len());
    for name in COMMAND_NAMES {
        // A known name fails on its args, if at all, never as unknown
        assert!(!matches!(
            Command::parse(name, json!({})),
            Err(CoreError::UnknownCommand(_))
        ));
    }
}

#[test]
fn a_reply_must_be_exactly_its_declared_type() {
    let started = json!({ "outcome": "started", "instanceId": "i1", "stoppedTaskName": null });
    assert_eq!(check_reply("start_task", &started), Ok(()));
    assert_eq!(
        check_reply("set_app_record", &json!({ "revision": 1 })),
        Ok(())
    );
    assert_eq!(check_reply("accept_capture", &Value::Null), Ok(()));

    assert!(check_reply("start_task", &json!(1))
        .unwrap_err()
        .starts_with("it doesn't read as its reply type: "));
    let mut extra = started.clone();
    extra["extra"] = json!(true);
    assert_eq!(
        check_reply("start_task", &extra),
        Err(format!("it reads back as {}", started))
    );
    assert_eq!(
        check_reply("launch", &Value::Null),
        Err("launch has no declared reply".to_string())
    );
}

#[test]
fn errors_read_as_the_client_sees_them() {
    assert_eq!(CoreError::Rejected("No".into()).to_string(), "No");
    assert_eq!(CoreError::InvalidArgs("Bad".into()).to_string(), "Bad");
    assert_eq!(CoreError::Conflict("Stale".into()).to_string(), "Stale");
    assert_eq!(
        CoreError::UnknownCommand("x".into()).to_string(),
        "Unknown command: x"
    );
    assert_eq!(
        CoreError::from("Refused".to_string()),
        CoreError::Rejected("Refused".to_string())
    );
}

#[test]
fn records_that_could_not_be_loaded_are_never_saved_over() {
    let mut workspace = Workspace::default();
    workspace.notes.records_error = Some("Failed to read appdata.json: oops".to_string());
    let refused = Err(CoreError::Rejected(
        "Failed to read appdata.json: oops".to_string(),
    ));

    assert_eq!(run(&mut workspace, "get_app_records", json!({})), refused);
    assert_eq!(
        run(
            &mut workspace,
            "set_app_record",
            json!({ "key": "dailyGoal", "value": 1 })
        ),
        refused
    );
    assert_eq!(
        run(
            &mut workspace,
            "import_app_records",
            json!({ "records": {} })
        ),
        refused
    );
    // A reset is how the user gets past it
    run(&mut workspace, "reset_all_app_data", json!({})).unwrap();
    assert_eq!(workspace.notes.records_error, None);
}

#[test]
fn records_moving_in_are_kept_aside_first() {
    let mut workspace = Workspace::default();
    let done = run(
        &mut workspace,
        "import_app_records",
        json!({ "records": { "taskNotes": [{ "id": "n1" }], "dailyGoal": null, "other": 1 } }),
    )
    .unwrap();

    let mut incoming = RecordMap::new();
    incoming.insert("taskNotes".into(), json!([{ "id": "n1" }]));
    assert_eq!(
        done.backups,
        vec![Backup::Incoming {
            records: incoming,
            failure: "Moving the records in was cancelled"
        }]
    );
    assert_eq!(done.dirty, Parts::RECORDS);

    // Nothing to move in: no copy, nothing to save
    let done = run(
        &mut workspace,
        "import_app_records",
        json!({ "records": { "other": 1 } }),
    )
    .unwrap();
    assert!(done.backups.is_empty());
    assert_eq!(done.dirty, Parts::NONE);
}

#[test]
fn saving_the_tasks_record_changes_sessions_only_when_they_follow() {
    let mut workspace = Workspace::default();
    let tasks = json!([{
        "id": "t1", "name": "A", "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
    }]);
    let done = run(
        &mut workspace,
        "set_app_record",
        json!({ "key": TASKS_RECORD_KEY, "value": tasks }),
    )
    .unwrap();
    assert_eq!(done.dirty, Parts::RECORDS);
    assert_eq!(
        done.events,
        [Event::new(
            crate::contract::events::APP_RECORDS_CHANGED,
            json!({ "key": TASKS_RECORD_KEY, "revision": 1 })
        )]
    );
}

#[test]
fn a_record_saved_from_a_stale_revision_is_a_conflict_that_changes_nothing() {
    let mut workspace = Workspace::default();
    let save = |workspace: &mut Workspace, base: Value| {
        run(
            workspace,
            "set_app_record",
            json!({ "key": "dailyGoal", "value": { "targetAmount": 1 }, "baseRevision": base }),
        )
    };
    assert_eq!(
        save(&mut workspace, json!(0)).unwrap().reply,
        json!({ "revision": 1 })
    );
    let before = workspace.clone();

    assert_eq!(
        save(&mut workspace, json!(0)).unwrap_err(),
        CoreError::Conflict(crate::contract::ERR_RECORD_CONFLICT.to_string())
    );
    assert_eq!(workspace, before);
    // No base: saved whatever the revision
    assert_eq!(
        save(&mut workspace, Value::Null).unwrap().reply,
        json!({ "revision": 2 })
    );
}

#[test]
fn a_restore_needs_a_copy_of_what_it_changes() {
    let mut workspace = Workspace::default();
    let done = run(
        &mut workspace,
        "restore_backup_data",
        json!({ "payload": { "mode": "merge" } }),
    )
    .unwrap();
    assert_eq!(
        done.backups,
        vec![Backup::Saved {
            parts: Parts::SESSIONS | Parts::WORK_LOGS,
            failure: "Restore cancelled",
            required: true
        }]
    );
    // An export with no sections changes nothing
    assert_eq!(done.dirty, Parts::NONE);
}

#[test]
fn an_import_that_rewrites_days_asks_for_a_copy_of_the_sessions() {
    let mut workspace = Workspace::default();
    let plain = run(
        &mut workspace,
        "apply_work_log_import",
        json!({ "payload": {} }),
    )
    .unwrap();
    assert!(plain.backups.is_empty());
    assert_eq!(plain.dirty, Parts::WORK_LOGS);

    let rewrite = run(
        &mut workspace,
        "apply_work_log_import",
        json!({ "payload": { "rewriteGroups": [{ "taskId": "t1", "workDay": "2026-03-01" }] } }),
    )
    .unwrap();
    assert_eq!(
        rewrite.backups,
        vec![Backup::Saved {
            parts: Parts::SESSIONS,
            failure: "Failed to back up sessions before import",
            required: false
        }]
    );
}

#[test]
fn a_reset_clears_everything_and_has_the_host_purge_its_copies() {
    let mut workspace = Workspace {
        sessions: serde_json::from_value(json!([{ "id": "s1", "notes": null }])).unwrap(),
        ..Workspace::default()
    };
    workspace.notes.session_warning = Some("skipped".to_string());

    let done = run(&mut workspace, "reset_all_app_data", json!(null)).unwrap();

    assert_eq!(workspace, Workspace::default());
    assert_eq!(done.dirty, Parts::ALL);
    assert!(done.purge_backups);
    // The host fills in how many copies it deleted
    assert_eq!(done.reply, json!({ "backupsDeleted": 0, "warning": null }));
}

#[test]
fn timer_events_carry_the_instance_and_the_moment() {
    let mut workspace = Workspace::default();
    let started = run(
        &mut workspace,
        "start_task",
        json!({ "taskId": "t1", "taskName": "A" }),
    )
    .unwrap();
    let id = started.reply["instanceId"].as_str().unwrap().to_string();
    assert_eq!(
        started.events,
        vec![Event {
            name: crate::contract::events::TIMER_INSTANCE_STARTED,
            payload: json!({ "instanceId": id, "startTime": "2026-03-02T15:00:00+00:00" }),
        }]
    );

    let paused = run(
        &mut workspace,
        "pause_timer_at",
        json!({ "instanceId": id, "idleSince": "2026-03-02T14:50:00Z" }),
    )
    .unwrap();
    // As of when input stopped
    assert_eq!(
        paused.events[0].payload,
        json!({ "instanceId": id, "pausedAt": "2026-03-02T14:50:00+00:00" })
    );
}

#[test]
fn a_session_full_of_timers_refuses_another_start() {
    let instances: Vec<Value> = (0..MAX_TIMER_INSTANCES_PER_SESSION)
        .map(|n| {
            json!({
                "id": format!("i{}", n),
                "sessionId": "s1",
                "startTime": "2026-03-02T10:00:00Z",
                "endTime": "2026-03-02T10:01:00Z",
                "duration": 60000,
                "pausedAt": null,
                "pausedDuration": 0,
                "resumedAt": null,
                "notes": null
            })
        })
        .collect();
    let mut workspace = Workspace {
        sessions: serde_json::from_value(json!([{
            "id": "s1", "taskId": "t1", "taskName": "A", "isActive": true, "date": "2026-03-02",
            "timerInstances": instances, "notes": null
        }]))
        .unwrap(),
        ..Workspace::default()
    };

    assert_eq!(
        run(
            &mut workspace,
            "start_task",
            json!({ "taskId": "t1", "taskName": "A" })
        )
        .unwrap_err()
        .to_string(),
        "Maximum number of timers (50) reached for this session"
    );
}
