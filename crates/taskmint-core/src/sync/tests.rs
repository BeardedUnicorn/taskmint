use super::*;
use crate::contract::TASKS_RECORD_KEY;
use serde_json::json;

fn session(id: &str, created: &str, timers: Value) -> TaskSession {
    serde_json::from_value(json!({
        "id": id,
        "taskId": "task_a",
        "taskName": "A",
        "notes": null,
        "createdAt": created,
        "timerInstances": timers,
    }))
    .unwrap()
}

fn timer(id: &str, start: &str, running: bool) -> Value {
    json!({
        "id": id,
        "sessionId": "s",
        "startTime": start,
        "endTime": if running { Value::Null } else { json!(start) },
        "duration": if running { Value::Null } else { json!(1000) },
        "isRunning": running,
        "isPaused": false,
        "pausedAt": null,
        "pausedDuration": 0,
        "resumedAt": null,
        "notes": null,
    })
}

fn entry(id: &str, minutes: f64) -> WorkLogEntry {
    serde_json::from_value(json!({
        "id": id,
        "kind": "timed",
        "createdAt": "2026-11-01T10:00:00Z",
        "workDay": "2026-11-01",
        "projectId": "p",
        "projectName": "P",
        "taskId": "task_a",
        "taskName": "A",
        "timeInMinutes": minutes,
        "amountCents": 100,
        "status": "paid",
    }))
    .unwrap()
}

fn mapping(project: &str, task: &str) -> ProjectTaskMapping {
    serde_json::from_value(json!({
        "projectId": project,
        "projectName": "P",
        "taskId": task,
        "taskName": "A",
        "createdAt": "x",
        "updatedAt": "x",
    }))
    .unwrap()
}

fn linked() -> Workspace {
    let mut workspace = Workspace::default();
    link(
        &mut workspace,
        SyncAccount {
            uid: "u1".into(),
            epoch: 1,
        },
    );
    workspace
}

fn incoming(id: &str, json: Option<String>) -> IncomingDoc {
    IncomingDoc {
        doc_id: id.to_string(),
        json,
        schema: SYNC_SCHEMA,
    }
}

fn session_json(session: &TaskSession) -> Option<String> {
    Some(serde_json::to_string(session).unwrap())
}

/// Brings `workspace` and the cloud into step on what it has now: every
/// entity comes back as its own echo.
fn agree(workspace: &mut Workspace) {
    let echoes = outgoing(workspace)
        .into_iter()
        .map(|doc| incoming(&doc.doc_id, doc.json))
        .collect();
    apply_incoming(workspace, echoes, None);
    assert!(outgoing(workspace).is_empty());
}

#[test]
fn kinds_have_names_and_parts() {
    let named: Vec<(&str, Parts)> = Kind::ALL.iter().map(|k| (k.name(), k.part())).collect();
    assert_eq!(
        named,
        [
            ("session", Parts::SESSIONS),
            ("worklog", Parts::WORK_LOGS),
            ("mapping", Parts::WORK_LOGS),
            ("record", Parts::RECORDS),
        ]
    );
}

#[test]
fn any_id_makes_a_document_id_and_back() {
    let id = doc_id(Kind::Session, "a/b c~ü.-_");
    assert_eq!(id, "session~a%2Fb%20c%7E%C3%BC.-_");
    assert_eq!(
        parse_doc_id(&id),
        Some((Kind::Session, "a/b c~ü.-_".to_string()))
    );
    assert_eq!(
        parse_doc_id("record~predefinedTasks"),
        Some((Kind::Record, "predefinedTasks".to_string()))
    );
    for bad in [
        "session",
        "thing~a",
        "worklog~%2",
        "worklog~%zz",
        "worklog~%FF",
        "worklog~%€",
        "record~theme-mode",
    ] {
        assert_eq!(parse_doc_id(bad), None, "{}", bad);
    }
}

#[test]
fn hashes_are_fnv1a_in_hex() {
    assert_eq!(hash(""), "cbf29ce484222325");
    assert_eq!(hash("a"), "af63dc4c8601ec8c");
    assert_eq!(
        Synced::of(None),
        Synced {
            hash: String::new(),
            json: None
        }
    );
}

