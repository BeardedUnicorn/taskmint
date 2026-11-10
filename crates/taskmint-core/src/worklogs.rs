//! Work-log reconciliation: the imported ledger, and the destructive per-day
//! session rewrite it drives.
//!
//! Day bucketing lives in the frontend only
//! (packages/client/src/utils/workLogImport.ts): the frontend derives each
//! entry's workDay, decides which timer instances fall in a (task, day)
//! bucket, and sends fully built replacement sessions. This module
//! re-validates every group against current state and applies it, so a stale
//! or malicious payload cannot corrupt the session invariants.

use crate::contract::{MAX_TIMER_INSTANCES_PER_SESSION, WORKLOG_IMPORT_SOURCE};
use crate::model::{ProjectTaskMapping, Task, TaskSession, TimerInstance, WorkLogEntry};
use crate::timer::recalculate_total_duration;
use crate::workspace::Workspace;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// apply_work_log_import's payload: ledger rows and mappings to upsert, and
/// the per-day rewrites they drive.
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportPayload {
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<Vec<WorkLogEntry>>", optional))]
    pub entries: Vec<WorkLogEntry>,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<Vec<ProjectTaskMapping>>", optional))]
    pub mappings: Vec<ProjectTaskMapping>,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<Vec<RewriteGroup>>", optional))]
    pub rewrite_groups: Vec<RewriteGroup>,
    /// A project moved to another task: the entries are re-pointed, not new
    /// from the site, so they keep their `updated_at` (Payouts' "Last import").
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<bool>", optional))]
    pub is_remap: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportSummary {
    pub entries_added: usize,
    pub entries_updated: usize,
    pub mappings_saved: usize,
    pub groups_applied: Vec<AppliedGroup>,
    pub groups_skipped: Vec<SkippedGroup>,
    /// What undo_work_log_import takes to put things back as they were.
    pub undo: WorkLogImportUndo,
}

/// What an import changed, for undo_work_log_import: the sessions, ledger
/// entries and project mappings it changed, added or removed, as they were
/// before it and as it left them. Undo checks the "after" copies are still
/// what's stored, so it never puts back days that changed since.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportUndo {
    /// Changed or removed by the import, as they were.
    pub sessions_before: Vec<TaskSession>,
    /// Changed or added by the import, as it left them.
    pub sessions_after: Vec<TaskSession>,
    pub entries_before: Vec<WorkLogEntry>,
    pub entries_after: Vec<WorkLogEntry>,
    pub mappings_before: Vec<ProjectTaskMapping>,
    pub mappings_after: Vec<ProjectTaskMapping>,
}

/// Why an undo was refused: what it would put back has changed since.
pub const ERR_IMPORT_CHANGED_SINCE: &str =
    "This import can't be undone: some of the days it changed have changed since.";

fn session_key(session: &TaskSession) -> &str {
    &session.id
}

fn entry_key(entry: &WorkLogEntry) -> &str {
    &entry.id
}

fn mapping_key(mapping: &ProjectTaskMapping) -> &str {
    &mapping.project_id
}

/// The records that differ between `before` and `after`, by key: their
/// versions in `before` (changed or removed) and in `after` (changed or
/// added).
fn differences<T: Clone + PartialEq>(
    before: &[T],
    after: &[T],
    key: fn(&T) -> &str,
) -> (Vec<T>, Vec<T>) {
    let old: HashMap<&str, &T> = before.iter().map(|r| (key(r), r)).collect();
    let new: HashMap<&str, &T> = after.iter().map(|r| (key(r), r)).collect();
    let was = before
        .iter()
        .filter(|r| new.get(key(r)) != Some(r))
        .cloned()
        .collect();
    let now = after
        .iter()
        .filter(|r| old.get(key(r)) != Some(r))
        .cloned()
        .collect();
    (was, now)
}

