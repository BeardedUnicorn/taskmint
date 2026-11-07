//! Restoring a TaskMint export into the sessions and the work-log ledger.
//!
//! Records are parsed one at a time with the same tolerance as the startup
//! load, so one unreadable record in an old export skips that record instead
//! of failing the whole restore.

use crate::load::parse_sessions;
use crate::model::{ProjectTaskMapping, TaskSession, WorkLogEntry};
use crate::timer::{recalculate_total_duration, stop_active_instances};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// restore_backup_data's payload: the export's sections, each optional (a
/// v1 export has no work logs).
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct RestorePayload {
    pub mode: RestoreMode,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<serde_json::Value>", optional))]
    pub sessions: serde_json::Value,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<serde_json::Value>", optional))]
    pub work_log_entries: serde_json::Value,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<serde_json::Value>", optional))]
    pub work_log_mappings: serde_json::Value,
    /// The export's own timestamp; timers that were live when it was taken
    /// are finalized at this moment (see finalize_time).
    #[serde(default)]
    pub exported_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct RestoreSummary {
    pub sessions_restored: usize,
    pub sessions_already_present: usize,
    pub work_log_entries_restored: usize,
    pub work_log_mappings_restored: usize,
    /// Records in the file that could not be read and were skipped.
    pub records_skipped: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum RestoreMode {
    /// Add records whose id is not already present; existing data wins.
    Merge,
    /// Replace the stores' contents with the file's.
    Replace,
}

/// Tolerant per-record parser: (records read, records skipped).
pub type SectionParser<T> = fn(&serde_json::Value) -> Result<(Vec<T>, usize), String>;

/// A section missing from the file (null) leaves that store untouched, even in
/// replace mode: v1 exports have no work logs, and restoring one must not wipe
/// the ledger.
pub fn parse_section<T>(
    value: &serde_json::Value,
    parse: SectionParser<T>,
) -> Result<(Option<Vec<T>>, usize), String> {
    if value.is_null() {
        return Ok((None, 0));
    }
    parse(value).map(|(records, skipped)| (Some(records), skipped))
}

pub fn parse_sessions_section(
    value: &serde_json::Value,
) -> Result<(Vec<TaskSession>, usize), String> {
    parse_sessions(value).map(|loaded| (loaded.sessions, loaded.skipped))
}

/// Restored sessions are history: none is active, and a timer that was live
/// when the export was taken is finalized at the export time (its real end is
/// unknown; finalizing at "now" would credit every day since the export;
/// see finalize_time).
pub fn normalize_restored_session(session: &mut TaskSession, finalize_at: DateTime<Utc>) {
    stop_active_instances(session, finalize_at);
    session.is_active = false;
    recalculate_total_duration(session);
}

/// Returns (restored, already_present).
pub fn restore_sessions(
    store: &mut Vec<TaskSession>,
    incoming: Vec<TaskSession>,
    mode: RestoreMode,
    finalize_at: DateTime<Utc>,
) -> (usize, usize) {
    let mut incoming = incoming;
    for session in incoming.iter_mut() {
        normalize_restored_session(session, finalize_at);
    }
    match mode {
        RestoreMode::Replace => {
            let total = incoming.len();
            *store = first_of_each(incoming, |s| s.id.as_str());
            (store.len(), total - store.len())
        }
        RestoreMode::Merge => {
            let mut existing: HashSet<String> = store.iter().map(|s| s.id.clone()).collect();
            let mut restored = 0;
            let mut already_present = 0;
            for session in incoming {
                if existing.insert(session.id.clone()) {
                    store.push(session);
                    restored += 1;
                } else {
                    already_present += 1;
                }
            }
            (restored, already_present)
        }
    }
}

/// `records` without repeats: the first record with each key. Stores keep
/// one record per key (the server's rows are keyed by it), so a file that
/// lists one twice restores it once.
fn first_of_each<T>(records: Vec<T>, key: fn(&T) -> &str) -> Vec<T> {
    let mut seen = HashSet::new();
    records
        .into_iter()
        .filter(|record| seen.insert(key(record).to_string()))
        .collect()
}

/// Replace or merge records keyed by `key`. Merge keeps the store's version of
/// a record that is already present (for work logs it reflects the site's
/// latest status); only records the store lacks are added. Returns how many
/// records from `incoming` ended up in the store.
fn restore_keyed<T>(
    store: &mut Vec<T>,
    incoming: Vec<T>,
    mode: RestoreMode,
    key: fn(&T) -> &str,
) -> usize {
    match mode {
        RestoreMode::Replace => {
            *store = first_of_each(incoming, key);
            store.len()
        }
        RestoreMode::Merge => {
            let mut present: HashSet<String> = store.iter().map(|r| key(r).to_string()).collect();
            let mut added = 0;
            for record in incoming {
                if present.insert(key(&record).to_string()) {
                    store.push(record);
                    added += 1;
                }
            }
            added
        }
    }
}

pub fn restore_work_log_entries(
    store: &mut Vec<WorkLogEntry>,
    incoming: Vec<WorkLogEntry>,
    mode: RestoreMode,
) -> usize {
    restore_keyed(store, incoming, mode, |e| e.id.as_str())
}

pub fn restore_project_mappings(
    store: &mut Vec<ProjectTaskMapping>,
    incoming: Vec<ProjectTaskMapping>,
    mode: RestoreMode,
) -> usize {
    restore_keyed(store, incoming, mode, |m| m.project_id.as_str())
}

/// When to finalize timers that were live in an export: its own timestamp,
/// but never later than `now` (a bad or missing stamp means `now`).
pub fn finalize_time(exported_at: Option<&str>, now: DateTime<Utc>) -> DateTime<Utc> {
    exported_at
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc).min(now))
        .unwrap_or(now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{TimerInstance, WorkLogKind};
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn instance(id: &str, start: i64) -> TimerInstance {
        TimerInstance {
            id: id.to_string(),
            session_id: "s".to_string(),
            start_time: ts(start),
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
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn finished(id: &str, start: i64, secs: u64) -> TimerInstance {
        TimerInstance {
            end_time: Some(ts(start + secs as i64)),
            duration: Some(secs * 1000),
            ..instance(id, start)
        }
    }

    fn session(id: &str, instances: Vec<TimerInstance>, active: bool) -> TaskSession {
        let mut session = TaskSession {
            id: id.to_string(),
            task_id: "task".to_string(),
            task_name: "Task".to_string(),
            timer_instances: instances,
            total_duration: 0,
            notes: None,
            is_active: active,
            source: None,
            hourly_rate: None,
            date: "2026-01-01".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        recalculate_total_duration(&mut session);
        session
    }

    fn entry(id: &str, status: &str) -> WorkLogEntry {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "kind": "timed",
            "status": status,
        }))
        .unwrap()
    }

    fn mapping(project_id: &str, task_id: &str) -> ProjectTaskMapping {
        ProjectTaskMapping {
            project_id: project_id.to_string(),
            project_name: String::new(),
            task_id: task_id.to_string(),
            task_name: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn merge_adds_only_sessions_not_already_present() {
        let mut store = vec![session("a", vec![finished("a1", 0, 60)], true)];
        let incoming = vec![
            session("a", vec![finished("x", 0, 999)], false),
            session("b", vec![finished("b1", 100, 30)], false),
        ];

        let (restored, present) =
            restore_sessions(&mut store, incoming, RestoreMode::Merge, ts(1000));

        assert_eq!((restored, present), (1, 1));
        assert_eq!(store.len(), 2);
        // The current copy of "a" is untouched, including its active flag.
        assert_eq!(store[0].timer_instances[0].id, "a1");
        assert!(store[0].is_active);
        assert_eq!(store[1].id, "b");
        assert_eq!(store[1].total_duration, 30_000);
    }

    #[test]
    fn replace_swaps_in_the_file_sessions() {
        let mut store = vec![session("a", vec![], true)];
        let incoming = vec![session("b", vec![], false), session("c", vec![], false)];

        let (restored, present) =
            restore_sessions(&mut store, incoming, RestoreMode::Replace, ts(1000));

        assert_eq!((restored, present), (2, 0));
        assert_eq!(
            store.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            vec!["b", "c"]
        );
    }

    #[test]
    fn a_file_listing_a_session_twice_restores_it_once() {
        let mut store = Vec::new();
        let mut second = session("b", vec![], false);
        second.task_name = "Second copy".to_string();
        let incoming = vec![
            session("b", vec![], false),
            session("c", vec![], false),
            second,
        ];

        let (restored, present) =
            restore_sessions(&mut store, incoming, RestoreMode::Replace, ts(1000));

        assert_eq!((restored, present), (2, 1));
        assert_eq!(
            store.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            vec!["b", "c"]
        );
        assert_ne!(store[0].task_name, "Second copy");
    }

    #[test]
    fn restored_sessions_are_inactive_with_live_timers_finalized_at_export_time() {
        let mut running = instance("r", 100);
        running.is_running = true;
        let mut paused = instance("p", 200);
        paused.is_paused = true;
        paused.paused_at = Some(ts(260));
        paused.paused_duration = Some(0);
        let mut store = Vec::new();

        restore_sessions(
            &mut store,
            vec![session("s", vec![running, paused], true)],
            RestoreMode::Merge,
            ts(400),
        );

        let restored = &store[0];
        assert!(!restored.is_active);
        let r = &restored.timer_instances[0];
        assert!(!r.is_running);
        assert_eq!(r.end_time, Some(ts(400)));
        assert_eq!(r.duration, Some(300_000));
        // A paused timer freezes at its pause point.
        let p = &restored.timer_instances[1];
        assert!(!p.is_paused);
        assert_eq!(p.duration, Some(60_000));
        assert_eq!(restored.total_duration, 360_000);
    }

    #[test]
    fn merge_keeps_current_work_log_entries_and_mappings() {
        let mut entries = vec![entry("e1", "Paid")];
        let mut mappings = vec![mapping("p1", "task-current")];

        let entries_added = restore_work_log_entries(
            &mut entries,
            vec![
                entry("e1", "Pending Approval"),
                entry("e2", "Pending Approval"),
            ],
            RestoreMode::Merge,
        );
        let mappings_added = restore_project_mappings(
            &mut mappings,
            vec![mapping("p1", "task-old"), mapping("p2", "task-2")],
            RestoreMode::Merge,
        );

        assert_eq!((entries_added, mappings_added), (1, 1));
        assert_eq!(entries[0].status, "Paid");
        assert_eq!(entries[1].id, "e2");
        assert_eq!(mappings[0].task_id, "task-current");
        assert_eq!(mappings[1].project_id, "p2");
        assert_eq!(entries[1].kind, WorkLogKind::Timed);
    }

    #[test]
    fn replace_swaps_work_logs_wholesale() {
        let mut entries = vec![entry("e1", "Paid")];
        let mut mappings = vec![mapping("p1", "t")];

        let entries_restored = restore_work_log_entries(
            &mut entries,
            vec![entry("e9", "Paid"), entry("e9", "Pending")],
            RestoreMode::Replace,
        );
        let mappings_restored =
            restore_project_mappings(&mut mappings, vec![], RestoreMode::Replace);

        // One record per id: the file's first
        assert_eq!((entries_restored, mappings_restored), (1, 0));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "e9");
        assert_eq!(entries[0].status, "Paid");
        assert!(mappings.is_empty());
    }

    #[test]
    fn missing_section_is_left_untouched() {
        let (sessions, skipped) =
            parse_section(&serde_json::Value::Null, parse_sessions_section).unwrap();
        assert!(sessions.is_none());
        assert_eq!(skipped, 0);
    }

    #[test]
    fn present_section_skips_unreadable_records() {
        let (sessions, skipped) = parse_section(
            &serde_json::json!([{ "id": "ok" }, { "taskId": "no id" }]),
            parse_sessions_section,
        )
        .unwrap();
        assert_eq!(sessions.unwrap().len(), 1);
        assert_eq!(skipped, 1);
    }

    #[test]
    fn non_array_section_is_rejected() {
        assert!(parse_section(&serde_json::json!({"oops": 1}), parse_sessions_section).is_err());
    }

    #[test]
    fn finalize_time_uses_export_time_but_never_the_future() {
        let now = ts(1_000_000);
        assert_eq!(finalize_time(Some("1970-01-01T00:16:40Z"), now), ts(1000));
        assert_eq!(finalize_time(Some("2999-01-01T00:00:00Z"), now), now);
        assert_eq!(finalize_time(Some("not a date"), now), now);
        assert_eq!(finalize_time(None, now), now);
    }
}
