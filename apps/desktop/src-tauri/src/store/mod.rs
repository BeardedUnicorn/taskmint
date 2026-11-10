//! The data files in the app data folder. Each is one JSON object, in the
//! shape tauri-plugin-store wrote before P5 (see json_file.rs).

pub mod json_file;

pub use json_file::JsonFileStore;

/// Sessions: `{ "sessions": [...] }`.
pub const SESSIONS_FILE: &str = "sessions.json";
/// The imported work-log ledger: `{ "entries": [...], "mappings": [...] }`.
pub const WORK_LOGS_FILE: &str = "worklogs.json";
/// The frontend's records (tasks, notes, note templates, the daily goal and
/// its history), one key each.
pub const RECORDS_FILE: &str = "appdata.json";

/// Cloud sync's state: the account, and each document as it last agreed
/// with the cloud (taskmint_core::sync::SyncState). Never copied aside: a
/// lost one only means joining the cloud's data again.
pub const SYNC_FILE: &str = "sync.json";

/// Every data file, so their safety copies can be found.
pub const DATA_FILES: [&str; 3] = [SESSIONS_FILE, WORK_LOGS_FILE, RECORDS_FILE];
