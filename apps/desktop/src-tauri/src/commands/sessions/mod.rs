//! Session command handlers. The rules live in `taskmint_core::sessions`;
//! these lock the sessions, run them, save, and announce the change.
//!
//! - `instances`: commands on one timer instance.
//! - `lifecycle`: commands on whole sessions (edit, activate, move).
//! - `undo`: deleting a session, and putting a deleted session or timer back.
//! - `start`: starting work (app and tray) and the tray's timer actions.
//! - `manual`: "Add time".

pub mod instances;
pub mod lifecycle;
pub mod manual;
pub mod start;
pub mod undo;

use crate::state::AppState;
use crate::storage;
use taskmint_core::model::TaskSession;
use tauri::AppHandle;

// The paths the rest of the backend uses.
pub use start::{start_task_now, tray_pause_timer, tray_stop_timer};

/// A task's current hourly rate from the mirrored task list (None when the
/// task has no rate, or isn't mirrored yet).
pub(super) fn current_task_rate(app_state: &AppState, task_id: &str) -> Option<f64> {
    app_state
        .with_tasks(|tasks| taskmint_core::sessions::task_links::task_rate(tasks, task_id))
        .ok()
        .flatten()
}

/// Run `change` on the sessions under their lock, then save them; an error
/// from `change` saves nothing.
pub(super) fn change_and_save<R>(
    app: &AppHandle,
    app_state: &AppState,
    change: impl FnOnce(&mut Vec<TaskSession>) -> Result<R, String>,
) -> Result<R, String> {
    app_state.with_task_sessions_mut(|sessions| {
        let result = change(sessions)?;
        storage::save_sessions(app, sessions)?;
        Ok(result)
    })?
}
