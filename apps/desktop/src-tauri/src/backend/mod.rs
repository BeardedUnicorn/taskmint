//! Where the data lives: JSON files in the app data folder, run through
//! taskmint-core's commands (`LocalBackend`). The shell calls them by name.

pub mod local;

pub use local::{Clock, LocalBackend, Publish, Published};
