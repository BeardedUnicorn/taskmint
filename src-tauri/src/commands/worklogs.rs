// Work-log reconciliation commands: the imported ledger (worklogs.json) and
// the destructive per-day session rewrite it drives.
//
// Day bucketing lives in the frontend only (src/utils/workLogImport.ts): the
// frontend derives each entry's workDay, decides which timer instances fall in
// a (task, day) bucket, and sends fully built replacement sessions. This
// module re-validates every group against current state and applies it, so a
// stale or malicious payload cannot corrupt the session invariants.

use crate::state::AppState;
use crate::storage;
use crate::types::{ProjectTaskMapping, TaskSession, WorkLogEntry};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use super::sessions::{recalculate_total_duration, MAX_TIMER_INSTANCES_PER_SESSION};

// Must match WORKLOG_IMPORT_SOURCE in src/types/workLog.ts.
const WORKLOG_IMPORT_SOURCE: &str = "worklog-import";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogsResponse {
    pub entries: Vec<WorkLogEntry>,
    pub mappings: Vec<ProjectTaskMapping>,
    pub load_warning: Option<String>,
}

/// One (task, workDay) rewrite: delete the listed finalized instances and
/// insert the replacement session built from the ledger.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewriteGroup {
    pub task_id: String,
    pub work_day: String,
    #[serde(default)]
    pub delete_instance_ids: Vec<String>,
    // Running/paused instances the frontend found in the bucket. Their
    // presence skips the group; the backend re-checks regardless.
    #[serde(default)]
    pub blocking_instance_ids: Vec<String>,
    pub replacement_session: TaskSession,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportPayload {
    #[serde(default)]
    pub entries: Vec<WorkLogEntry>,
    #[serde(default)]
    pub mappings: Vec<ProjectTaskMapping>,
    #[serde(default)]
    pub rewrite_groups: Vec<RewriteGroup>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedGroup {
    pub task_id: String,
    pub work_day: String,
    pub deleted_instances: usize,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedGroup {
    pub task_id: String,
    pub work_day: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportSummary {
    pub entries_added: usize,
    pub entries_updated: usize,
    pub mappings_saved: usize,
    pub groups_applied: Vec<AppliedGroup>,
    pub groups_skipped: Vec<SkippedGroup>,
}

/// Upsert ledger entries by id. An existing entry is replaced wholesale (the
/// site may revise minutes/amount/status) except `imported_at`, which keeps
/// its first-seen value. Returns (added, updated).
pub fn upsert_entries(
    store: &mut Vec<WorkLogEntry>,
    incoming: Vec<WorkLogEntry>,
    now_iso: &str,
) -> (usize, usize) {
    let mut added = 0;
    let mut updated = 0;
    for mut entry in incoming {
        entry.updated_at = now_iso.to_string();
        match store.iter_mut().find(|e| e.id == entry.id) {
            Some(existing) => {
                entry.imported_at = if existing.imported_at.is_empty() {
                    now_iso.to_string()
                } else {
                    existing.imported_at.clone()
                };
                *existing = entry;
                updated += 1;
            }
            None => {
                if entry.imported_at.is_empty() {
                    entry.imported_at = now_iso.to_string();
                }
                store.push(entry);
                added += 1;
            }
        }
    }
    (added, updated)
}

/// Upsert project→task mappings by project id, keeping `created_at` of an
/// existing mapping. Returns the number of mappings written.
pub fn upsert_mappings(
    store: &mut Vec<ProjectTaskMapping>,
    incoming: Vec<ProjectTaskMapping>,
    now_iso: &str,
) -> usize {
    let mut saved = 0;
    for mut mapping in incoming {
        mapping.updated_at = now_iso.to_string();
        match store.iter_mut().find(|m| m.project_id == mapping.project_id) {
            Some(existing) => {
                mapping.created_at = if existing.created_at.is_empty() {
                    now_iso.to_string()
                } else {
                    existing.created_at.clone()
                };
                *existing = mapping;
            }
            None => {
                if mapping.created_at.is_empty() {
                    mapping.created_at = now_iso.to_string();
                }
                store.push(mapping);
            }
        }
        saved += 1;
    }
    saved
}

fn find_instance<'a>(
    sessions: &'a [TaskSession],
    instance_id: &str,
) -> Option<(&'a TaskSession, &'a crate::types::TimerInstance)> {
    sessions.iter().find_map(|s| {
        s.timer_instances
            .iter()
            .find(|i| i.id == instance_id)
            .map(|i| (s, i))
    })
}

/// Re-validate a rewrite group against current state. Any Err skips the group
/// (reported in the summary) without touching sessions.
pub fn validate_rewrite_group(
    sessions: &[TaskSession],
    group: &RewriteGroup,
) -> Result<(), String> {
    let timer_active_msg = format!(
        "a timer is running or paused on {}; stop it first, then re-import",
        group.work_day
    );

    if !group.blocking_instance_ids.is_empty() {
        return Err(timer_active_msg);
    }

    for id in &group.delete_instance_ids {
        // Ids that resolve nowhere were already deleted — tolerated so
        // re-imports built from slightly stale state still converge.
        if let Some((session, instance)) = find_instance(sessions, id) {
            if instance.is_running || instance.is_paused {
                return Err(timer_active_msg);
            }
            if session.task_id != group.task_id {
                return Err(format!(
                    "instance {} belongs to another task and cannot be replaced by this import",
                    id
                ));
            }
        }
    }

    let replacement = &group.replacement_session;
    if replacement.task_id != group.task_id || replacement.date != group.work_day {
        return Err("replacement session does not match the import group".to_string());
    }
    if replacement.is_active {
        return Err("replacement session must not be active".to_string());
    }
    if replacement.timer_instances.len() > MAX_TIMER_INSTANCES_PER_SESSION {
        return Err(format!(
            "more than {} entries for {}; not supported",
            MAX_TIMER_INSTANCES_PER_SESSION, group.work_day
        ));
    }

    let delete_set: std::collections::HashSet<&str> = group
        .delete_instance_ids
        .iter()
        .map(String::as_str)
        .collect();
    if sessions.iter().any(|s| s.id == replacement.id) {
        return Err("replacement session id already exists".to_string());
    }
    for instance in &replacement.timer_instances {
        if instance.session_id != replacement.id {
            return Err("replacement instance is not linked to the replacement session".to_string());
        }
        if instance.is_running || instance.is_paused {
            return Err("replacement session is not finalized".to_string());
        }
        let (duration, end_time) = match (instance.duration, instance.end_time) {
            (Some(duration), Some(end_time)) => (duration, end_time),
            _ => return Err("replacement session is not finalized".to_string()),
        };
        // Enforce the stored invariant duration = endTime - startTime -
        // pausedDuration exactly, like the rest of the session backend.
        let paused = instance.paused_duration.unwrap_or(0) as i64;
        let elapsed = end_time.timestamp_millis() - instance.start_time.timestamp_millis();
        if elapsed - paused != duration as i64 {
            return Err("replacement instance violates the duration invariant".to_string());
        }
        let colliding = sessions.iter().any(|s| {
            s.timer_instances
                .iter()
                .any(|i| i.id == instance.id && !delete_set.contains(i.id.as_str()))
        });
        if colliding {
            return Err("replacement instance id already exists".to_string());
        }
    }

    Ok(())
}

/// Apply a validated rewrite group: remove the bucket's instances, drop
/// sessions this emptied (unless they carry user notes or are active — those
/// stay as shells), and insert the synthesized replacement.
pub fn apply_rewrite_group(
    sessions: &mut Vec<TaskSession>,
    group: RewriteGroup,
    now: DateTime<Utc>,
) -> AppliedGroup {
    let delete_set: std::collections::HashSet<&str> = group
        .delete_instance_ids
        .iter()
        .map(String::as_str)
        .collect();

    let mut deleted = 0;
    let mut emptied_session_ids: Vec<String> = Vec::new();
    for session in sessions.iter_mut() {
        if session.task_id != group.task_id {
            continue;
        }
        let before = session.timer_instances.len();
        session
            .timer_instances
            .retain(|i| !delete_set.contains(i.id.as_str()));
        let removed = before - session.timer_instances.len();
        if removed > 0 {
            deleted += removed;
            recalculate_total_duration(session);
            session.updated_at = now.to_rfc3339();
            if session.timer_instances.is_empty() {
                let has_notes = session
                    .notes
                    .as_deref()
                    .map_or(false, |n| !n.trim().is_empty());
                if !has_notes && !session.is_active {
                    emptied_session_ids.push(session.id.clone());
                }
            }
        }
    }
    sessions.retain(|s| !emptied_session_ids.contains(&s.id));

    let mut replacement = group.replacement_session;
    // The backend owns provenance and totals regardless of what was sent.
    replacement.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
    replacement.is_active = false;
    replacement.created_at = now.to_rfc3339();
    replacement.updated_at = now.to_rfc3339();
    recalculate_total_duration(&mut replacement);
    let session_id = replacement.id.clone();
    sessions.push(replacement);

    AppliedGroup {
        task_id: group.task_id,
        work_day: group.work_day,
        deleted_instances: deleted,
        session_id,
    }
}

#[tauri::command]
pub fn get_work_logs(app_state: State<'_, AppState>) -> Result<WorkLogsResponse, String> {
    let (entries, mappings) =
        app_state.with_work_logs(|wl| (wl.entries.clone(), wl.mappings.clone()))?;
    let load_warning = app_state.with_work_log_load_warning(|w| w.clone())?;
    Ok(WorkLogsResponse {
        entries,
        mappings,
        load_warning,
    })
}

#[tauri::command]
pub async fn apply_work_log_import(
    app: AppHandle,
    app_state: State<'_, AppState>,
    payload: WorkLogImportPayload,
) -> Result<WorkLogImportSummary, String> {
    let now = Utc::now();
    let now_iso = now.to_rfc3339();

    // Lock order: sessions → worklogs. This is the only command holding both;
    // any future command touching both stores must lock in the same order.
    let summary = app_state.with_task_sessions_mut(|sessions| -> Result<WorkLogImportSummary, String> {
        app_state.with_work_logs_mut(|work_logs| -> Result<WorkLogImportSummary, String> {
            let (entries_added, entries_updated) =
                upsert_entries(&mut work_logs.entries, payload.entries, &now_iso);
            let mappings_saved =
                upsert_mappings(&mut work_logs.mappings, payload.mappings, &now_iso);

            // The rewrite deletes real tracked data; keep a pre-import copy of
            // the store file. Best-effort — an import must not fail because a
            // backup could not be written.
            if !payload.rewrite_groups.is_empty() {
                if let Err(e) = storage::backup_store_file(&app) {
                    eprintln!("Failed to back up sessions before import: {}", e);
                }
            }

            let mut groups_applied = Vec::new();
            let mut groups_skipped = Vec::new();
            for group in payload.rewrite_groups {
                match validate_rewrite_group(sessions, &group) {
                    Ok(()) => groups_applied.push(apply_rewrite_group(sessions, group, now)),
                    Err(reason) => groups_skipped.push(SkippedGroup {
                        task_id: group.task_id,
                        work_day: group.work_day,
                        reason,
                    }),
                }
            }

            if !groups_applied.is_empty() {
                storage::save_sessions(&app, sessions)?;
            }
            storage::save_work_logs(&app, &work_logs.entries, &work_logs.mappings)?;

            Ok(WorkLogImportSummary {
                entries_added,
                entries_updated,
                mappings_saved,
                groups_applied,
                groups_skipped,
            })
        })?
    })??;

    if !summary.groups_applied.is_empty() {
        // Refreshes the frontend session context (same debounced reload path
        // as the timer-instance events). Non-fatal: the import is persisted.
        let _ = app.emit(
            "work-logs-imported",
            serde_json::json!({ "groupsApplied": summary.groups_applied.len() }),
        );
    }

    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{TimerInstance, WorkLogKind};
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn entry(id: &str) -> WorkLogEntry {
        WorkLogEntry {
            id: id.to_string(),
            kind: WorkLogKind::Timed,
            created_at: "2026-08-26T05:10:35Z".to_string(),
            work_day: "2026-08-25".to_string(),
            project_id: "proj-1".to_string(),
            project_name: "Raccoon - SWE".to_string(),
            task_id: "task-1".to_string(),
            task_name: "Raccoon - SWE".to_string(),
            time_in_minutes: Some(30.0),
            reported_time_in_minutes: None,
            amount_cents: 3750,
            status: "Pending Approval".to_string(),
            imported_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn mapping(project_id: &str, task_id: &str) -> ProjectTaskMapping {
        ProjectTaskMapping {
            project_id: project_id.to_string(),
            project_name: "Raccoon - SWE".to_string(),
            task_id: task_id.to_string(),
            task_name: "Raccoon - SWE".to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn finalized_instance(id: &str, session_id: &str, start_secs: i64, ms: u64) -> TimerInstance {
        TimerInstance {
            id: id.to_string(),
            session_id: session_id.to_string(),
            start_time: ts(start_secs),
            end_time: Some(ts(start_secs + (ms / 1000) as i64)),
            duration: Some(ms),
            is_running: false,
            is_paused: false,
            paused_at: None,
            paused_duration: None,
            resumed_at: None,
            external_id: None,
            notes: None,
            created_at: ts(start_secs).to_rfc3339(),
            updated_at: ts(start_secs).to_rfc3339(),
        }
    }

    fn session_with(id: &str, task_id: &str, instances: Vec<TimerInstance>) -> TaskSession {
        let total = instances.iter().filter_map(|i| i.duration).sum();
        TaskSession {
            id: id.to_string(),
            task_id: task_id.to_string(),
            task_name: "Task".to_string(),
            timer_instances: instances,
            total_duration: total,
            notes: None,
            is_active: false,
            source: None,
            date: "2026-08-25".to_string(),
            created_at: ts(0).to_rfc3339(),
            updated_at: ts(0).to_rfc3339(),
        }
    }

    fn replacement(task_id: &str, work_day: &str, instances: Vec<TimerInstance>) -> TaskSession {
        let mut session = session_with("session_repl", task_id, instances);
        session.date = work_day.to_string();
        session.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
        session
    }

    fn repl_instance(id: &str, start_secs: i64, ms: u64) -> TimerInstance {
        let mut i = finalized_instance(id, "session_repl", start_secs, ms);
        i.external_id = Some(format!("ext-{}", id));
        i
    }

    fn group(task_id: &str, delete: Vec<&str>, replacement: TaskSession) -> RewriteGroup {
        RewriteGroup {
            task_id: task_id.to_string(),
            work_day: replacement.date.clone(),
            delete_instance_ids: delete.into_iter().map(String::from).collect(),
            blocking_instance_ids: Vec::new(),
            replacement_session: replacement,
        }
    }

    // ---- upserts -----------------------------------------------------------

    #[test]
    fn upsert_entries_adds_then_updates_preserving_imported_at() {
        let mut store = Vec::new();
        let (added, updated) = upsert_entries(&mut store, vec![entry("e1")], "T1");
        assert_eq!((added, updated), (1, 0));
        assert_eq!(store[0].imported_at, "T1");
        assert_eq!(store[0].updated_at, "T1");

        let mut revised = entry("e1");
        revised.amount_cents = 9999;
        revised.status = "Approved".to_string();
        let (added, updated) = upsert_entries(&mut store, vec![revised], "T2");
        assert_eq!((added, updated), (0, 1));
        assert_eq!(store.len(), 1);
        assert_eq!(store[0].amount_cents, 9999);
        assert_eq!(store[0].status, "Approved");
        assert_eq!(store[0].imported_at, "T1"); // first-seen preserved
        assert_eq!(store[0].updated_at, "T2");
    }

    #[test]
    fn upsert_entries_is_idempotent() {
        let mut store = Vec::new();
        upsert_entries(&mut store, vec![entry("e1"), entry("e2")], "T1");
        let (added, updated) = upsert_entries(&mut store, vec![entry("e1"), entry("e2")], "T2");
        assert_eq!((added, updated), (0, 2));
        assert_eq!(store.len(), 2);
    }

    #[test]
    fn upsert_mappings_replaces_by_project_id_keeping_created_at() {
        let mut store = Vec::new();
        upsert_mappings(&mut store, vec![mapping("proj-1", "task-1")], "T1");
        assert_eq!(store[0].created_at, "T1");

        let saved = upsert_mappings(&mut store, vec![mapping("proj-1", "task-2")], "T2");
        assert_eq!(saved, 1);
        assert_eq!(store.len(), 1);
        assert_eq!(store[0].task_id, "task-2");
        assert_eq!(store[0].created_at, "T1");
        assert_eq!(store[0].updated_at, "T2");
    }

    // ---- validation --------------------------------------------------------

    #[test]
    fn validate_rejects_blocking_instances() {
        let sessions = vec![session_with("s1", "task-1", vec![])];
        let mut g = group("task-1", vec![], replacement("task-1", "2026-08-25", vec![]));
        g.blocking_instance_ids.push("instance_running".to_string());
        let err = validate_rewrite_group(&sessions, &g).unwrap_err();
        assert!(err.contains("stop it first"));
    }

    #[test]
    fn validate_rejects_running_or_paused_delete_target() {
        let mut running = finalized_instance("i1", "s1", 0, 60_000);
        running.is_running = true;
        running.duration = None;
        running.end_time = None;
        let sessions = vec![session_with("s1", "task-1", vec![running])];

        let g = group("task-1", vec!["i1"], replacement("task-1", "2026-08-25", vec![]));
        let err = validate_rewrite_group(&sessions, &g).unwrap_err();
        assert!(err.contains("stop it first"));
    }

    #[test]
    fn validate_rejects_delete_target_from_another_task() {
        let sessions = vec![session_with(
            "s_other",
            "task-OTHER",
            vec![finalized_instance("i1", "s_other", 0, 60_000)],
        )];
        let g = group("task-1", vec!["i1"], replacement("task-1", "2026-08-25", vec![]));
        let err = validate_rewrite_group(&sessions, &g).unwrap_err();
        assert!(err.contains("another task"));
    }

    #[test]
    fn validate_tolerates_already_deleted_ids() {
        let sessions = vec![session_with("s1", "task-1", vec![])];
        let g = group(
            "task-1",
            vec!["i_gone"],
            replacement("task-1", "2026-08-25", vec![repl_instance("r1", 100, 60_000)]),
        );
        assert!(validate_rewrite_group(&sessions, &g).is_ok());
    }

    #[test]
    fn validate_rejects_mismatched_or_active_or_unfinalized_replacement() {
        let sessions = vec![session_with("s1", "task-1", vec![])];

        let g = group("task-1", vec![], replacement("task-OTHER", "2026-08-25", vec![]));
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("does not match"));

        let mut active = replacement("task-1", "2026-08-25", vec![]);
        active.is_active = true;
        let g = group("task-1", vec![], active);
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("must not be active"));

        let mut unfinalized = repl_instance("r1", 100, 60_000);
        unfinalized.duration = None;
        let g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", vec![unfinalized]),
        );
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("not finalized"));
    }

    #[test]
    fn validate_rejects_duration_invariant_violation() {
        let sessions = vec![session_with("s1", "task-1", vec![])];
        let mut bad = repl_instance("r1", 100, 60_000);
        bad.duration = Some(61_000); // end - start says 60s
        let g = group("task-1", vec![], replacement("task-1", "2026-08-25", vec![bad]));
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("duration invariant"));
    }

    #[test]
    fn validate_rejects_oversized_replacement() {
        let sessions = vec![session_with("s1", "task-1", vec![])];
        let instances: Vec<TimerInstance> = (0..=MAX_TIMER_INSTANCES_PER_SESSION)
            .map(|n| repl_instance(&format!("r{}", n), (n as i64) * 1000, 1_000))
            .collect();
        let g = group("task-1", vec![], replacement("task-1", "2026-08-25", instances));
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("not supported"));
    }

    #[test]
    fn validate_rejects_id_collisions_except_deleted_ones() {
        let sessions = vec![session_with(
            "s1",
            "task-1",
            vec![finalized_instance("i1", "s1", 0, 60_000)],
        )];

        // Replacement instance reusing a live id → rejected.
        let mut clash = repl_instance("i1", 100, 60_000);
        clash.session_id = "session_repl".to_string();
        let g = group("task-1", vec![], replacement("task-1", "2026-08-25", vec![clash]));
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("already exists"));

        // Same id is fine when the colliding instance is being deleted.
        let mut reused = repl_instance("i1", 100, 60_000);
        reused.session_id = "session_repl".to_string();
        let g = group(
            "task-1",
            vec!["i1"],
            replacement("task-1", "2026-08-25", vec![reused]),
        );
        assert!(validate_rewrite_group(&sessions, &g).is_ok());

        // Replacement session id reusing a live session id → rejected.
        let mut repl = replacement("task-1", "2026-08-25", vec![]);
        repl.id = "s1".to_string();
        let g = group("task-1", vec![], repl);
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("session id already exists"));
    }

    // ---- application -------------------------------------------------------

    #[test]
    fn apply_deletes_bucket_and_drops_emptied_session() {
        let mut sessions = vec![
            session_with(
                "s1",
                "task-1",
                vec![
                    finalized_instance("i1", "s1", 0, 60_000),
                    finalized_instance("i2", "s1", 100_000, 30_000),
                ],
            ),
            session_with("s_other", "task-2", vec![finalized_instance("j1", "s_other", 0, 5_000)]),
        ];

        let applied = apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i1", "i2"],
                replacement("task-1", "2026-08-25", vec![repl_instance("r1", 200, 90_000)]),
            ),
            ts(1_000_000),
        );

        assert_eq!(applied.deleted_instances, 2);
        // s1 emptied and dropped; other task untouched; replacement added.
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().all(|s| s.id != "s1"));
        let repl = sessions.iter().find(|s| s.id == "session_repl").unwrap();
        assert_eq!(repl.total_duration, 90_000);
        assert_eq!(repl.source.as_deref(), Some(WORKLOG_IMPORT_SOURCE));
        assert!(!repl.is_active);
        let other = sessions.iter().find(|s| s.id == "s_other").unwrap();
        assert_eq!(other.timer_instances.len(), 1);
    }

    #[test]
    fn apply_keeps_emptied_sessions_with_notes_or_active() {
        let mut noted = session_with("s_notes", "task-1", vec![finalized_instance("i1", "s_notes", 0, 60_000)]);
        noted.notes = Some("keep me".to_string());
        let mut active = session_with("s_active", "task-1", vec![finalized_instance("i2", "s_active", 0, 30_000)]);
        active.is_active = true;
        let mut sessions = vec![noted, active];

        apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i1", "i2"],
                replacement("task-1", "2026-08-25", vec![repl_instance("r1", 200, 90_000)]),
            ),
            ts(1_000_000),
        );

        let shell = sessions.iter().find(|s| s.id == "s_notes").unwrap();
        assert!(shell.timer_instances.is_empty());
        assert_eq!(shell.total_duration, 0);
        let active_shell = sessions.iter().find(|s| s.id == "s_active").unwrap();
        assert!(active_shell.timer_instances.is_empty());
        assert!(active_shell.is_active);
    }

    #[test]
    fn apply_recalculates_donor_sessions_that_keep_other_instances() {
        let mut sessions = vec![session_with(
            "s1",
            "task-1",
            vec![
                finalized_instance("i_day", "s1", 0, 60_000),
                finalized_instance("i_other_day", "s1", 200_000, 45_000),
            ],
        )];

        apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i_day"],
                replacement("task-1", "2026-08-25", vec![repl_instance("r1", 300, 90_000)]),
            ),
            ts(1_000_000),
        );

        let donor = sessions.iter().find(|s| s.id == "s1").unwrap();
        assert_eq!(donor.timer_instances.len(), 1);
        assert_eq!(donor.total_duration, 45_000);
    }

    #[test]
    fn apply_then_reapply_converges() {
        let mut sessions = vec![session_with(
            "s1",
            "task-1",
            vec![finalized_instance("i1", "s1", 0, 60_000)],
        )];

        let first = apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i1"],
                replacement("task-1", "2026-08-25", vec![repl_instance("r1", 200, 90_000)]),
            ),
            ts(1_000_000),
        );
        assert_eq!(first.deleted_instances, 1);

        // A second import rebuilds the same day: it deletes the first
        // replacement's instances and installs a fresh session.
        let mut second_repl = replacement("task-1", "2026-08-25", vec![repl_instance("r2", 200, 90_000)]);
        second_repl.id = "session_repl_2".to_string();
        for i in &mut second_repl.timer_instances {
            i.session_id = second_repl.id.clone();
        }
        let g = group("task-1", vec!["r1"], second_repl);
        assert!(validate_rewrite_group(&sessions, &g).is_ok());
        let second = apply_rewrite_group(&mut sessions, g, ts(2_000_000));

        assert_eq!(second.deleted_instances, 1);
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "session_repl_2");
        assert_eq!(sessions[0].total_duration, 90_000);
    }
}
