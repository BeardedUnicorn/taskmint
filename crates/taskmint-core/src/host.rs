//! A host that keeps one user's data in memory: the web app's, through
//! crates/taskmint-wasm, where the cloud copy (cloud sync) is what lasts. It
//! runs a command the way every host does: a write on a draft that replaces
//! the data only when the command succeeds, with its events kept for the
//! shell to take.
//!
//! Nothing it holds outlives the page, so it keeps no safety copies (a
//! command's `backups`): the page has nowhere to put them, and nothing reads
//! them back. A reset reports none deleted.

use crate::command::{execute, Command, Ctx, Event};
use crate::contract::events::SYNC_PENDING;
use crate::workspace::{Parts, Workspace};
use crate::DayZone;
use chrono::DateTime;
use serde_json::{json, Value};

#[derive(Debug, Default)]
pub struct MemoryHost {
    pub workspace: Workspace,
    events: Vec<Event>,
}

impl MemoryHost {
    /// Runs a command by name with the client's arguments.
    pub fn call(&mut self, name: &str, args: Value, ctx: &Ctx) -> Result<Value, String> {
        self.run(name, args, ctx).map(|(reply, _)| reply)
    }

    /// `call`, with the parts the command changed.
    fn run(&mut self, name: &str, args: Value, ctx: &Ctx) -> Result<(Value, Parts), String> {
        let command = Command::parse(name, args).map_err(|e| e.to_string())?;
        let done = if command.access().write {
            let mut draft = self.workspace.clone();
            let done = execute(command, &mut draft, ctx).map_err(|e| e.to_string())?;
            self.workspace = draft;
            done
        } else {
            execute(command, &mut self.workspace, ctx).map_err(|e| e.to_string())?
        };
        self.events.extend(done.events);
        Ok((done.reply, done.dirty))
    }

    /// The events since this was last called.
    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }
}

/// The web app's host, as JavaScript sees it: JSON in and out, the time as
/// milliseconds, and the browser's IANA zone (`Intl`), UTC when it isn't one.
/// As the desktop's shell does, it announces `sync-pending` after a change
/// that syncs, while the page syncs.
#[derive(Debug)]
pub struct JsonHost {
    host: MemoryHost,
    zone: DayZone,
}

impl JsonHost {
    pub fn new(zone: &str) -> Self {
        Self {
            host: MemoryHost::default(),
            zone: DayZone::named(zone).unwrap_or(DayZone::UTC),
        }
    }

    /// `args` as JSON text; the reply as JSON text, or the client's error.
    pub fn call(&mut self, name: &str, args: &str, now_ms: f64) -> Result<String, String> {
        let args: Value = serde_json::from_str(args)
            .map_err(|e| format!("Invalid arguments for {}: {}", name, e))?;
        let ctx = Ctx {
            now: DateTime::from_timestamp_millis(now_ms as i64).unwrap_or_default(),
            zone: self.zone,
        };
        let (reply, changed) = self.host.run(name, args, &ctx)?;
        if changed.intersects(Parts::SESSIONS | Parts::WORK_LOGS | Parts::RECORDS)
            && self.host.workspace.sync.account.is_some()
        {
            self.host.events.push(Event::new(SYNC_PENDING, ()));
        }
        Ok(reply.to_string())
    }

