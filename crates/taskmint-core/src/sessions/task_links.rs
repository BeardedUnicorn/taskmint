//! What sessions and their timers copy from their tasks: the name and the
//! hourly rate.

use crate::contract::WORKLOG_IMPORT_SOURCE;
use crate::model::{Task, TaskSession, WorkLogEntry};
use std::collections::HashMap;

/// Brings one copy of a task's name up to date; returns whether it changed.
fn sync_name(tasks: &[Task], task_id: &str, name: &mut String) -> bool {
    match tasks.iter().find(|t| t.id == task_id) {
        Some(task) if *name != task.name => {
            name.clone_from(&task.name);
            true
        }
        _ => false,
    }
}

/// Sessions and timers keep a copy of their task's name; bring every copy up
/// to date after a task is renamed. Returns whether any session changed.
pub fn sync_session_task_names(sessions: &mut [TaskSession], tasks: &[Task]) -> bool {
    let mut changed = false;
    for session in sessions.iter_mut() {
        changed |= sync_name(tasks, &session.task_id, &mut session.task_name);
        for task in session
            .timer_instances
            .iter_mut()
            .filter_map(|i| i.task.as_mut())
        {
            changed |= sync_name(tasks, &task.task_id, &mut task.task_name);
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

/// Fills one missing rate from its task; returns whether it changed.
fn fill_rate(tasks: &[Task], task_id: &str, rate: &mut Option<f64>) -> bool {
    if rate.is_some() {
        return false;
    }
    *rate = task_rate(tasks, task_id);
    rate.is_some()
}

/// Give sessions and timers without a rate their task's current rate (when it
/// has one). They keep the rate they were given, so this only reaches sessions
/// from older builds and time tracked before the task had a rate. Returns
/// whether anything changed.
pub fn fill_missing_session_rates(sessions: &mut [TaskSession], tasks: &[Task]) -> bool {
    let mut changed = false;
    for session in sessions.iter_mut() {
        changed |= fill_rate(tasks, &session.task_id, &mut session.hourly_rate);
        for task in session
            .timer_instances
            .iter_mut()
            .filter_map(|i| i.task.as_mut())
        {
            changed |= fill_rate(tasks, &task.task_id, &mut task.hourly_rate);
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
