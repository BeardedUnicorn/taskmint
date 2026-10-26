//! The scenarios against core itself, and the runner's own checks.

use super::*;
use crate::command::{execute, Command, Ctx};
use crate::model::{ProjectTaskMapping, TaskSession, WorkLogEntry};
use crate::workspace::{Parts, Workspace};
use crate::zone::DayZone;
use serde_json::json;

/// Core in memory, as a host would run it: each command on a copy, kept
/// only when it succeeds. It also checks what every host relies on: a
/// command changes only the parts it declares, and reports every part it
/// changed, so a host that saves the dirty parts saves all of it.
struct MemoryHost {
    workspace: Workspace,
    now: DateTime<Utc>,
    events: Vec<String>,
}

impl MemoryHost {
    fn new() -> Self {
        Self {
            workspace: Workspace::default(),
            now: start_time(),
            events: Vec::new(),
        }
    }
}

/// Which parts differ between two workspaces.
fn changed(before: &Workspace, after: &Workspace) -> Parts {
    let mut parts = Parts::NONE;
    if before.sessions != after.sessions {
        parts |= Parts::SESSIONS;
    }
    if before.work_log_entries != after.work_log_entries
        || before.work_log_mappings != after.work_log_mappings
    {
        parts |= Parts::WORK_LOGS;
    }
    if before.records != after.records {
        parts |= Parts::RECORDS;
    }
    if before.pending_capture != after.pending_capture {
        parts |= Parts::CAPTURE;
    }
    parts
}

impl Host for MemoryHost {
    fn call(&mut self, command: &str, args: Value) -> Result<Value, String> {
        let command = Command::parse(command, args).map_err(|e| e.to_string())?;
        let access = command.access();
        let mut draft = self.workspace.clone();
        let ctx = Ctx {
            now: self.now,
            zone: DayZone::Named(chrono_tz::UTC),
        };
        let done = execute(command, &mut draft, &ctx).map_err(|e| e.to_string())?;
        let changed = changed(&self.workspace, &draft);
        assert!(
            access.parts.contains(changed),
            "changed {:?}, declared {:?}",
            changed,
            access
        );
        assert!(
            done.dirty.contains(changed),
            "changed {:?}, dirty {:?}",
            changed,
            done.dirty
        );
        // A host runs a read on the live data, and saves nothing after it
        assert!(
            access.write || (changed.is_empty() && done.dirty.is_empty()),
            "a read changed {:?}",
            changed
        );
        self.workspace = draft;
        self.events
            .extend(done.events.iter().map(|e| e.name.to_string()));
        Ok(done.reply)
    }

    fn take_events(&mut self) -> Vec<String> {
        std::mem::take(&mut self.events)
    }

    fn advance(&mut self, ms: i64) {
        self.now += chrono::Duration::milliseconds(ms);
    }

    /// What a host saves goes through JSON; the capture waiting for the
    /// frontend is kept (the server stores it; scenarios don't reload with
    /// one waiting, since the desktop keeps it in memory only).
    fn reload(&mut self) {
        fn round_trip<T: serde::Serialize + serde::de::DeserializeOwned>(value: &T) -> T {
            serde_json::from_value(serde_json::to_value(value).unwrap()).unwrap()
        }
        let saved = &self.workspace;
        self.workspace = Workspace {
            sessions: round_trip::<Vec<TaskSession>>(&saved.sessions),
            work_log_entries: round_trip::<Vec<WorkLogEntry>>(&saved.work_log_entries),
            work_log_mappings: round_trip::<Vec<ProjectTaskMapping>>(&saved.work_log_mappings),
            records: saved.records.clone(),
            pending_capture: saved.pending_capture.clone(),
            notes: Default::default(),
        };
    }
}

#[test]
fn core_passes_every_scenario() {
    run_all(&mut || Box::new(MemoryHost::new())).unwrap();
}

/// Replies and events from a script, for checking the runner.
#[derive(Default)]
struct ScriptedHost {
    replies: Vec<Result<Value, String>>,
    events: Vec<String>,
    advanced: i64,
    reloads: usize,
}

impl Host for ScriptedHost {
    fn call(&mut self, _command: &str, _args: Value) -> Result<Value, String> {
        self.replies.remove(0)
    }

    fn take_events(&mut self) -> Vec<String> {
        std::mem::take(&mut self.events)
    }

    fn advance(&mut self, ms: i64) {
        self.advanced += ms;
    }

    fn reload(&mut self) {
        self.reloads += 1;
    }
}

fn scenario(steps: Value) -> Scenario {
    serde_json::from_value(json!({ "name": "check", "steps": steps })).unwrap()
}

fn run_with(steps: Value, replies: Vec<Result<Value, String>>) -> Result<(), String> {
    run(
        &scenario(steps),
        &mut ScriptedHost {
            replies,
            ..Default::default()
        },
    )
}