/// Whether `store` still holds what an import left: each of `after`'s
/// records as it is there, and none of the ones it removed (in `before`
/// only).
fn unchanged_since<T: PartialEq>(
    store: &[T],
    before: &[T],
    after: &[T],
    key: fn(&T) -> &str,
) -> bool {
    let current: HashMap<&str, &T> = store.iter().map(|r| (key(r), r)).collect();
    let left: HashSet<&str> = after.iter().map(key).collect();
    after.iter().all(|r| current.get(key(r)) == Some(&r))
        && before
            .iter()
            .filter(|r| !left.contains(key(r)))
            .all(|r| !current.contains_key(key(r)))
}

/// Puts `before` back in place of `after` in `store`: a record the import
/// changed goes back to how it was, one it added goes, and one it removed
/// comes back at the end.
fn put_back<T>(store: &mut Vec<T>, before: Vec<T>, after: &[T], key: fn(&T) -> &str) {
    let changed: HashSet<String> = after.iter().map(|r| key(r).to_string()).collect();
    let order: Vec<String> = before.iter().map(|r| key(r).to_string()).collect();
    let mut earlier: HashMap<String, T> = before
        .into_iter()
        .map(|r| (key(&r).to_string(), r))
        .collect();
    let mut restored = Vec::with_capacity(store.len());
    for record in std::mem::take(store) {
        if !changed.contains(key(&record)) {
            restored.push(record);
        } else if let Some(previous) = earlier.remove(key(&record)) {
            restored.push(previous);
        }
    }
    restored.extend(order.iter().filter_map(|k| earlier.remove(k)));
    *store = restored;
}

impl WorkLogImportUndo {
    /// What an import changed: `before` is the data as it was, `after` as the
    /// import left it.
    pub fn between(before: &Workspace, after: &Workspace) -> Self {
        let (sessions_before, sessions_after) =
            differences(&before.sessions, &after.sessions, session_key);
        let (entries_before, entries_after) =
            differences(&before.work_log_entries, &after.work_log_entries, entry_key);
        let (mappings_before, mappings_after) = differences(
            &before.work_log_mappings,
            &after.work_log_mappings,
            mapping_key,
        );
        Self {
            sessions_before,
            sessions_after,
            entries_before,
            entries_after,
            mappings_before,
            mappings_after,
        }
    }

    /// Whether the timers it would put back clash with another session's.
    fn timers_clash(&self, sessions: &[TaskSession]) -> bool {
        let touched: HashSet<&str> = self
            .sessions_before
            .iter()
            .chain(&self.sessions_after)
            .map(session_key)
            .collect();
        let elsewhere: HashSet<&str> = sessions
            .iter()
            .filter(|s| !touched.contains(s.id.as_str()))
            .flat_map(|s| s.timer_instances.iter().map(|i| i.id.as_str()))
            .collect();
        self.sessions_before
            .iter()
            .flat_map(|s| &s.timer_instances)
            .any(|i| elsewhere.contains(i.id.as_str()))
    }
}

/// Undoes an import: the sessions, ledger entries and mappings it changed go
/// back to how they were. Refused, with nothing changed, when any of them
/// has changed since (a timer edited on one of its days, another import, a
/// project moved to another task).
pub fn undo_import(workspace: &mut Workspace, undo: WorkLogImportUndo) -> Result<(), String> {
    let unchanged = unchanged_since(
        &workspace.sessions,
        &undo.sessions_before,
        &undo.sessions_after,
        session_key,
    ) && unchanged_since(
        &workspace.work_log_entries,
        &undo.entries_before,
        &undo.entries_after,
        entry_key,
    ) && unchanged_since(
        &workspace.work_log_mappings,
        &undo.mappings_before,
        &undo.mappings_after,
        mapping_key,
    ) && !undo.timers_clash(&workspace.sessions);
    if !unchanged {
        return Err(ERR_IMPORT_CHANGED_SINCE.to_string());
    }
    put_back(
        &mut workspace.sessions,
        undo.sessions_before,
        &undo.sessions_after,
        session_key,
    );
    put_back(
        &mut workspace.work_log_entries,
        undo.entries_before,
        &undo.entries_after,
        entry_key,
    );
    put_back(
        &mut workspace.work_log_mappings,
        undo.mappings_before,
        &undo.mappings_after,
        mapping_key,
    );
    Ok(())
}

