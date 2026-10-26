//! What sessions copy from their task: its name and its hourly rate.

use crate::contract::WORKLOG_IMPORT_SOURCE;
use crate::model::{Task, TaskSession, WorkLogEntry};
use std::collections::HashMap;

/// Sessions keep a copy of their task's name; bring every copy up to date
/// after a task is renamed. Returns whether any session changed.
pub fn sync_session_task_names(sessions: &mut [TaskSession], tasks: &[Task]) -> bool {
    let mut changed = false;
    for session in sessions.iter_mut() {
        if let Some(task) = tasks.iter().find(|t| t.id == session.task_id) {
            if session.task_name != task.name {
                session.task_name = task.name.clone();
                changed = true;
            }
        }
    }
    changed
}

/// A task's current hourly rate (None when the task has no rate, or isn't
/// known yet; fill_missing_session_rates catches the session up later).
pub fn task_rate(tasks: &[Task], task_id: &str) -> Option<f64> {
    tasks
        .iter()
        .find(|t| t.id == task_id)
        .and_then(|t| t.hourly_rate)
        .filter(|rate| *rate > 0.0)
}

/// Give sessions without a rate their task's current rate (when it has one).
/// Sessions keep the rate they were given, so this only reaches sessions from
/// older builds and time tracked before the task had a rate. Returns whether
/// anything changed.
pub fn fill_missing_session_rates(sessions: &mut [TaskSession], tasks: &[Task]) -> bool {
    let mut changed = false;
    for session in sessions.iter_mut().filter(|s| s.hourly_rate.is_none()) {
        let rate = task_rate(tasks, &session.task_id);
        if rate.is_some() {
            session.hourly_rate = rate;
            changed = true;
        }
    }
    changed
}

/// Imported sessions saved before rates were captured: give them the rate the
/// site's pay implies, from their timers' ledger entries (matched by
/// external_id), so rate × time reproduces the imported amount. Runs before
/// fill_missing_session_rates, which would otherwise give them the task's
/// rate. Returns whether anything changed.
pub fn fill_imported_session_rates(sessions: &mut [TaskSession], entries: &[WorkLogEntry]) -> bool {
    let cents_by_entry: HashMap<&str, i64> = entries
        .iter()
        .map(|entry| (entry.id.as_str(), entry.amount_cents))
        .collect();
    let mut changed = false;
    for session in sessions
        .iter_mut()
        .filter(|s| s.hourly_rate.is_none() && s.source.as_deref() == Some(WORKLOG_IMPORT_SOURCE))
    {
        let (mut cents, mut ms) = (0_i64, 0_u64);
        for instance in &session.timer_instances {
            let (Some(entry_id), Some(duration)) = (&instance.external_id, instance.duration)
            else {
                continue;
            };
            if let Some(entry_cents) = cents_by_entry.get(entry_id.as_str()) {
                cents += entry_cents;
                ms += duration;
            }
        }
        if cents > 0 && ms > 0 {
            session.hourly_rate = Some(cents as f64 / 100.0 / (ms as f64 / 3_600_000.0));
            changed = true;
        }
    }
    changed
}