#[test]
fn nothing_goes_out_until_linked_then_everything_does() {
    let mut workspace = Workspace::default();
    workspace.sessions.push(session("s1", "1", json!([])));
    assert!(outgoing(&workspace).is_empty());
    assert!(status(&workspace).account.is_none());

    let mut workspace = linked();
    workspace.sessions.push(session("s1", "1", json!([])));
    workspace.work_log_entries.push(entry("w1", 30.0));
    workspace.work_log_mappings.push(mapping("p", "task_a"));
    workspace.records.insert(TASKS_RECORD_KEY.into(), json!([]));
    workspace.records.insert("dailyGoal".into(), Value::Null);
    workspace.records.insert("theme".into(), json!(1));
    let out = outgoing(&workspace);
    let ids: Vec<(&str, &str, &str)> = out
        .iter()
        .map(|d| (d.doc_id.as_str(), d.kind.as_str(), d.id.as_str()))
        .collect();
    assert_eq!(
        ids,
        [
            ("mapping~p", "mapping", "p"),
            ("record~predefinedTasks", "record", "predefinedTasks"),
            ("session~s1", "session", "s1"),
            ("worklog~w1", "worklog", "w1"),
        ]
    );
    assert_eq!(out[1].json.as_deref(), Some("[]"));
    assert_eq!(out[1].hash, hash("[]"));
    let status = status(&workspace);
    assert_eq!(status.pending, 4);
    assert!(status.has_data);
}

#[test]
fn a_device_has_data_of_its_own_with_any_entity_or_record() {
    let mut workspace = Workspace::default();
    assert!(!status(&workspace).has_data);
    workspace.records.insert("dailyGoal".into(), Value::Null);
    assert!(!status(&workspace).has_data);
    for fill in [
        |w: &mut Workspace| w.sessions.push(session("s", "1", json!([]))),
        |w: &mut Workspace| w.work_log_entries.push(entry("w", 1.0)),
        |w: &mut Workspace| w.work_log_mappings.push(mapping("p", "t")),
        |w: &mut Workspace| {
            w.records.insert("dailyGoal".into(), json!({}));
        },
    ] {
        let mut workspace = Workspace::default();
        fill(&mut workspace);
        assert!(status(&workspace).has_data);
    }
}

