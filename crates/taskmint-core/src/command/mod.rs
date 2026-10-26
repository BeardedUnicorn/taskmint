//! Commands: what a client asks of its data, by the names and camelCase
//! arguments the frontend sends, and what running one changed. A host owns
//! the rest: lock, load, `execute`, back up, save, then publish the events.

mod catalog;
mod execute;

pub use catalog::*;
pub use execute::execute;

use crate::records::RecordMap;
use crate::workspace::Parts;
use crate::zone::DayZone;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// What a command runs against besides the data: the time, and the zone
/// whose calendar days sessions are dated in.
#[derive(Debug, Clone, Copy)]
pub struct Ctx {
    pub now: DateTime<Utc>,
    pub zone: DayZone,
}

/// Why a command didn't run. Each message is what the client sees, word for
/// word (the frontend matches some; see contract).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    /// The rules refused it; nothing changed.
    Rejected(String),
    /// The arguments didn't fit the command.
    InvalidArgs(String),
    UnknownCommand(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Rejected(message) | CoreError::InvalidArgs(message) => f.write_str(message),
            CoreError::UnknownCommand(name) => write!(f, "Unknown command: {}", name),
        }
    }
}

impl std::error::Error for CoreError {}

impl From<String> for CoreError {
    fn from(message: String) -> Self {
        CoreError::Rejected(message)
    }
}

/// An event for the frontend, sent once the change is saved.
#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub name: &'static str,
    pub payload: Value,
}

impl Event {
    pub fn new(name: &'static str, payload: impl Serialize) -> Self {
        Self {
            name,
            payload: to_value(payload),
        }
    }

    /// A timer-instance event: `{ instanceId, <time_key>: at }`.
    pub fn instance(
        name: &'static str,
        instance_id: &str,
        time_key: &str,
        at: DateTime<Utc>,
    ) -> Self {
        let mut payload = serde_json::Map::new();
        payload.insert("instanceId".to_string(), instance_id.into());
        payload.insert(time_key.to_string(), at.to_rfc3339().into());
        Self {
            name,
            payload: Value::Object(payload),
        }
    }
}

/// A copy the host keeps before it saves, so a destructive change can be
/// undone by hand.
#[derive(Debug, Clone, PartialEq)]
pub enum Backup {
    /// These parts as they were last saved. `failure` starts the error (when
    /// `required`, the command is refused without one) or the logged warning.
    Saved {
        parts: Parts,
        failure: &'static str,
        required: bool,
    },
    /// Records coming in from elsewhere, as they arrived, before they're
    /// merged in. Always required.
    Incoming {
        records: RecordMap,
        failure: &'static str,
    },
}

/// What a command did, for the host to finish.
#[derive(Debug, Clone, PartialEq)]
pub struct Executed {
    pub reply: Value,
    /// The parts to save.
    pub dirty: Parts,
    /// Copies to keep before saving.
    pub backups: Vec<Backup>,
    /// For the frontend, once saved.
    pub events: Vec<Event>,
    /// Delete every safety copy once saved (Reset All Data), and report it
    /// in the reply's ResetSummary.
    pub purge_backups: bool,
}

impl Executed {
    fn new(reply: impl Serialize, dirty: Parts) -> Self {
        Self {
            reply: to_value(reply),
            dirty,
            backups: Vec::new(),
            events: Vec::new(),
            purge_backups: false,
        }
    }

    /// A reply with nothing to save.
    fn read(reply: impl Serialize) -> Self {
        Self::new(reply, Parts::NONE)
    }
}

/// get_app_records' and import_app_records' reply: every record stored.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct AppRecords {
    pub records: RecordMap,
}

/// get_work_logs' reply.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct WorkLogs {
    pub entries: Vec<crate::model::WorkLogEntry>,
    pub mappings: Vec<crate::model::ProjectTaskMapping>,
    /// Records the host couldn't read when it loaded them.
    pub load_warning: Option<String>,
}

/// reset_all_app_data's reply. Core leaves the count at 0; the host fills it
/// in once it has deleted its safety copies.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct ResetSummary {
    pub backups_deleted: usize,
    /// Set when the data was reset but deleting the copies failed.
    pub warning: Option<String>,
}

/// Replies and payloads are plain data, so turning one into JSON can't fail.
fn to_value(value: impl Serialize) -> Value {
    serde_json::to_value(value).expect("replies and payloads are plain data")
}

#[cfg(test)]
mod tests;
