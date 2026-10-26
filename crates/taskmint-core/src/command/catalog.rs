//! Every command, by its wire name, with its arguments. The names and the
//! camelCase argument keys are what the frontend has always sent to the
//! desktop app; the server takes the same ones.

use super::CoreError;
use crate::model::{CaptureSource, TaskSession, TimerInstance};
use crate::records::RecordMap;
use crate::restore::RestorePayload;
use crate::sessions::instances::TimerInstanceUpdates;
use crate::worklogs::WorkLogImportPayload;
use crate::workspace::Parts;
use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(tag = "command", content = "args", rename_all = "snake_case")]
pub enum Command {
    // The frontend's records (tasks, notes, templates, the goal)
    GetAppRecords(NoArgs),
    SetAppRecord(SetAppRecordArgs),
    ImportAppRecords(ImportAppRecordsArgs),
    // Sessions
    GetSessions(NoArgs),
    GetSessionLoadWarning(NoArgs),
    StartTask(StartTaskArgs),
    AddManualTime(AddManualTimeArgs),
    SetActiveSession(SetActiveSessionArgs),
    ClearSessionNotes(ClearSessionNotesArgs),
    DeleteSession(SessionArgs),
    RestoreSession(RestoreSessionArgs),
    RestoreTimerInstance(RestoreTimerInstanceArgs),
    // Timer instances
    CreateTimerInstance(SessionArgs),
    UpdateTimerInstance(UpdateTimerInstanceArgs),
    StartTimerInstance(InstanceArgs),
    StopTimerInstance(InstanceArgs),
    PauseTimerInstance(InstanceArgs),
    ResumeTimerInstance(InstanceArgs),
    DeleteTimerInstance(InstanceArgs),
    MoveTimerInstance(MoveTimerInstanceArgs),
    // The live timer, for the tray and the idle monitor
    StopLiveTimer(NoArgs),
    PauseLiveTimer(NoArgs),
    PauseTimerAt(PauseTimerAtArgs),
    ApplyIdleChoice(ApplyIdleChoiceArgs),
    // Work logs and browser captures
    GetWorkLogs(NoArgs),
    ApplyWorkLogImport(ApplyWorkLogImportArgs),
    AcceptCapture(AcceptCaptureArgs),
    TakePendingWorkLogCapture(NoArgs),
    // Everything at once
    RestoreBackupData(RestoreBackupDataArgs),
    ResetAllAppData(NoArgs),
}

/// Every command's name, as `Command` spells them. A name missing here
/// can't be called (every one runs in the conformance scenarios).
pub const COMMAND_NAMES: [&str; 30] = [
    "get_app_records",
    "set_app_record",
    "import_app_records",
    "get_sessions",
    "get_session_load_warning",
    "start_task",
    "add_manual_time",
    "set_active_session",
    "clear_session_notes",
    "delete_session",
    "restore_session",
    "restore_timer_instance",
    "create_timer_instance",
    "update_timer_instance",
    "start_timer_instance",
    "stop_timer_instance",
    "pause_timer_instance",
    "resume_timer_instance",
    "delete_timer_instance",
    "move_timer_instance",
    "stop_live_timer",
    "pause_live_timer",
    "pause_timer_at",
    "apply_idle_choice",
    "get_work_logs",
    "apply_work_log_import",
    "accept_capture",
    "take_pending_work_log_capture",
    "restore_backup_data",
    "reset_all_app_data",
];

