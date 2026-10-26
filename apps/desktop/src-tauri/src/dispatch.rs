//! The webview's one IPC command. `dispatch(command, args)` runs the shell's
//! own commands here (dialogs, files, OS notifications, idle detection,
//! backups) and passes every other one to the data backend by name.
//!
//! It's async because Tauri runs synchronous commands on the main thread,
//! where a blocking dialog or a slow save would freeze the window.

use crate::files;
use crate::notifications::{self, Origin};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use taskmint_core::idle::IdleSettings;
use taskmint_core::notifications::{NotificationKind, NotificationPrefs};
use tauri::{AppHandle, State};

/// The shell's commands, by the names and camelCase arguments the webview
/// sends.
#[derive(Debug, PartialEq, Deserialize)]
#[serde(tag = "command", content = "args", rename_all = "snake_case")]
enum Shell {
    /// The app mirrors its saved detection settings here at startup and
    /// whenever they change (localStorage owns them).
    SetIdleSettings {
        settings: IdleSettings,
    },
    /// Whether this platform can report system idle time.
    GetIdleSupport {},
    /// The pending "you were away" question, for an app that missed the event.
    GetIdlePause {},
    ResolveIdlePause {
        choice: String,
    },
    /// The app sends its saved preferences at startup and on every change.
    SetNotificationPreferences {
        prefs: NotificationPrefs,
    },
    /// Resolves to whether it was shown (false when the user's settings
    /// don't allow it).
    ShowDesktopNotification {
        kind: NotificationKind,
        title: String,
        body: String,
    },
    GetCaptureServerStatus {},
    ValidateBackupPath {
        path: String,
    },
    #[serde(rename_all = "camelCase")]
    PerformAutomaticBackup {
        backup_path: String,
        current_data_json: String,
        max_backups: u32,
    },
    DefaultBackupDir {},
    PickBackupDir {},
    #[serde(rename_all = "camelCase")]
    ExportDataToFile {
        data_json: String,
        #[serde(default)]
        suggested_filename: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ExportCsvFile {
        csv: String,
        suggested_filename: String,
    },
    ImportDataFromFile {},
    RevealPath {
        path: String,
    },
}

const SHELL_COMMANDS: [&str; 15] = [
    "set_idle_settings",
    "get_idle_support",
    "get_idle_pause",
    "resolve_idle_pause",
    "set_notification_preferences",
    "show_desktop_notification",
    "get_capture_server_status",
    "validate_backup_path",
    "perform_automatic_backup",
    "default_backup_dir",
    "pick_backup_dir",
    "export_data_to_file",
    "export_csv_file",
    "import_data_from_file",
    "reveal_path",
];

/// The shell command `name` with `args`; None when it's a data command.
fn parse_shell(name: &str, args: &Value) -> Option<Result<Shell, String>> {
    if !SHELL_COMMANDS.contains(&name) {
        return None;
    }
    let args = if args.is_null() {
        serde_json::json!({})
    } else {
        args.clone()
    };
    Some(
        serde_json::from_value(serde_json::json!({ "command": name, "args": args }))
            .map_err(|e| format!("Invalid arguments for {}: {}", name, e)),
    )
}

/// Replies are plain data, so turning one into JSON can't fail.
fn reply(value: impl Serialize) -> Value {
    serde_json::to_value(value).expect("replies are plain data")
}

fn run_shell(app: &AppHandle, state: &AppState, shell: Shell) -> Result<Value, String> {
    Ok(match shell {
        Shell::SetIdleSettings { settings } => {
            reply(state.with_idle_mut(|idle| idle.settings = settings)?)
        }
        Shell::GetIdleSupport {} => reply(crate::idle::is_supported()),
        Shell::GetIdlePause {} => {
            let now = chrono::Utc::now();
            reply(state.with_idle(|idle| idle.pause.as_ref().map(|pause| pause.payload(now)))?)
        }
        Shell::ResolveIdlePause { choice } => reply(crate::idle::resolve(app, state, &choice)?),
        Shell::SetNotificationPreferences { prefs } => {
            reply(state.with_notification_prefs_mut(|current| *current = prefs)?)
        }
        Shell::ShowDesktopNotification { kind, title, body } => reply(notifications::post(
            app,
            state,
            kind,
            &title,
            &body,
            Origin::App,
        )),
        Shell::GetCaptureServerStatus {} => {
            reply(state.with_capture_server_status(|status| status.clone())?)
        }
        Shell::ValidateBackupPath { path } => reply(crate::backup::validate_backup_path(&path)?),
        Shell::PerformAutomaticBackup {
            backup_path,
            current_data_json,
            max_backups,
        } => reply(crate::backup::perform_automatic_backup(
            &backup_path,
            &current_data_json,
            max_backups,
        )?),
        Shell::DefaultBackupDir {} => reply(files::default_backup_dir(app)?),
        Shell::PickBackupDir {} => reply(files::pick_backup_dir(app)),
        Shell::ExportDataToFile {
            data_json,
            suggested_filename,
        } => reply(files::export_data_to_file(
            app,
            data_json,
            suggested_filename,
        )?),
        Shell::ExportCsvFile {
            csv,
            suggested_filename,
        } => reply(files::export_csv_file(app, csv, &suggested_filename)?),
        Shell::ImportDataFromFile {} => reply(files::import_data_from_file(app)?),
        Shell::RevealPath { path } => reply(files::reveal_path(app, &path)?),
    })
}

#[tauri::command]
pub async fn dispatch(
    app: AppHandle,
    state: State<'_, AppState>,
    command: String,
    args: Option<Value>,
) -> Result<Value, String> {
    let args = args.unwrap_or(Value::Null);
    match parse_shell(&command, &args) {
        Some(shell) => run_shell(&app, &state, shell?),
        None => state.backend.call_named(&command, args),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shell_commands_take_the_webviews_arguments() {
        assert_eq!(
            parse_shell(
                "perform_automatic_backup",
                &json!({ "backupPath": "/b", "currentDataJson": "{}", "maxBackups": 3 })
            ),
            Some(Ok(Shell::PerformAutomaticBackup {
                backup_path: "/b".to_string(),
                current_data_json: "{}".to_string(),
                max_backups: 3
            }))
        );
        assert_eq!(
            parse_shell("export_data_to_file", &json!({ "dataJson": "{}" })),
            Some(Ok(Shell::ExportDataToFile {
                data_json: "{}".to_string(),
                suggested_filename: None
            }))
        );
        // No arguments at all, as invoke sends for these
        assert_eq!(
            parse_shell("pick_backup_dir", &Value::Null),
            Some(Ok(Shell::PickBackupDir {}))
        );
        assert_eq!(
            parse_shell("reveal_path", &json!({})),
            Some(Err(
                "Invalid arguments for reveal_path: missing field `path`".to_string()
            ))
        );
    }

    #[test]
    fn every_shell_command_parses_and_data_commands_pass_through() {
        for name in SHELL_COMMANDS {
            // A known name fails on its arguments, if at all
            let parsed = parse_shell(name, &json!({})).expect("a shell command");
            if let Err(e) = parsed {
                assert!(e.starts_with("Invalid arguments"), "{}: {}", name, e);
            }
        }
        assert_eq!(parse_shell("start_task", &json!({})), None);
        assert_eq!(parse_shell("anything_else", &Value::Null), None);
    }
}