    /// The events since last asked: `[{ name, payload }]`, as JSON text.
    pub fn take_events(&mut self) -> String {
        let events: Vec<Value> = self
            .host
            .take_events()
            .into_iter()
            .map(|event| json!({ "name": event.name, "payload": event.payload }))
            .collect();
        Value::Array(events).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::{run_all, start_time, Host};

    /// The scenarios against the memory host. Reloading reads back what a
    /// device would have saved (the testkit's own reload), so the scenarios
    /// written for the desktop hold here too.
    struct Scenarios {
        host: MemoryHost,
        now: chrono::DateTime<chrono::Utc>,
    }

    impl Host for Scenarios {
        fn call(&mut self, command: &str, args: Value) -> Result<Value, String> {
            let ctx = Ctx {
                now: self.now,
                zone: DayZone::UTC,
            };
            self.host.call(command, args, &ctx)
        }

        fn take_events(&mut self) -> Vec<String> {
            self.host
                .take_events()
                .into_iter()
                .map(|event| event.name.to_string())
                .collect()
        }

        fn advance(&mut self, ms: i64) {
            self.now += chrono::Duration::milliseconds(ms);
        }

        fn reload(&mut self) {
            let saved = &self.host.workspace;
            self.host.workspace = Workspace {
                sessions: serde_json::from_value(json!(saved.sessions)).unwrap(),
                work_log_entries: serde_json::from_value(json!(saved.work_log_entries)).unwrap(),
                work_log_mappings: serde_json::from_value(json!(saved.work_log_mappings)).unwrap(),
                records: saved.records.clone(),
                pending_capture: saved.pending_capture.clone(),
                sync: serde_json::from_value(serde_json::to_value(&saved.sync).unwrap()).unwrap(),
                ..Workspace::default()
            };
        }
    }

    #[test]
    fn the_memory_host_passes_every_scenario() {
        run_all(&mut || {
            Box::new(Scenarios {
                host: MemoryHost::default(),
                now: start_time(),
            })
        })
        .unwrap();
    }

    #[test]
    fn the_json_host_takes_and_gives_json_in_the_browsers_zone() {
        let mut host = JsonHost::new("America/New_York");
        assert_eq!(host.zone, DayZone::named("America/New_York").unwrap());
        assert_eq!(JsonHost::new("Mars/Olympus").zone, DayZone::UTC);

        // 2026-03-02T15:00:00Z
        let now = 1_772_463_600_000.0;
        let started = host
            .call("start_task", r#"{"taskId":"t1","taskName":"Writing"}"#, now)
            .unwrap();
        assert!(started.contains(r#""outcome":"started""#));
        let events: Value = serde_json::from_str(&host.take_events()).unwrap();
        assert_eq!(events[0]["name"], "timer-instance-started");
        assert_eq!(
            events[0]["payload"]["startTime"],
            "2026-03-02T15:00:00+00:00"
        );
        assert_eq!(host.take_events(), "[]");

        let sessions: Value =
            serde_json::from_str(&host.call("get_sessions", "{}", now).unwrap()).unwrap();
        // Dated in New York, where it's still the morning of the 2nd
        assert_eq!(sessions[0]["date"], "2026-03-02");

        assert_eq!(
            host.call("start_task", "{", now),
            Err(
                "Invalid arguments for start_task: EOF while parsing an object at line 1 column 1"
                    .to_string()
            )
        );
        assert_eq!(
            host.call("start_task", r#"{"taskId":"","taskName":""}"#, now),
            Err("Choose a task to start".to_string())
        );
        assert_eq!(
            host.call("nothing", "{}", now),
            Err("Unknown command: nothing".to_string())
        );

        // Once it syncs, a change that syncs is announced, and nothing else is
        host.call(
            "link_sync_account",
            r#"{"uid":"u","epoch":1,"mode":"merge"}"#,
            now,
        )
        .unwrap();
        host.take_events();
        host.call(
            "set_app_record",
            r#"{"key":"dailyGoal","value":{"n":1}}"#,
            now,
        )
        .unwrap();
        let events: Value = serde_json::from_str(&host.take_events()).unwrap();
        assert_eq!(events[1]["name"], "sync-pending");
        host.call("get_sync_status", "{}", now).unwrap();
        host.call("unlink_sync_account", "{}", now).unwrap();
        host.call(
            "set_app_record",
            r#"{"key":"dailyGoal","value":{"n":2}}"#,
            now,
        )
        .unwrap();
        assert!(!host.take_events().contains("sync-pending"));
        // A read that fails changes nothing either
        host.host.workspace.notes.records_error = Some("unreadable".into());
        assert_eq!(
            host.call("get_app_records", "{}", now),
            Err("unreadable".to_string())
        );
    }
}