#[test]
fn what_came_in_isnt_sent_back_and_deletions_go_out_as_such() {
    let mut workspace = linked();
    let s1 = session("s1", "1", json!([]));
    let applied = apply_incoming(
        &mut workspace,
        vec![
            incoming("session~s1", session_json(&s1)),
            incoming(
                "worklog~w1",
                Some(serde_json::to_string(&entry("w1", 5.0)).unwrap()),
            ),
            incoming(
                "mapping~p",
                Some(serde_json::to_string(&mapping("p", "task_a")).unwrap()),
            ),
            incoming("record~dailyGoal", Some(r#"{"targetAmount":40}"#.into())),
            incoming("record~dailyGoal", Some(r#"{"targetAmount":50}"#.into())),
        ],
        Some("c1".into()),
    );
    assert_eq!(applied.summary.applied, 5);
    assert_eq!(
        workspace.records["dailyGoal"],
        json!({ "targetAmount": 50 })
    );
    assert_eq!(
        applied.changed,
        Parts::SESSIONS | Parts::WORK_LOGS | Parts::RECORDS
    );
    assert_eq!(applied.records, ["dailyGoal"]);
    assert_eq!(workspace.revision("dailyGoal"), 2);
    assert_eq!(workspace.sessions, [s1]);
    assert!(outgoing(&workspace).is_empty());
    assert_eq!(status(&workspace).cursor.as_deref(), Some("c1"));

    // Removed here: deletions go out (tombstones)
    workspace.sessions.clear();
    workspace.work_log_mappings.clear();
    let out = outgoing(&workspace);
    assert_eq!(
        out.iter()
            .map(|d| (d.doc_id.as_str(), d.json.is_none(), d.hash.as_str()))
            .collect::<Vec<_>>(),
        [("mapping~p", true, ""), ("session~s1", true, "")]
    );
    // Their echoes settle it, and a tombstone for what's gone here is nothing
    let echoes = out.iter().map(|d| incoming(&d.doc_id, None)).collect();
    let applied = apply_incoming(&mut workspace, echoes, None);
    assert_eq!(applied.changed, Parts::NONE);
    assert!(outgoing(&workspace).is_empty());
    assert_eq!(status(&workspace).cursor.as_deref(), Some("c1"));
}

#[test]
fn a_change_elsewhere_replaces_or_removes_what_this_device_didnt_change() {
    let mut workspace = linked();
    workspace.sessions.push(session("s1", "1", json!([])));
    workspace.work_log_entries.push(entry("w1", 5.0));
    workspace.work_log_mappings.push(mapping("p", "task_a"));
    workspace
        .records
        .insert("dailyGoal".into(), json!({ "n": 1 }));
    agree(&mut workspace);

    let mut renamed = session("s1", "1", json!([]));
    renamed.notes = Some("there".into());
    apply_incoming(
        &mut workspace,
        vec![
            incoming("session~s1", session_json(&renamed)),
            incoming(
                "worklog~w1",
                Some(serde_json::to_string(&entry("w1", 9.0)).unwrap()),
            ),
            incoming(
                "mapping~p",
                Some(serde_json::to_string(&mapping("p", "task_b")).unwrap()),
            ),
            incoming("record~dailyGoal", None),
        ],
        None,
    );
    assert_eq!(workspace.sessions[0].notes.as_deref(), Some("there"));
    assert_eq!(workspace.work_log_entries[0].time_in_minutes, Some(9.0));
    assert_eq!(workspace.work_log_mappings[0].task_id, "task_b");
    assert!(!workspace.records.contains_key("dailyGoal"));
    assert!(outgoing(&workspace).is_empty());

    apply_incoming(
        &mut workspace,
        vec![
            incoming("session~s1", None),
            incoming("worklog~w1", None),
            incoming("mapping~p", None),
        ],
        None,
    );
    assert!(workspace.sessions.is_empty());
    assert!(workspace.work_log_entries.is_empty());
    assert!(workspace.work_log_mappings.is_empty());
}

#[test]
fn new_sessions_go_in_creation_order_and_entries_at_the_end() {
    let mut workspace = linked();
    workspace
        .sessions
        .push(session("b", "2026-11-02", json!([])));
    workspace.work_log_entries.push(entry("w1", 1.0));
    workspace.work_log_mappings.push(mapping("p1", "t"));
    let doc = |s: &TaskSession| incoming(&doc_id(Kind::Session, &s.id), session_json(s));
    apply_incoming(
        &mut workspace,
        vec![
            doc(&session("c", "2026-11-03", json!([]))),
            doc(&session("a", "2026-11-01", json!([]))),
            incoming(
                "worklog~w2",
                Some(serde_json::to_string(&entry("w2", 2.0)).unwrap()),
            ),
            incoming(
                "mapping~p2",
                Some(serde_json::to_string(&mapping("p2", "t")).unwrap()),
            ),
        ],
        None,
    );
    let ids: Vec<&str> = workspace.sessions.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a", "b", "c"]);
    assert_eq!(workspace.work_log_entries[1].id, "w2");
    assert_eq!(workspace.work_log_mappings[1].project_id, "p2");
}

#[test]
fn timers_tracked_on_two_devices_in_one_session_both_stay() {
    let mut workspace = linked();
    workspace.sessions.push(session(
        "s1",
        "1",
        json!([timer("t0", "2026-11-01T08:00:00Z", false)]),
    ));
    agree(&mut workspace);

    // Offline here, a timer; there, another, and a note
    workspace.sessions[0]
        .timer_instances
        .push(serde_json::from_value(timer("desk", "2026-11-01T09:00:00Z", false)).unwrap());
    let mut there = session(
        "s1",
        "1",
        json!([
            timer("t0", "2026-11-01T08:00:00Z", false),
            timer("phone", "2026-11-01T10:00:00Z", false)
        ]),
    );
    there.notes = Some("from the phone".into());
    let applied = apply_incoming(
        &mut workspace,
        vec![incoming("session~s1", session_json(&there))],
        None,
    );
    assert_eq!(applied.summary.merged, 1);
    let merged = &workspace.sessions[0];
    let ids: Vec<&str> = merged
        .timer_instances
        .iter()
        .map(|i| i.id.as_str())
        .collect();
    assert_eq!(ids, ["t0", "desk", "phone"]);
    assert_eq!(merged.total_duration, 3000);
    assert_eq!(merged.notes.as_deref(), Some("from the phone"));
    // The merge goes out, over what's in the cloud now
    let out = outgoing(&workspace);
    assert_eq!(out.len(), 1);
    assert_eq!(
        serde_json::from_str::<TaskSession>(out[0].json.as_ref().unwrap()).unwrap(),
        *merged
    );
}

#[test]
fn records_changed_on_both_sides_merge_item_by_item_and_a_change_beats_a_removal() {
    let mut workspace = linked();
    workspace
        .records
        .insert(TASKS_RECORD_KEY.into(), json!([{ "id": "a", "name": "A" }]));
    workspace
        .records
        .insert("withdrawals".into(), json!([{ "id": "w" }]));
    workspace.sessions.push(session("s1", "1", json!([])));
    agree(&mut workspace);

    workspace.records.insert(
        TASKS_RECORD_KEY.into(),
        json!([{ "id": "a", "name": "A" }, { "id": "b", "name": "B" }]),
    );
    workspace.records.remove("withdrawals");
    workspace.sessions[0].notes = Some("here".into());
    let applied = apply_incoming(
        &mut workspace,
        vec![
            incoming(
                "record~predefinedTasks",
                Some(r#"[{"id":"a","name":"A"},{"id":"c","name":"C"}]"#.into()),
            ),
            incoming(
                "record~withdrawals",
                Some(r#"[{"id":"w","amountCents":5}]"#.into()),
            ),
            incoming("session~s1", None),
        ],
        None,
    );
    assert_eq!(applied.summary.merged, 3);
    assert_eq!(applied.records, ["predefinedTasks", "withdrawals"]);
    assert_eq!(
        workspace.records[TASKS_RECORD_KEY],
        json!([{ "id": "a", "name": "A" }, { "id": "b", "name": "B" }, { "id": "c", "name": "C" }])
    );
    assert_eq!(
        workspace.records["withdrawals"],
        json!([{ "id": "w", "amountCents": 5 }])
    );
    // Edited here, deleted there: it stays, and goes back up
    assert_eq!(workspace.sessions[0].notes.as_deref(), Some("here"));
    let out: Vec<String> = outgoing(&workspace).into_iter().map(|d| d.doc_id).collect();
    assert_eq!(out, ["record~predefinedTasks", "session~s1"]);
}

#[test]
fn the_goal_history_merges_by_day() {
    let mut workspace = linked();
    workspace.records.insert(
        "dailyGoalAchievements".into(),
        json!([{ "date": "d1", "id": "x" }]),
    );
    agree(&mut workspace);
    workspace.records.insert(
        "dailyGoalAchievements".into(),
        json!([{ "date": "d1", "id": "y" }]),
    );
    apply_incoming(
        &mut workspace,
        vec![incoming(
            "record~dailyGoalAchievements",
            Some(r#"[{"date":"d1","id":"x"},{"date":"d2","id":"z"}]"#.into()),
        )],
        None,
    );
    assert_eq!(
        workspace.records["dailyGoalAchievements"],
        json!([{ "date": "d1", "id": "y" }, { "date": "d2", "id": "z" }])
    );
}

#[test]
fn the_first_sync_joins_what_both_sides_have() {
    let mut workspace = linked();
    workspace
        .records
        .insert(TASKS_RECORD_KEY.into(), json!([{ "id": "here" }]));
    apply_incoming(
        &mut workspace,
        vec![incoming(
            "record~predefinedTasks",
            Some(r#"[{"id":"there"}]"#.into()),
        )],
        None,
    );
    assert_eq!(
        workspace.records[TASKS_RECORD_KEY],
        json!([{ "id": "here" }, { "id": "there" }])
    );
    assert_eq!(outgoing(&workspace).len(), 1);
}

#[test]
fn unreadable_foreign_and_newer_documents_are_left_alone() {
    let mut workspace = linked();
    workspace.sessions.push(session("s1", "1", json!([])));
    let newer = IncomingDoc {
        schema: SYNC_SCHEMA + 1,
        ..incoming("session~s1", Some("{}".into()))
    };
    let applied = apply_incoming(
        &mut workspace,
        vec![
            incoming("nonsense", Some("{}".into())),
            incoming("session~s2", Some("not json".into())),
            incoming(
                "session~s3",
                session_json(&session("other", "1", json!([]))),
            ),
            incoming("worklog~w", Some("{}".into())),
            incoming(
                "mapping~p",
                Some(serde_json::to_string(&mapping("q", "t")).unwrap()),
            ),
            incoming("record~dailyGoal", Some("null".into())),
            newer,
        ],
        None,
    );
    assert_eq!(
        applied.summary,
        SyncApplied {
            applied: 0,
            merged: 0,
            skipped: 6,
            held: 1
        }
    );
    assert_eq!(applied.changed, Parts::NONE);
    // A held document isn't written over or deleted from here
    assert!(outgoing(&workspace).is_empty());
    workspace
        .sync
        .baseline
        .insert("session~s1".into(), Synced::of(Some("{}".into())));
    workspace.sessions.clear();
    assert!(outgoing(&workspace).is_empty());
    assert_eq!(status(&workspace).held, 1);

    // Once readable it's taken, and no longer held
    apply_incoming(&mut workspace, vec![incoming("session~s1", None)], None);
    assert_eq!(status(&workspace).held, 0);
}

#[test]
fn a_newer_schema_reads_everything_again() {
    let mut workspace = linked();
    workspace.sync.cursor = Some("c9".into());
    workspace.sync.held.insert("session~x".into());
    workspace.sync.schema = SYNC_SCHEMA - 1;
    assert_eq!(status(&workspace).cursor, None);
    apply_incoming(&mut workspace, vec![], Some("c1".into()));
    assert_eq!(workspace.sync.schema, SYNC_SCHEMA);
    assert!(workspace.sync.held.is_empty());
    assert_eq!(status(&workspace).cursor.as_deref(), Some("c1"));
}

#[test]
fn incoming_running_timers_settle_and_tasks_are_followed() {
    let mut workspace = linked();
    workspace.records.insert(
        TASKS_RECORD_KEY.into(),
        json!([{ "id": "task_a", "name": "Renamed", "hourlyRate": 20, "createdAt": "x", "updatedAt": "x" }]),
    );
    let mut here = session(
        "here",
        "1",
        json!([timer("h", "2026-11-01T09:00:00Z", true)]),
    );
    here.is_active = true;
    workspace.sessions.push(here);
    agree(&mut workspace);

    let mut there = session(
        "there",
        "2",
        json!([timer("p", "2026-11-01T10:00:00Z", true)]),
    );
    there.is_active = true;
    let applied = apply_incoming(
        &mut workspace,
        vec![incoming("session~there", session_json(&there))],
        None,
    );
    assert_eq!(applied.changed, Parts::SESSIONS);
    assert!(!workspace.sessions[0].is_active);
    assert!(!workspace.sessions[0].timer_instances[0].is_running);
    assert!(workspace.sessions[1].timer_instances[0].is_running);
    // The new session took the task's name, and both go out
    assert_eq!(workspace.sessions[1].task_name, "Renamed");
    assert_eq!(outgoing(&workspace).len(), 2);
}

#[test]
fn linking_makes_an_id_once_and_claims_the_running_timers() {
    let mut workspace = Workspace::default();
    let mut running = session(
        "s",
        "1",
        json!([
            timer("r", "2026-11-01T09:00:00Z", true),
            timer("f", "2026-11-01T08:00:00Z", false)
        ]),
    );
    running.timer_instances[0].running_on = None;
    workspace.sessions.push(running);
    workspace.sync.cursor = Some("old".into());
    let account = SyncAccount {
        uid: "u".into(),
        epoch: 3,
    };
    assert!(link(&mut workspace, account.clone()));
    let device = workspace.sync.device_id.clone();
    assert_eq!(device.len(), 36);
    let timers = &workspace.sessions[0].timer_instances;
    assert_eq!(timers[0].running_on.as_ref(), Some(&device));
    assert_eq!(timers[1].running_on, None);
    assert_eq!(workspace.sync.cursor, None);
    assert_eq!(workspace.sync.account, Some(account.clone()));

    // Again: the same id, nothing more to claim
    assert!(!link(&mut workspace, account));
    assert_eq!(workspace.sync.device_id, device);

    unlink(&mut workspace);
    assert_eq!(
        workspace.sync,
        SyncState {
            device_id: device,
            ..SyncState::default()
        }
    );
}

#[test]
fn started_timers_are_claimed_once_the_device_has_an_id() {
    let mut workspace = Workspace::default();
    workspace.sessions.push(session(
        "s",
        "1",
        json!([timer("r", "2026-11-01T09:00:00Z", true)]),
    ));
    assert!(!claim_timers(&mut workspace, &["r"]));
    workspace.sync.device_id = "dev".into();
    assert!(claim_timers(&mut workspace, &["r", "missing"]));
    assert_eq!(
        workspace.sessions[0].timer_instances[0]
            .running_on
            .as_deref(),
        Some("dev")
    );
    assert!(!claim_timers(&mut workspace, &["r"]));
}
