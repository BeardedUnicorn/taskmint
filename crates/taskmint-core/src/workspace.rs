//! One user's data, as the commands see it, and the parts it's stored in.
//! A host loads the parts a command needs, runs it, and saves the parts it
//! changed (see `command::Executed`).

use crate::contract::APP_RECORD_KEYS;
use crate::model::{PendingCapture, ProjectTaskMapping, Task, TaskSession, WorkLogEntry};
use crate::records::{tasks_from_records, RecordMap, RecordRevisions};
use crate::sessions::task_links::{
    fill_imported_session_rates, fill_missing_session_rates, sync_session_task_names,
};
use crate::worklogs::sync_work_log_task_names;
use std::ops::{BitOr, BitOrAssign};

/// A set of a workspace's parts: what a command reads, or what it changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Parts(u8);

impl Parts {
    pub const NONE: Parts = Parts(0);
    pub const SESSIONS: Parts = Parts(1);
    /// The imported ledger and the project mappings.
    pub const WORK_LOGS: Parts = Parts(1 << 1);
    pub const RECORDS: Parts = Parts(1 << 2);
    /// The capture waiting for the frontend.
    pub const CAPTURE: Parts = Parts(1 << 3);
    pub const ALL: Parts = Parts(0b1111);

    pub fn contains(self, other: Parts) -> bool {
        self.0 & other.0 == other.0
    }

    pub fn intersects(self, other: Parts) -> bool {
        self.0 & other.0 != 0
    }

    pub fn is_empty(self) -> bool {
        self.0 == 0
    }
}

impl BitOr for Parts {
    type Output = Parts;

    fn bitor(self, other: Parts) -> Parts {
        Parts(self.0 | other.0)
    }
}

impl BitOrAssign for Parts {
    fn bitor_assign(&mut self, other: Parts) {
        self.0 |= other.0;
    }
}

/// What the host found when it loaded the data, for the user to see. Never
/// saved; a reset clears it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LoadNotes {
    /// Sessions that couldn't be read (get_session_load_warning).
    pub session_warning: Option<String>,
    /// Work-log records that couldn't be read (get_work_logs).
    pub work_log_warning: Option<String>,
    /// The records couldn't be read at all. The record commands fail with
    /// this until a reset, so nothing saves over the unreadable data.
    pub records_error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Workspace {
    pub sessions: Vec<TaskSession>,
    pub work_log_entries: Vec<WorkLogEntry>,
    pub work_log_mappings: Vec<ProjectTaskMapping>,
    pub records: RecordMap,
    /// Revisions of the records saved since they were loaded or created: the
    /// server stores them, the desktop counts afresh at each launch (a
    /// relaunched app reads every record again).
    pub record_revisions: RecordRevisions,
    /// The latest capture from the browser extension, until the frontend
    /// takes it.
    pub pending_capture: Option<PendingCapture>,
    pub notes: LoadNotes,
}

/// What following the task list changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaskLinks {
    pub dirty: Parts,
    /// A session's task name followed a rename, so the frontend reloads them.
    pub renamed: bool,
}

impl Workspace {
    /// Every record key's revision.
    pub fn revisions(&self) -> RecordRevisions {
        APP_RECORD_KEYS
            .iter()
            .map(|key| (key.to_string(), self.revision(key)))
            .collect()
    }

    pub fn revision(&self, key: &str) -> u64 {
        self.record_revisions.get(key).copied().unwrap_or(0)
    }

    /// Counts a save of the record `key`; returns its new revision.
    pub fn bump_revision(&mut self, key: &str) -> u64 {
        let revision = self.revision(key) + 1;
        self.record_revisions.insert(key.to_string(), revision);
        revision
    }

    /// The task list, from the tasks record.
    pub fn tasks(&self) -> Vec<Task> {
        tasks_from_records(&self.records)
    }

