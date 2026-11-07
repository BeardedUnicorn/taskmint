//! Every command, by its wire name, with its arguments. The names and the
//! camelCase argument keys are what the frontend has always sent to the
//! desktop app; the server takes the same ones.

use super::{AppRecords, CoreError, ResetSummary, SavedRecord, WorkLogs};
use crate::model::{CaptureSource, PendingCapture, TaskSession, TimerInstance};
use crate::records::RecordMap;
use crate::restore::{RestorePayload, RestoreSummary};
use crate::sessions::instances::TimerInstanceUpdates;
use crate::sessions::start::StartTaskResult;
use crate::worklogs::{WorkLogImportPayload, WorkLogImportSummary};
use crate::workspace::Parts;
use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

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
    CreateTimerInstance(CreateTimerInstanceArgs),
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

/// Every command, by name, with its arguments and its reply. It drives the
/// TypeScript `CommandMap` (packages/contracts, from tests/contracts.rs) and
/// a check that every reply in the conformance scenarios is its declared
/// type (`check_reply`).
macro_rules! command_types {
    ($($name:literal: $args:ty => $reply:ty,)*) => {
        /// Every command's name, as `Command` spells them. A name missing
        /// here can't be called (every one runs in the conformance
        /// scenarios).
        pub const COMMAND_NAMES: &[&str] = &[$($name),*];

        /// Whether `reply` is exactly a reply of `command`'s declared type:
        /// it reads as that type and writes back unchanged.
        pub fn check_reply(command: &str, reply: &serde_json::Value) -> Result<(), String> {
            let reread = match command {
                $($name => reread::<$reply>(reply),)*
                _ => return Err(format!("{} has no declared reply", command)),
            };
            match reread? {
                again if again == *reply => Ok(()),
                again => Err(format!("it reads back as {}", again)),
            }
        }

        /// Each command's argument and reply types in TypeScript, and the
        /// generated types they name.
        #[cfg(feature = "ts")]
        pub fn command_types(cfg: &ts_rs::Config) -> Vec<CommandTypes> {
            vec![$(CommandTypes {
                name: $name,
                args: <$args as ts_rs::TS>::name(cfg),
                reply: <$reply as ts_rs::TS>::name(cfg),
                uses: [type_names::<$args>(cfg), type_names::<$reply>(cfg)].concat(),
            },)*]
        }
    };
}

command_types! {
    "get_app_records": NoArgs => AppRecords,
    "set_app_record": SetAppRecordArgs => SavedRecord,
    "import_app_records": ImportAppRecordsArgs => AppRecords,
    "get_sessions": NoArgs => Vec<TaskSession>,
    "get_session_load_warning": NoArgs => Option<String>,
    "start_task": StartTaskArgs => StartTaskResult,
    "add_manual_time": AddManualTimeArgs => TaskSession,
    "set_active_session": SetActiveSessionArgs => Vec<TaskSession>,
    "clear_session_notes": ClearSessionNotesArgs => usize,
    "delete_session": SessionArgs => TaskSession,
    "restore_session": RestoreSessionArgs => TaskSession,
    "restore_timer_instance": RestoreTimerInstanceArgs => TaskSession,
    "create_timer_instance": CreateTimerInstanceArgs => TimerInstance,
    "update_timer_instance": UpdateTimerInstanceArgs => TimerInstance,
    "start_timer_instance": InstanceArgs => TaskSession,
    "stop_timer_instance": InstanceArgs => TaskSession,
    "pause_timer_instance": InstanceArgs => TaskSession,
    "resume_timer_instance": InstanceArgs => TaskSession,
    "delete_timer_instance": InstanceArgs => TaskSession,
    "move_timer_instance": MoveTimerInstanceArgs => String,
    "stop_live_timer": NoArgs => Option<String>,
    "pause_live_timer": NoArgs => Option<String>,
    "pause_timer_at": PauseTimerAtArgs => bool,
    "apply_idle_choice": ApplyIdleChoiceArgs => bool,
    "get_work_logs": NoArgs => WorkLogs,
    "apply_work_log_import": ApplyWorkLogImportArgs => WorkLogImportSummary,
    "accept_capture": AcceptCaptureArgs => (),
    "take_pending_work_log_capture": NoArgs => Option<PendingCapture>,
    "restore_backup_data": RestoreBackupDataArgs => RestoreSummary,
    "reset_all_app_data": NoArgs => ResetSummary,
}