/// One (task, workDay) rewrite: delete the listed finalized instances and
/// insert the replacement session built from the ledger. A remap that leaves
/// a day with nothing left to import for this task sends no replacement: the
/// group only removes that day's imported time.
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct RewriteGroup {
    pub task_id: String,
    pub work_day: String,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<Vec<String>>", optional))]
    pub delete_instance_ids: Vec<String>,
    // Running/paused instances the frontend found in the bucket. Their
    // presence skips the group; the backend re-checks regardless.
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(as = "Option<Vec<String>>", optional))]
    pub blocking_instance_ids: Vec<String>,
    #[serde(default)]
    pub replacement_session: Option<TaskSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct AppliedGroup {
    pub task_id: String,
    pub work_day: String,
    pub deleted_instances: usize,
    /// The replacement session; None for a group that only removed time.
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SkippedGroup {
    pub task_id: String,
    pub work_day: String,
    pub reason: String,
}

/// The ledger and the mappings keep a copy of each mapped task's name; bring
/// them up to date after a task is renamed. Returns whether anything changed.
pub fn sync_work_log_task_names(
    entries: &mut [WorkLogEntry],
    mappings: &mut [ProjectTaskMapping],
    tasks: &[Task],
) -> bool {
    let mut changed = false;
    let name_of = |task_id: &str| tasks.iter().find(|t| t.id == task_id).map(|t| &t.name);
    for entry in entries.iter_mut() {
        if let Some(name) = name_of(&entry.task_id) {
            if &entry.task_name != name {
                entry.task_name = name.clone();
                changed = true;
            }
        }
    }
    for mapping in mappings.iter_mut() {
        if let Some(name) = name_of(&mapping.task_id) {
            if &mapping.task_name != name {
                mapping.task_name = name.clone();
                changed = true;
            }
        }
    }
    changed
}

/// Upsert ledger entries by id. An existing entry is replaced wholesale (the
/// site may revise minutes/amount/status) except `imported_at`, which keeps
/// its first-seen value, and `updated_at`, which moves only when something
/// else changed (so re-importing the same days changes nothing to sync).
/// Returns (added, updated).
pub fn upsert_entries(
    store: &mut Vec<WorkLogEntry>,
    incoming: Vec<WorkLogEntry>,
    now_iso: &str,
    keep_updated_at: bool,
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
                let unchanged = WorkLogEntry {
                    updated_at: existing.updated_at.clone(),
                    ..entry.clone()
                } == *existing;
                if unchanged || (keep_updated_at && !existing.updated_at.is_empty()) {
                    entry.updated_at = existing.updated_at.clone();
                }
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
/// existing mapping, and its `updated_at` when nothing else changed.
/// Returns the number of mappings written.
pub fn upsert_mappings(
    store: &mut Vec<ProjectTaskMapping>,
    incoming: Vec<ProjectTaskMapping>,
    now_iso: &str,
) -> usize {
    let mut saved = 0;
    for mut mapping in incoming {
        mapping.updated_at = now_iso.to_string();
        match store
            .iter_mut()
            .find(|m| m.project_id == mapping.project_id)
        {
            Some(existing) => {
                mapping.created_at = if existing.created_at.is_empty() {
                    now_iso.to_string()
                } else {
                    existing.created_at.clone()
                };
                let unchanged = ProjectTaskMapping {
                    updated_at: existing.updated_at.clone(),
                    ..mapping.clone()
                } == *existing;
                if unchanged {
                    mapping.updated_at = existing.updated_at.clone();
                }
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
) -> Option<(&'a TaskSession, &'a TimerInstance)> {
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
            if session.task_id_of(instance) != group.task_id {
                return Err(format!(
                    "instance {} belongs to another task and cannot be replaced by this import",
                    id
                ));
            }
        }
    }

    let Some(replacement) = &group.replacement_session else {
        // Removal only: the deletions were checked above.
        return Ok(());
    };
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

    let delete_set: HashSet<&str> = group
        .delete_instance_ids
        .iter()
        .map(String::as_str)
        .collect();
    if sessions.iter().any(|s| s.id == replacement.id) {
        return Err("replacement session id already exists".to_string());
    }
    for instance in &replacement.timer_instances {
        if instance.session_id != replacement.id {
            return Err(
                "replacement instance is not linked to the replacement session".to_string(),
            );
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

/// Apply a validated rewrite group: remove the bucket's instances (validation
/// checked they're all this task's, so another task's timers in the same
/// session stay), drop sessions this emptied (unless they carry user notes or
/// are active — those stay as shells), and insert the synthesized replacement.
pub fn apply_rewrite_group(
    sessions: &mut Vec<TaskSession>,
    group: RewriteGroup,
    now: DateTime<Utc>,
) -> AppliedGroup {
    let delete_set: HashSet<&str> = group
        .delete_instance_ids
        .iter()
        .map(String::as_str)
        .collect();

    let mut deleted = 0;
    let mut emptied_session_ids: Vec<String> = Vec::new();
    for session in sessions.iter_mut() {
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
                    .is_some_and(|n| !n.trim().is_empty());
                if !has_notes && !session.is_active {
                    emptied_session_ids.push(session.id.clone());
                }
            }
        }
    }
    sessions.retain(|s| !emptied_session_ids.contains(&s.id));

    let session_id = group.replacement_session.map(|mut replacement| {
        // The backend owns provenance and totals regardless of what was sent.
        replacement.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
        replacement.is_active = false;
        replacement.created_at = now.to_rfc3339();
        replacement.updated_at = now.to_rfc3339();
        recalculate_total_duration(&mut replacement);
        let id = replacement.id.clone();
        sessions.push(replacement);
        id
    });

    AppliedGroup {
        task_id: group.task_id,
        work_day: group.work_day,
        deleted_instances: deleted,
        session_id,
    }
}

/// Validate and apply each group in order. A group that fails validation is
/// skipped, with its reason, and the rest still run.
pub fn apply_rewrite_groups(
    sessions: &mut Vec<TaskSession>,
    groups: Vec<RewriteGroup>,
    now: DateTime<Utc>,
) -> (Vec<AppliedGroup>, Vec<SkippedGroup>) {
    let mut applied = Vec::new();
    let mut skipped = Vec::new();
    for group in groups {
        match validate_rewrite_group(sessions, &group) {
            Ok(()) => applied.push(apply_rewrite_group(sessions, group, now)),
            Err(reason) => skipped.push(SkippedGroup {
                task_id: group.task_id,
                work_day: group.work_day,
                reason,
            }),
        }
    }
    (applied, skipped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{TimerTask, WorkLogKind};
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
            task: None,
            notes: None,
            created_at: ts(start_secs).to_rfc3339(),
            updated_at: ts(start_secs).to_rfc3339(),
            running_on: None,
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
            hourly_rate: None,
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
            replacement_session: Some(replacement),
        }
    }

    // ---- upserts -----------------------------------------------------------

    #[test]
    fn upsert_entries_adds_then_updates_preserving_imported_at() {
        let mut store = Vec::new();
        let (added, updated) = upsert_entries(&mut store, vec![entry("e1")], "T1", false);
        assert_eq!((added, updated), (1, 0));
        assert_eq!(store[0].imported_at, "T1");
        assert_eq!(store[0].updated_at, "T1");

        let mut revised = entry("e1");
        revised.amount_cents = 9999;
        revised.status = "Approved".to_string();
        let (added, updated) = upsert_entries(&mut store, vec![revised], "T2", false);
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
        upsert_entries(&mut store, vec![entry("e1"), entry("e2")], "T1", false);
        let (added, updated) =
            upsert_entries(&mut store, vec![entry("e1"), entry("e2")], "T2", false);
        assert_eq!((added, updated), (0, 2));
        assert_eq!(store.len(), 2);
        // Nothing changed, so nothing new to sync
        assert_eq!(store[0].updated_at, "T1");
    }

    #[test]
    fn upsert_mappings_keeps_updated_at_when_nothing_changed() {
        let mut store = Vec::new();
        upsert_mappings(&mut store, vec![mapping("proj-1", "task-1")], "T1");
        assert_eq!(
            upsert_mappings(&mut store, vec![mapping("proj-1", "task-1")], "T2"),
            1
        );
        assert_eq!(store[0].updated_at, "T1");
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
        let mut g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", vec![]),
        );
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

        let g = group(
            "task-1",
            vec!["i1"],
            replacement("task-1", "2026-08-25", vec![]),
        );
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
        let g = group(
            "task-1",
            vec!["i1"],
            replacement("task-1", "2026-08-25", vec![]),
        );
        let err = validate_rewrite_group(&sessions, &g).unwrap_err();
        assert!(err.contains("another task"));
    }

    fn on_task(instance: TimerInstance, task_id: &str) -> TimerInstance {
        TimerInstance {
            task: Some(TimerTask {
                task_id: task_id.to_string(),
                task_name: "Other".to_string(),
                hourly_rate: None,
            }),
            ..instance
        }
    }

    #[test]
    fn validate_and_apply_go_by_each_timers_own_task() {
        let mut sessions = vec![session_with(
            "mixed",
            "task-1",
            vec![
                finalized_instance("mine", "mixed", 0, 60_000),
                on_task(
                    finalized_instance("theirs", "mixed", 60_000, 60_000),
                    "task-2",
                ),
            ],
        )];

        // A timer on another task in a session opened for this one
        let g = group(
            "task-1",
            vec!["theirs"],
            replacement("task-1", "2026-08-25", vec![]),
        );
        let err = validate_rewrite_group(&sessions, &g).unwrap_err();
        assert!(err.contains("another task"));

        // A task's import takes only its own timers out of the session
        let g = group(
            "task-2",
            vec!["theirs"],
            replacement("task-2", "2026-08-25", vec![]),
        );
        validate_rewrite_group(&sessions, &g).unwrap();
        let applied = apply_rewrite_group(&mut sessions, g, ts(0));
        assert_eq!(applied.deleted_instances, 1);
        let mixed = sessions.iter().find(|s| s.id == "mixed").unwrap();
        assert_eq!(mixed.timer_instances.len(), 1);
        assert_eq!(mixed.timer_instances[0].id, "mine");
        assert_eq!(mixed.total_duration, 60_000);
    }

    #[test]
    fn validate_tolerates_already_deleted_ids() {
        let sessions = vec![session_with("s1", "task-1", vec![])];
        let g = group(
            "task-1",
            vec!["i_gone"],
            replacement(
                "task-1",
                "2026-08-25",
                vec![repl_instance("r1", 100, 60_000)],
            ),
        );
        assert!(validate_rewrite_group(&sessions, &g).is_ok());
    }

    #[test]
    fn validate_rejects_mismatched_or_active_or_unfinalized_replacement() {
        let sessions = vec![session_with("s1", "task-1", vec![])];

        let g = group(
            "task-1",
            vec![],
            replacement("task-OTHER", "2026-08-25", vec![]),
        );
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
        let g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", vec![bad]),
        );
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
        let g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", instances),
        );
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
        let g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", vec![clash]),
        );
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
            session_with(
                "s_other",
                "task-2",
                vec![finalized_instance("j1", "s_other", 0, 5_000)],
            ),
        ];

        let applied = apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i1", "i2"],
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 200, 90_000)],
                ),
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
        let mut noted = session_with(
            "s_notes",
            "task-1",
            vec![finalized_instance("i1", "s_notes", 0, 60_000)],
        );
        noted.notes = Some("keep me".to_string());
        let mut active = session_with(
            "s_active",
            "task-1",
            vec![finalized_instance("i2", "s_active", 0, 30_000)],
        );
        active.is_active = true;
        let mut sessions = vec![noted, active];

        apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i1", "i2"],
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 200, 90_000)],
                ),
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
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 300, 90_000)],
                ),
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
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 200, 90_000)],
                ),
            ),
            ts(1_000_000),
        );
        assert_eq!(first.deleted_instances, 1);

        // A second import rebuilds the same day: it deletes the first
        // replacement's instances and installs a fresh session.
        let mut second_repl = replacement(
            "task-1",
            "2026-08-25",
            vec![repl_instance("r2", 200, 90_000)],
        );
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
    #[test]
    fn a_rename_reaches_ledger_entries_and_mappings() {
        let task = Task {
            id: "task-1".to_string(),
            name: "Renamed".to_string(),
            hourly_rate: None,
            default_note_template_id: None,
            is_archived: false,
            is_favorite: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let mut entries = vec![entry("e1")];
        let mut other = entry("e2");
        other.task_id = "task-2".to_string();
        entries.push(other);
        let mut mappings = vec![mapping("proj-1", "task-1")];

        assert!(sync_work_log_task_names(
            &mut entries,
            &mut mappings,
            std::slice::from_ref(&task)
        ));
        assert_eq!(entries[0].task_name, "Renamed");
        assert_eq!(entries[1].task_name, "Raccoon - SWE");
        assert_eq!(mappings[0].task_name, "Renamed");
        assert!(!sync_work_log_task_names(
            &mut entries,
            &mut mappings,
            &[task]
        ));
    }
    #[test]
    fn a_removal_only_group_validates_and_drops_the_imported_day() {
        let mut imported = session_with(
            "imp",
            "task-1",
            vec![finalized_instance("i1", "imp", 0, 60_000)],
        );
        imported.source = Some(WORKLOG_IMPORT_SOURCE.to_string());
        let mut sessions = vec![imported];
        let removal = RewriteGroup {
            task_id: "task-1".to_string(),
            work_day: "2026-08-25".to_string(),
            delete_instance_ids: vec!["i1".to_string()],
            blocking_instance_ids: Vec::new(),
            replacement_session: None,
        };

        assert!(validate_rewrite_group(&sessions, &removal).is_ok());
        let applied = apply_rewrite_group(&mut sessions, removal, ts(100));

        assert_eq!(applied.deleted_instances, 1);
        assert_eq!(applied.session_id, None);
        assert!(sessions.is_empty());
    }

    #[test]
    fn a_removal_only_group_still_refuses_another_tasks_time() {
        let sessions = vec![session_with(
            "other",
            "task-2",
            vec![finalized_instance("x", "other", 0, 60_000)],
        )];
        let removal = RewriteGroup {
            task_id: "task-1".to_string(),
            work_day: "2026-08-25".to_string(),
            delete_instance_ids: vec!["x".to_string()],
            blocking_instance_ids: Vec::new(),
            replacement_session: None,
        };
        assert!(validate_rewrite_group(&sessions, &removal).is_err());
    }

    #[test]
    fn a_remap_keeps_when_the_entries_were_last_imported() {
        let mut store = Vec::new();
        upsert_entries(&mut store, vec![entry("e1")], "T1", false);
        let mut moved = entry("e1");
        moved.task_id = "task-2".to_string();

        upsert_entries(&mut store, vec![moved], "T2", true);

        assert_eq!(store[0].task_id, "task-2");
        assert_eq!(store[0].updated_at, "T1");
        assert_eq!(store[0].imported_at, "T1");
    }

    #[test]
    fn upserts_fill_in_first_seen_stamps_that_older_records_lack() {
        let mut entries = vec![entry("e1")];
        upsert_entries(&mut entries, vec![entry("e1")], "T2", false);
        assert_eq!(entries[0].imported_at, "T2");

        let mut mappings = vec![mapping("proj-1", "task-1")];
        upsert_mappings(&mut mappings, vec![mapping("proj-1", "task-2")], "T2");
        assert_eq!(mappings[0].created_at, "T2");
        assert_eq!(mappings[0].task_id, "task-2");
    }

    #[test]
    fn a_rename_skips_mappings_whose_task_is_unknown() {
        let task = Task {
            id: "task-1".to_string(),
            name: "Renamed".to_string(),
            hourly_rate: None,
            default_note_template_id: None,
            is_archived: false,
            is_favorite: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let mut mappings = vec![mapping("proj-2", "task-gone")];

        assert!(!sync_work_log_task_names(&mut [], &mut mappings, &[task]));
        assert_eq!(mappings[0].task_name, "Raccoon - SWE");
    }

    #[test]
    fn validate_rejects_replacement_instances_that_are_unlinked_or_live() {
        let sessions = vec![session_with("s1", "task-1", vec![])];

        let mut unlinked = repl_instance("r1", 100, 60_000);
        unlinked.session_id = "elsewhere".to_string();
        let g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", vec![unlinked]),
        );
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("not linked"));

        let mut live = repl_instance("r1", 100, 60_000);
        live.is_running = true;
        let g = group(
            "task-1",
            vec![],
            replacement("task-1", "2026-08-25", vec![live]),
        );
        assert!(validate_rewrite_group(&sessions, &g)
            .unwrap_err()
            .contains("not finalized"));
    }

    #[test]
    fn apply_leaves_the_tasks_other_days_alone() {
        let mut sessions = vec![
            session_with(
                "day",
                "task-1",
                vec![finalized_instance("i1", "day", 0, 60_000)],
            ),
            session_with(
                "other-day",
                "task-1",
                vec![finalized_instance("i2", "other-day", 900_000, 30_000)],
            ),
        ];

        let applied = apply_rewrite_group(
            &mut sessions,
            group(
                "task-1",
                vec!["i1"],
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 200, 1_000)],
                ),
            ),
            ts(1_000_000),
        );

        assert_eq!(applied.deleted_instances, 1);
        let other = sessions.iter().find(|s| s.id == "other-day").unwrap();
        assert_eq!(other.timer_instances.len(), 1);
        assert_eq!(other.updated_at, ts(0).to_rfc3339());
    }

    #[test]
    fn groups_are_applied_in_order_and_invalid_ones_skipped() {
        let mut sessions = vec![session_with(
            "s1",
            "task-1",
            vec![finalized_instance("i1", "s1", 0, 60_000)],
        )];
        let mut blocked = group(
            "task-2",
            vec![],
            replacement("task-2", "2026-08-26", vec![]),
        );
        blocked.blocking_instance_ids.push("running".to_string());
        let groups = vec![
            group(
                "task-1",
                vec!["i1"],
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 200, 1_000)],
                ),
            ),
            blocked,
        ];

        let (applied, skipped) = apply_rewrite_groups(&mut sessions, groups, ts(1_000_000));

        assert_eq!(applied.len(), 1);
        assert_eq!(applied[0].session_id.as_deref(), Some("session_repl"));
        assert_eq!(skipped.len(), 1);
        assert_eq!(
            (skipped[0].task_id.as_str(), skipped[0].work_day.as_str()),
            ("task-2", "2026-08-26")
        );
        assert!(skipped[0].reason.contains("stop it first"));
        assert_eq!(sessions.len(), 1);
    }

    #[test]
    fn new_records_keep_first_seen_stamps_they_arrive_with() {
        let mut stamped = entry("e1");
        stamped.imported_at = "T0".to_string();
        let mut entries = Vec::new();
        upsert_entries(&mut entries, vec![stamped], "T1", false);
        assert_eq!(entries[0].imported_at, "T0");

        let mut stamped = mapping("proj-1", "task-1");
        stamped.created_at = "T0".to_string();
        let mut mappings = Vec::new();
        upsert_mappings(&mut mappings, vec![stamped], "T1");
        assert_eq!(mappings[0].created_at, "T0");
        assert_eq!(mappings[0].updated_at, "T1");
    }

    // ---- undo --------------------------------------------------------------

    /// A day's tracked time, its ledger and a mapping, then that day
    /// imported: the tracked timer replaced, an entry revised, one added,
    /// and the mapping moved.
    fn imported_day() -> (Workspace, Workspace) {
        let before = Workspace {
            sessions: vec![
                session_with(
                    "tracked",
                    "task-1",
                    vec![finalized_instance("t1", "tracked", 0, 60_000)],
                ),
                session_with(
                    "other_day",
                    "task-1",
                    vec![finalized_instance("o1", "other_day", 9_000, 1_000)],
                ),
            ],
            work_log_entries: vec![entry("kept"), entry("revised")],
            work_log_mappings: vec![mapping("proj-1", "task-1"), mapping("proj-2", "task-1")],
            ..Workspace::default()
        };

        let mut after = before.clone();
        apply_rewrite_groups(
            &mut after.sessions,
            vec![group(
                "task-1",
                vec!["t1"],
                replacement(
                    "task-1",
                    "2026-08-25",
                    vec![repl_instance("r1", 100, 30_000)],
                ),
            )],
            ts(500),
        );
        let mut revised = entry("revised");
        revised.amount_cents = 1;
        upsert_entries(
            &mut after.work_log_entries,
            vec![revised, entry("new")],
            "T1",
            false,
        );
        upsert_mappings(
            &mut after.work_log_mappings,
            vec![mapping("proj-2", "task-2")],
            "T1",
        );
        (before, after)
    }

    fn ids<T>(records: &[T], key: fn(&T) -> &str) -> Vec<String> {
        records.iter().map(|r| key(r).to_string()).collect()
    }

    #[test]
    fn an_import_records_only_what_it_changed() {
        let (before, after) = imported_day();
        let undo = WorkLogImportUndo::between(&before, &after);

        // The tracked session went, its replacement came
        assert_eq!(ids(&undo.sessions_before, session_key), ["tracked"]);
        assert_eq!(ids(&undo.sessions_after, session_key), ["session_repl"]);
        assert_eq!(ids(&undo.entries_before, entry_key), ["revised"]);
        assert_eq!(ids(&undo.entries_after, entry_key), ["revised", "new"]);
        assert_eq!(ids(&undo.mappings_before, mapping_key), ["proj-2"]);
        assert_eq!(ids(&undo.mappings_after, mapping_key), ["proj-2"]);
        // Nothing changed: nothing to put back
        assert_eq!(
            WorkLogImportUndo::between(&before, &before),
            WorkLogImportUndo::default()
        );
    }

    #[test]
    fn undoing_an_import_puts_everything_back_as_it_was() {
        let (before, mut after) = imported_day();
        let undo = WorkLogImportUndo::between(&before, &after);

        undo_import(&mut after, undo).unwrap();

        // The removed session comes back at the end
        assert_eq!(ids(&after.sessions, session_key), ["other_day", "tracked"]);
        assert_eq!(after.sessions[1], before.sessions[0]);
        assert_eq!(after.work_log_entries, before.work_log_entries);
        assert_eq!(after.work_log_mappings, before.work_log_mappings);
    }

    #[test]
    fn a_changed_session_goes_back_in_its_place() {
        let before = Workspace {
            sessions: vec![
                session_with(
                    "mixed",
                    "task-1",
                    vec![
                        finalized_instance("a", "mixed", 0, 1_000),
                        finalized_instance("b", "mixed", 10, 1_000),
                    ],
                ),
                session_with("last", "task-2", vec![]),
            ],
            ..Workspace::default()
        };
        let mut after = before.clone();
        after.sessions[0].timer_instances.remove(0);

        let undo = WorkLogImportUndo::between(&before, &after);
        undo_import(&mut after, undo).unwrap();

        assert_eq!(after.sessions, before.sessions);
    }

    #[test]
    fn an_import_whose_days_changed_since_cannot_be_undone() {
        let (before, after) = imported_day();
        let undo = WorkLogImportUndo::between(&before, &after);

        // A timer on the imported day was edited
        let mut edited = after.clone();
        edited.sessions[1].timer_instances[0].duration = Some(1);
        // The day was imported again
        let mut reimported = after.clone();
        reimported.work_log_entries[2].status = "Paid".to_string();
        // The project moved to another task
        let mut remapped = after.clone();
        remapped.work_log_mappings[1].task_id = "task-3".to_string();
        // Something with the id of a removed session is there now
        let mut returned = after.clone();
        returned.sessions.push(before.sessions[0].clone());
        // A timer the undo would put back is in another session now
        let mut moved = after.clone();
        moved.sessions[0]
            .timer_instances
            .push(finalized_instance("t1", "other_day", 0, 60_000));

        for changed in [edited, reimported, remapped, returned, moved] {
            let mut current = changed.clone();
            assert_eq!(
                undo_import(&mut current, undo.clone()).unwrap_err(),
                ERR_IMPORT_CHANGED_SINCE
            );
            assert_eq!(current, changed);
        }
    }
}
