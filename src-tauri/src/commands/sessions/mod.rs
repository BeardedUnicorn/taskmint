//! Session command handlers and the timer logic behind them.
//!
//! - `timer`: the pure timer state machine (start, pause, resume, finalize).
//! - `instances`: commands on one timer instance.
//! - `lifecycle`: commands on whole sessions (edit, delete, activate, move).
//! - `start`: starting work (app and tray) and the tray's timer actions.
//! - `manual`: "Add time".
//! - `task_links`: the task name and rate sessions copy.

pub mod instances;
pub mod lifecycle;
pub mod manual;
pub mod start;
pub mod task_links;
pub mod timer;

#[cfg(test)]
mod tests;

// The paths the rest of the backend uses.
pub use start::{live_timer, start_task_now, tray_pause_timer, tray_stop_timer, LiveTimer};
pub use task_links::{
    fill_imported_session_rates, fill_missing_session_rates, sync_session_task_names,
};
pub use timer::finalize_stranded_instances;
pub(crate) use timer::{
    keep_idle_time, pause_instance_at, recalculate_total_duration, resume_instance,
    stop_active_instances, MAX_TIMER_INSTANCES_PER_SESSION,
};