/// For commands that take no arguments: `{}`, `null`, or nothing at all.
#[derive(Debug, Default, Deserialize)]
pub struct NoArgs {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAppRecordArgs {
    pub key: String,
    /// null removes the record.
    pub value: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAppRecordsArgs {
    pub records: RecordMap,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskArgs {
    pub task_id: String,
    pub task_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddManualTimeArgs {
    pub task_id: String,
    pub task_name: String,
    /// RFC 3339.
    pub start_time: String,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveSessionArgs {
    /// None deactivates every session.
    #[serde(default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearSessionNotesArgs {
    pub session_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionArgs {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSessionArgs {
    pub session: TaskSession,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreTimerInstanceArgs {
    pub session_id: String,
    pub instance: TimerInstance,
    /// Where it was in its session's list; the end when absent.
    #[serde(default)]
    pub index: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTimerInstanceArgs {
    pub instance_id: String,
    pub updates: TimerInstanceUpdates,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceArgs {
    pub instance_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveTimerInstanceArgs {
    pub instance_id: String,
    pub task_id: String,
    pub task_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PauseTimerAtArgs {
    pub instance_id: String,
    /// When input stopped; the pause starts here.
    pub idle_since: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyIdleChoiceArgs {
    pub instance_id: String,
    /// "discardResume", "keepResume" or "stayPaused".
    pub choice: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyWorkLogImportArgs {
    pub payload: WorkLogImportPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptCaptureArgs {
    /// The raw JSON text, as captured from the site.
    pub payload: String,
    pub source: CaptureSource,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupDataArgs {
    pub payload: RestorePayload,
}

/// What a command needs: the parts to load, and whether it may change them
/// (a host runs a write on a draft, or under a write lock).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Access {
    pub parts: Parts,
    pub write: bool,
}

impl Access {
    fn read(parts: Parts) -> Self {
        Self {
            parts,
            write: false,
        }
    }

    fn write(parts: Parts) -> Self {
        Self { parts, write: true }
    }
}

impl Command {
    /// The command `name` with `args`, as a client sent them. Missing or null
    /// args are `{}`, and unknown keys are ignored.
    pub fn parse(name: &str, args: serde_json::Value) -> Result<Command, CoreError> {
        if !COMMAND_NAMES.contains(&name) {
            return Err(CoreError::UnknownCommand(name.to_string()));
        }
        let args = if args.is_null() {
            serde_json::json!({})
        } else {
            args
        };
        serde_json::from_value(serde_json::json!({ "command": name, "args": args }))
            .map_err(|e| CoreError::InvalidArgs(format!("Invalid arguments for {}: {}", name, e)))
    }

    pub fn access(&self) -> Access {
        const SESSIONS: Parts = Parts::SESSIONS;
        // Starting work reads the tasks (their rates); saving the tasks
        // record follows it in the sessions and the ledger.
        let sessions_and_tasks = Parts::SESSIONS | Parts::RECORDS;
        let records_and_links = Parts::RECORDS | Parts::SESSIONS | Parts::WORK_LOGS;
        match self {
            Command::GetAppRecords(_) => Access::read(Parts::RECORDS),
            Command::SetAppRecord(_) | Command::ImportAppRecords(_) => {
                Access::write(records_and_links)
            }
            Command::GetSessions(_) | Command::GetSessionLoadWarning(_) => Access::read(SESSIONS),
            Command::StartTask(_) | Command::AddManualTime(_) | Command::MoveTimerInstance(_) => {
                Access::write(sessions_and_tasks)
            }
            Command::SetActiveSession(_)
            | Command::ClearSessionNotes(_)
            | Command::DeleteSession(_)
            | Command::RestoreSession(_)
            | Command::RestoreTimerInstance(_)
            | Command::CreateTimerInstance(_)
            | Command::UpdateTimerInstance(_)
            | Command::StartTimerInstance(_)
            | Command::StopTimerInstance(_)
            | Command::PauseTimerInstance(_)
            | Command::ResumeTimerInstance(_)
            | Command::DeleteTimerInstance(_)
            | Command::StopLiveTimer(_)
            | Command::PauseLiveTimer(_)
            | Command::PauseTimerAt(_)
            | Command::ApplyIdleChoice(_) => Access::write(SESSIONS),
            Command::GetWorkLogs(_) => Access::read(Parts::WORK_LOGS),
            Command::ApplyWorkLogImport(_) => Access::write(records_and_links),
            Command::AcceptCapture(_) | Command::TakePendingWorkLogCapture(_) => {
                Access::write(Parts::CAPTURE)
            }
            Command::RestoreBackupData(_) => Access::write(Parts::SESSIONS | Parts::WORK_LOGS),
            Command::ResetAllAppData(_) => Access::write(Parts::ALL),
        }
    }
}
