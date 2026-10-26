//! Where the data lives. In local mode (the only mode until server mode
//! arrives) that's JSON files in the app data folder.

pub mod local;

pub use local::{Clock, LocalBackend, Publish, Published};