    /// Brings sessions and the ledger in line with the task list. Sessions
    /// without an hourly rate (from older builds, or tracked before the task
    /// had one) get one: imported days the rate the site's pay implies,
    /// others the task's current rate. A session keeps the rate it was
    /// given, so later rate changes never rewrite past earnings. Sessions,
    /// ledger entries and mappings keep a copy of their task's name, which
    /// follows a rename.
    pub fn sync_task_links(&mut self) -> TaskLinks {
        let tasks = self.tasks();
        let imported = fill_imported_session_rates(&mut self.sessions, &self.work_log_entries);
        let rates = fill_missing_session_rates(&mut self.sessions, &tasks) || imported;
        let renamed = sync_session_task_names(&mut self.sessions, &tasks);
        let ledger = sync_work_log_task_names(
            &mut self.work_log_entries,
            &mut self.work_log_mappings,
            &tasks,
        );
        if rates {
            log::info!("Filled in hourly rates on sessions that had none");
        }
        let mut dirty = Parts::NONE;
        if rates || renamed {
            dirty |= Parts::SESSIONS;
        }
        if ledger {
            dirty |= Parts::WORK_LOGS;
        }
        TaskLinks { dirty, renamed }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::TASKS_RECORD_KEY;
    use serde_json::json;

    #[test]
    fn parts_combine_and_compare_as_sets() {
        let both = Parts::SESSIONS | Parts::RECORDS;
        assert!(both.contains(Parts::SESSIONS));
        assert!(!both.contains(Parts::SESSIONS | Parts::WORK_LOGS));
        assert!(both.intersects(Parts::SESSIONS | Parts::WORK_LOGS));
        assert!(!both.intersects(Parts::CAPTURE));
        assert!(Parts::NONE.is_empty());
        assert!(!both.is_empty());

        let mut all = Parts::NONE;
        for part in [
            Parts::SESSIONS,
            Parts::WORK_LOGS,
            Parts::RECORDS,
            Parts::CAPTURE,
        ] {
            all |= part;
        }
        assert_eq!(all, Parts::ALL);
        assert_eq!(Parts::default(), Parts::NONE);
    }

    fn session(task_id: &str, task_name: &str, rate: Option<f64>) -> TaskSession {
        serde_json::from_value(json!({
            "id": format!("session_{}", task_id),
            "taskId": task_id,
            "taskName": task_name,
            "notes": null,
            "hourlyRate": rate,
        }))
        .unwrap()
    }

    fn with_tasks(tasks: serde_json::Value) -> Workspace {
        let mut workspace = Workspace::default();
        workspace.records.insert(TASKS_RECORD_KEY.into(), tasks);
        workspace
    }

    fn task(id: &str, name: &str, rate: f64) -> serde_json::Value {
        json!({
            "id": id,
            "name": name,
            "hourlyRate": rate,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        })
    }

    #[test]
    fn following_the_tasks_fills_rates_and_names() {
        let mut workspace = with_tasks(json!([task("a", "Renamed", 50.0)]));
        workspace.sessions = vec![session("a", "Old name", None)];
        workspace.work_log_mappings = vec![serde_json::from_value(json!({
            "projectId": "p", "taskId": "a", "taskName": "Old name"
        }))
        .unwrap()];

        let links = workspace.sync_task_links();

        assert_eq!(
            links,
            TaskLinks {
                dirty: Parts::SESSIONS | Parts::WORK_LOGS,
                renamed: true
            }
        );
        assert_eq!(workspace.sessions[0].task_name, "Renamed");
        assert_eq!(workspace.sessions[0].hourly_rate, Some(50.0));
        assert_eq!(workspace.work_log_mappings[0].task_name, "Renamed");

        // In line already: nothing to save
        let again = workspace.sync_task_links();
        assert_eq!(
            again,
            TaskLinks {
                dirty: Parts::NONE,
                renamed: false
            }
        );
    }

    #[test]
    fn a_rate_alone_changes_the_sessions_without_a_rename() {
        let mut workspace = with_tasks(json!([task("a", "Same", 50.0)]));
        workspace.sessions = vec![session("a", "Same", None)];
        assert_eq!(
            workspace.sync_task_links(),
            TaskLinks {
                dirty: Parts::SESSIONS,
                renamed: false
            }
        );
    }
}
