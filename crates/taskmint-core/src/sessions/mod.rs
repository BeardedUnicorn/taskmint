//! What the session commands do to the sessions, as pure functions over
//! `&mut [TaskSession]`; the hosts lock, save and announce around them.
//!
//! - `instances`: commands on one timer instance.
//! - `lifecycle`: commands on whole sessions (edit, activate, move).
//! - `undo`: deleting a session, and putting a deleted session or timer back.
//! - `start`: starting work (app and tray) and the tray's timer actions.
//! - `manual`: "Add time".
//! - `task_links`: the task name and rate sessions copy.

pub mod instances;
pub mod lifecycle;
pub mod manual;
pub mod start;
pub mod task_links;
pub mod undo;

#[cfg(test)]
mod tests;