#[test]
fn steps_move_the_clock_and_reload_without_a_call() {
    let mut host = ScriptedHost::default();
    run(
        &scenario(json!([{ "advanceMs": 5 }, { "reload": true, "advanceMs": 7 }])),
        &mut host,
    )
    .unwrap();
    assert_eq!((host.advanced, host.reloads), (12, 1));
}

#[test]
fn a_reply_is_checked_and_saved_for_later_steps() {
    let steps = json!([
        { "call": "a", "reply": { "id": "$any", "n": 1.0 }, "save": { "id": "/id" } },
        { "call": "b", "args": { "ids": ["$id"], "keep": 3 }, "reply": "$id" }
    ]);
    assert_eq!(
        run_with(
            steps,
            vec![
                Ok(json!({ "id": "x", "n": 1, "extra": true })),
                Ok(json!("x"))
            ]
        ),
        Ok(())
    );
}

#[test]
fn a_mismatch_names_the_scenario_step_and_place() {
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": { "n": 2 } }]),
            vec![Ok(json!({ "n": 1 }))]
        ),
        Err(r#"check, step 1: a replied {"n":1}: at "/n", expected 2"#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": [1] }]),
            vec![Ok(json!([1, 2]))]
        ),
        Err(r#"check, step 1: a replied [1,2]: at "", 2 items, not 1"#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": [{ "n": 1 }] }]),
            vec![Ok(json!([{ "n": 0 }]))]
        ),
        Err(r#"check, step 1: a replied [{"n":0}]: at "/0/n", expected 1"#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": {} }]),
            vec![Ok(json!({ "n": 1 }))]
        ),
        Err(r#"check, step 1: a replied {"n":1}: at "", expected an empty object"#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": { "n": 1 } }]),
            vec![Ok(json!({}))]
        ),
        Err(r#"check, step 1: a replied {}: at "/n", nothing"#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": { "n": "$absent" } }]),
            vec![Ok(json!({ "n": 1 }))]
        ),
        Err(r#"check, step 1: a replied {"n":1}: at "/n", expected nothing"#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": { "n": "$absent" } }]),
            vec![Ok(json!({}))]
        ),
        Ok(())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": "text" }]),
            vec![Ok(json!(1))]
        ),
        Err(r#"check, step 1: a replied 1: at "", expected "text""#.to_string())
    );
}

#[test]
fn a_saved_value_must_match_and_exist() {
    let steps = json!([
        { "call": "a", "save": { "id": "/id" } },
        { "call": "b", "reply": "$id" }
    ]);
    assert_eq!(
        run_with(steps, vec![Ok(json!({ "id": "x" })), Ok(json!("y"))]),
        Err(r#"check, step 2: b replied "y": at "", expected "$id""#.to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "reply": "$id" }]),
            vec![Ok(json!("x"))]
        ),
        Err(r#"check, step 1: a replied "x": nothing was saved as $id"#.to_string())
    );
    assert_eq!(
        run_with(json!([{ "call": "a", "args": ["$id"] }]), vec![]),
        Err("check, step 1: nothing was saved as $id".to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "args": { "nested": { "id": "$id" } } }]),
            vec![]
        ),
        Err("check, step 1: nothing was saved as $id".to_string())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "save": { "id": "/id" } }]),
            vec![Ok(json!({}))]
        ),
        Err("check, step 1: a replied {}, with nothing at /id".to_string())
    );
}

#[test]
fn errors_and_events_must_be_exactly_as_expected() {
    assert_eq!(
        run_with(
            json!([{ "call": "a", "error": "no" }]),
            vec![Err("no".to_string())]
        ),
        Ok(())
    );
    assert_eq!(
        run_with(
            json!([{ "call": "a", "error": "no" }]),
            vec![Err("other".to_string())]
        ),
        Err(r#"check, step 1: a failed with "other", not "no""#.to_string())
    );
    assert_eq!(
        run_with(json!([{ "call": "a" }]), vec![Err("other".to_string())]),
        Err("check, step 1: a failed: other".to_string())
    );
    assert_eq!(
        run_with(json!([{ "call": "a", "error": "no" }]), vec![Ok(json!(1))]),
        Err(r#"check, step 1: a replied 1 instead of failing with "no""#.to_string())
    );

    let mut host = ScriptedHost {
        replies: vec![Ok(Value::Null)],
        events: vec!["ping".to_string()],
        ..Default::default()
    };
    assert_eq!(
        run(&scenario(json!([{ "call": "a" }])), &mut host),
        Err(r#"check, step 1: a published ["ping"], not []"#.to_string())
    );
}

#[test]
fn every_failing_scenario_is_reported() {
    let report = run_all(&mut || {
        Box::new(ScriptedHost {
            replies: vec![Err("down".to_string()); 100],
            ..Default::default()
        })
    })
    .unwrap_err();
    assert_eq!(report.lines().count(), scenarios().len());
}