/// `reply` read as a `T` and written back.
fn reread<T: Serialize + DeserializeOwned>(
    reply: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    T::deserialize(reply)
        .map(|typed| serde_json::to_value(typed).expect("replies are plain data"))
        .map_err(|e| format!("it doesn't read as its reply type: {}", e))
}

/// One command in TypeScript: `args` is "NoArgs" for a command without any.
#[cfg(feature = "ts")]
#[derive(Debug)]
pub struct CommandTypes {
    pub name: &'static str,
    pub args: String,
    pub reply: String,
    /// The generated types `args` and `reply` mention.
    pub uses: Vec<String>,
}

/// The generated type `T` is, or the one it wraps (`Vec<T>`, `Option<T>`).
#[cfg(feature = "ts")]
fn type_names<T: ts_rs::TS + 'static>(cfg: &ts_rs::Config) -> Vec<String> {
    struct Names<'a> {
        cfg: &'a ts_rs::Config,
        found: Vec<String>,
    }
    impl ts_rs::TypeVisitor for Names<'_> {
        fn visit<U: ts_rs::TS + 'static + ?Sized>(&mut self) {
            if U::output_path().is_some() {
                self.found.push(U::ident(self.cfg));
            }
        }
    }
    let mut names = Names {
        cfg,
        found: Vec::new(),
    };
    if T::output_path().is_some() {
        names.found.push(T::ident(cfg));
    } else {
        T::visit_generics(&mut names);
    }
    names.found
}

/// For commands that take no arguments: `{}`, `null`, or nothing at all.
#[derive(Debug, Default, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct NoArgs {}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct SetAppRecordArgs {
    pub key: String,
    /// null removes the record.
    pub value: serde_json::Value,
    /// The record's revision when the client read it; the save is refused
    /// if it has changed since. Absent: saved whatever the revision.
    #[serde(default)]
    pub base_revision: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct ImportAppRecordsArgs {
    pub records: RecordMap,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct StartTaskArgs {
    pub task_id: String,
    pub task_name: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct AddManualTimeArgs {
    pub task_id: String,
    pub task_name: String,
    /// RFC 3339.
    pub start_time: String,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct SetActiveSessionArgs {
    /// None deactivates every session.
    #[serde(default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct ClearSessionNotesArgs {
    pub session_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SessionArgs {
    pub session_id: String,
}

/// A task picked for a new timer.
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct TaskChoice {
    pub task_id: String,
    pub task_name: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct CreateTimerInstanceArgs {
    pub session_id: String,
    /// The task it's for. None is the session's own, as older clients send.
    #[serde(default)]
    pub task: Option<TaskChoice>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct RestoreSessionArgs {
    pub session: TaskSession,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct RestoreTimerInstanceArgs {
    pub session_id: String,
    pub instance: TimerInstance,
    /// Where it was in its session's list; the end when absent.
    #[serde(default)]
    pub index: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct UpdateTimerInstanceArgs {
    pub instance_id: String,
    pub updates: TimerInstanceUpdates,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct InstanceArgs {
    pub instance_id: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct MoveTimerInstanceArgs {
    pub instance_id: String,
    pub task_id: String,
    pub task_name: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct PauseTimerAtArgs {
    pub instance_id: String,
    /// When input stopped; the pause starts here.
    pub idle_since: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct ApplyIdleChoiceArgs {
    pub instance_id: String,
    /// "discardResume", "keepResume" or "stayPaused".
    #[cfg_attr(
        feature = "ts",
        ts(type = r#""discardResume" | "keepResume" | "stayPaused""#)
    )]
    pub choice: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct ApplyWorkLogImportArgs {
    pub payload: WorkLogImportPayload,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct AcceptCaptureArgs {
    /// The raw JSON text, as captured from the site.
    pub payload: String,
    pub source: CaptureSource,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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
            Command::StartTask(_)
            | Command::AddManualTime(_)
            | Command::CreateTimerInstance(_)
            | Command::MoveTimerInstance(_) => Access::write(sessions_and_tasks),
            Command::SetActiveSession(_)
            | Command::ClearSessionNotes(_)
            | Command::DeleteSession(_)
            | Command::RestoreSession(_)
            | Command::RestoreTimerInstance(_)
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
