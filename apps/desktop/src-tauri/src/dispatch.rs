//! The webview's one IPC command. `dispatch(command, args)` runs the shell's
//! own commands here (dialogs, files, OS notifications, idle detection,
//! backups, updates) and passes every other one to the data backend by name.
//!
//! It's async because Tauri runs synchronous commands on the main thread,
//! where a blocking dialog or a slow save would freeze the window. Each call
//! runs on a blocking thread, so one that waits a long time (Google sign-in
//! waits for the browser) holds up no other.

use crate::files;
use crate::google_sign_in::{self, ColorMode, GoogleClient};
use crate::notifications::{self, Origin};
use crate::state::AppState;
use crate::updates;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use taskmint_core::idle::IdleSettings;
use taskmint_core::notifications::{NotificationKind, NotificationPrefs};
use taskmint_core::shell::{AppFolder, AppLink};
use tauri::State;

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
    /// The tray's line about the next withdrawal, or null for none. The app
    /// sends it whenever it changes.
    SetTrayWithdrawal {
        label: Option<String>,
    },
    /// Resolves to whether it was shown (false when the user's settings
    /// don't allow it).
    ShowDesktopNotification {
        kind: NotificationKind,
        title: String,
        body: String,
    },
    /// Sets a notification for the system to show at `at` (RFC 3339) with
    /// the app closed, replacing any set before with `id`. Resolves to
    /// whether it was set. Only a phone or tablet can; the app asks only
    /// there.
    ScheduleNotification {
        id: i32,
        at: DateTime<Utc>,
        kind: NotificationKind,
        title: String,
        body: String,
    },
    /// Takes back the notification set with `id`.
    CancelNotification {
        id: i32,
    },
    /// Asks the user to let the app notify (a phone), when they set up
    /// something that notifies: their first work, a withdrawal reminder, a
    /// test notification. Not at launch, before they've seen the app.
    AskToNotify {},
    /// What the notification the user last tapped opens (a MenuCommand), or
    /// null, once. The app asks as soon as it's up (a tap can start it) and
    /// on each `notification-opened`. Being up, it's also when the phone's
    /// notifications can be set up (Platform::prepare_notifications) and its
    /// running-timer notification shown (timer_notice::start).
    TakeOpenedNotification {},
    /// The user tapped Android's notification `id`, or one of its buttons
    /// (`action`; "tap" for the notification itself). MainActivity hands the
    /// page these, the only part of a tap Android's plugin keeps.
    NotificationAction {
        id: i32,
        action: String,
    },
    /// What a launcher shortcut or a home-screen widget's button asks for
    /// (contract::launch), which MainActivity hands the page.
    LaunchAction {
        action: String,
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
    /// The backups in the backup folder, newest first, to restore from.
    ListBackups {
        folder: String,
    },
    /// One of them, by the name list_backups gave.
    ReadBackup {
        folder: String,
        name: String,
    },
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
    /// What the webview runs on: `{ runtime, dataLocation }`, read before
    /// the client starts.
    GetCapabilities {},
    /// Asks GitHub's latest release whether there's a newer version: what
    /// it is, or null.
    CheckForUpdate {},
    /// Installs what the last check found and restarts into it, sending
    /// update-progress events as it downloads.
    InstallUpdate {},
    /// A phone's update: opens the APK of what the last check found in the
    /// browser, for the user to install.
    DownloadUpdate {},
    /// Signs in with Google in the system browser, for cloud sync: the
    /// Google ID token Firebase takes. The page the browser comes back to
    /// is in the app's `colorMode` (the browser's own without one).
    #[serde(rename_all = "camelCase")]
    GoogleSignIn {
        client_id: String,
        client_secret: String,
        #[serde(default)]
        color_mode: Option<ColorMode>,
    },
    /// Opens one of TaskMint's pages in the browser, by name (never a URL).
    OpenLink {
        link: AppLink,
    },
    /// Shows the data or logs folder in the file manager.
    OpenFolder {
        folder: AppFolder,
    },
    /// This copy of TaskMint, for About.
    GetAppInfo {},
}

const SHELL_COMMANDS: [&str; 32] = [
    "set_idle_settings",
    "get_idle_support",
    "get_idle_pause",
    "resolve_idle_pause",
    "set_notification_preferences",
    "set_tray_withdrawal",
    "show_desktop_notification",
    "schedule_notification",
    "cancel_notification",
    "ask_to_notify",
    "take_opened_notification",
    "notification_action",
    "launch_action",
    "get_capture_server_status",
    "validate_backup_path",
    "perform_automatic_backup",
    "default_backup_dir",
    "pick_backup_dir",
    "list_backups",
    "read_backup",
    "export_data_to_file",
    "export_csv_file",
    "import_data_from_file",
    "reveal_path",
    "get_capabilities",
    "check_for_update",
    "install_update",
    "download_update",
    "google_sign_in",
    "open_link",
    "open_folder",
    "get_app_info",
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

fn run_shell(state: &AppState, shell: Shell) -> Result<Value, String> {
    Ok(match shell {
        Shell::SetIdleSettings { settings } => {
            state.with_idle_mut(|idle| idle.settings = settings);
            Value::Null
        }
        Shell::GetIdleSupport {} => reply(crate::idle::is_supported()),
        Shell::GetIdlePause {} => {
            let now = (state.clock)();
            reply(state.with_idle(|idle| idle.pause.as_ref().map(|pause| pause.payload(now))))
        }
        Shell::ResolveIdlePause { choice } => reply(crate::idle::resolve(state, &choice)?),
        Shell::SetNotificationPreferences { prefs } => {
            state.with_notification_prefs_mut(|current| *current = prefs);
            // (System notifications off takes the timer's down)
            crate::timer_notice::sync(state);
            Value::Null
        }
        Shell::SetTrayWithdrawal { label } => {
            state.with_tray_withdrawal_mut(|current| *current = label);
            crate::tray::sync(state);
            Value::Null
        }
        Shell::ShowDesktopNotification { kind, title, body } => {
            reply(notifications::post(state, kind, &title, &body, Origin::App))
        }
        Shell::ScheduleNotification {
            id,
            at,
            kind,
            title,
            body,
        } => reply(notifications::schedule(state, kind, id, at, &title, &body)),
        Shell::CancelNotification { id } => {
            notifications::cancel(state, id);
            Value::Null
        }
        Shell::AskToNotify {} => {
            // Once allowed, the running timer's notification can show
            let allowed = state.clone();
            state
                .platform
                .ask_to_notify(Box::new(move || crate::timer_notice::refresh(&allowed)));
            Value::Null
        }
        Shell::TakeOpenedNotification {} => {
            state.platform.prepare_notifications();
            crate::timer_notice::start(state);
            reply(notifications::take_opened(state))
        }
        Shell::LaunchAction { action } => {
            crate::launch::run(state, &action);
            Value::Null
        }
        Shell::NotificationAction { id, action } => {
            let opens = notifications::kind_of(id).and_then(notifications::opens);
            notifications::performed(state, &action, Some(id), opens);
            Value::Null
        }
        Shell::GetCaptureServerStatus {} => {
            reply(state.with_capture_server_status(|status| status.clone()))
        }
        Shell::ValidateBackupPath { path } => reply(crate::backup::validate_backup_path(&path)),
        Shell::PerformAutomaticBackup {
            backup_path,
            current_data_json,
            max_backups,
        } => reply(crate::backup::perform_automatic_backup(
            &backup_path,
            &current_data_json,
            max_backups,
            (state.clock)(),
        )),
        Shell::DefaultBackupDir {} => reply(files::default_backup_dir(state)?),
        Shell::PickBackupDir {} => reply(files::pick_backup_dir(state)),
        Shell::ListBackups { folder } => reply(crate::backup::list_backups(&folder)?),
        Shell::ReadBackup { folder, name } => reply(crate::backup::read_backup(&folder, &name)?),
        Shell::ExportDataToFile {
            data_json,
            suggested_filename,
        } => reply(files::export_data_to_file(
            state,
            data_json,
            suggested_filename,
        )?),
        Shell::ExportCsvFile {
            csv,
            suggested_filename,
        } => reply(files::export_csv_file(state, csv, &suggested_filename)?),
        Shell::ImportDataFromFile {} => reply(files::import_data_from_file(state)?),
        Shell::RevealPath { path } => reply(files::reveal_path(state, &path)?),
        Shell::GetCapabilities {} => crate::capabilities::capabilities(),
        Shell::CheckForUpdate {} => reply(state.platform.check_update()?),
        Shell::InstallUpdate {} => {
            updates::install(state)?;
            Value::Null
        }
        Shell::DownloadUpdate {} => {
            state.platform.download_update()?;
            Value::Null
        }
        Shell::GoogleSignIn {
            client_id,
            client_secret,
            color_mode,
        } => {
            let client = GoogleClient {
                client_id,
                client_secret,
            };
            return google_sign_in::sign_in_with_google(
                state.platform.as_ref(),
                &client,
                color_mode,
            );
        }
        Shell::OpenLink { link } => {
            crate::about::open_link(state, link)?;
            Value::Null
        }
        Shell::OpenFolder { folder } => {
            crate::about::open_folder(state, folder)?;
            Value::Null
        }
        Shell::GetAppInfo {} => reply(crate::about::app_info(state)),
    })
}

/// Runs a command by name with the webview's arguments.
fn route(state: &AppState, command: &str, args: Value) -> Result<Value, String> {
    match parse_shell(command, &args) {
        Some(shell) => run_shell(state, shell?),
        None => state.backend.call_named(command, args),
    }
}

/// The webview always sends `args` (`{}` for none).
#[tauri::command]
pub async fn dispatch(
    state: State<'_, AppState>,
    command: String,
    args: Value,
) -> Result<Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || route(&state, &command, args))
        .await
        .expect("commands don't panic")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{fixture, Fixture};
    use serde_json::json;
    use std::path::PathBuf;

    fn run(f: &Fixture, command: &str, args: Value) -> Result<Value, String> {
        route(&f.state, command, args)
    }

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

    #[test]
    fn idle_detection_is_set_up_and_answered_through_the_shell() {
        let f = fixture();
        let settings =
            json!({ "settings": { "enabled": true, "thresholdMinutes": 5, "longRunHours": 2 } });
        assert_eq!(run(&f, "set_idle_settings", settings), Ok(Value::Null));
        assert!(f.state.with_idle(|idle| idle.settings.enabled));
        assert_eq!(
            run(&f, "get_idle_support", Value::Null),
            Ok(json!(crate::idle::is_supported()))
        );
        assert_eq!(run(&f, "get_idle_pause", json!({})), Ok(Value::Null));
        f.state.with_idle_mut(|idle| {
            idle.pause = Some(taskmint_core::idle::IdlePause {
                instance_id: "i1".to_string(),
                task_name: "Writing".to_string(),
                idle_since: crate::testing::start() - chrono::Duration::minutes(10),
                returned_at: None,
            })
        });
        assert_eq!(
            run(&f, "get_idle_pause", json!({})).map(|pause| pause["awayMs"].clone()),
            Ok(json!(600_000))
        );
        assert_eq!(
            run(&f, "resolve_idle_pause", json!({ "choice": "stayPaused" })),
            Ok(Value::Null)
        );
        assert_eq!(
            run(&f, "resolve_idle_pause", json!({ "choice": "later" })),
            Err("Unknown choice: later".to_string())
        );
    }

    #[test]
    fn the_app_sets_and_clears_the_trays_withdrawal_line() {
        let f = fixture();
        assert!(crate::tray::start(&f.state));
        let line = "Next withdrawal: Mon, Nov 10, 6:25 PM · $1,100.00";
        assert_eq!(
            run(&f, "set_tray_withdrawal", json!({ "label": line })),
            Ok(Value::Null)
        );
        let menu = f.platform.recorded().menus.last().cloned().unwrap();
        assert!(menu
            .0
            .contains(&crate::tray::model::TrayItem::Label(format!("💰 {}", line))));

        assert_eq!(
            run(&f, "set_tray_withdrawal", json!({ "label": null })),
            Ok(Value::Null)
        );
        assert_eq!(f.state.with_tray_withdrawal(|label| label.clone()), None);
    }

    #[test]
    fn notifications_follow_the_apps_preferences() {
        let f = fixture();
        let prefs = json!({ "prefs": { "desktopEnabled": true, "sound": true } });
        assert_eq!(
            run(&f, "set_notification_preferences", prefs),
            Ok(Value::Null)
        );
        let shown = run(
            &f,
            "show_desktop_notification",
            json!({ "kind": "general", "title": "Saved", "body": "All good" }),
        );
        assert_eq!(shown, Ok(json!(true)));
        let shown = &f.platform.recorded().notifications;
        assert_eq!(
            (
                shown[0].title.as_str(),
                shown[0].body.as_str(),
                shown[0].sound
            ),
            ("Saved", "All good", true)
        );
    }

    #[test]
    fn the_app_sets_a_notification_for_later_and_takes_it_back() {
        let f = fixture();
        let set = run(
            &f,
            "schedule_notification",
            json!({
                "id": 4100,
                "at": "2026-03-02T18:25:00.000Z",
                "kind": "withdrawalReady",
                "title": "Withdrawal ready",
                "body": "$80.00 is ready to withdraw."
            }),
        );
        assert_eq!(set, Ok(json!(true)));
        let scheduled = f.platform.recorded().scheduled[0].clone();
        assert_eq!(
            (scheduled.id, scheduled.at.to_rfc3339(), scheduled.title),
            (
                4100,
                "2026-03-02T18:25:00+00:00".to_string(),
                "Withdrawal ready".to_string()
            )
        );

        assert_eq!(
            run(&f, "cancel_notification", json!({ "id": 4100 })),
            Ok(Value::Null)
        );
        assert_eq!(f.platform.recorded().cancelled, [4100]);
    }

    #[test]
    fn the_app_asks_to_notify_when_it_needs_to() {
        let f = fixture();
        // A phone, its page up
        crate::timer_notice::enable(&f.state);
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(Value::Null)
        );
        assert_eq!(f.platform.recorded().timer_notices.len(), 1);

        assert_eq!(run(&f, "ask_to_notify", json!({})), Ok(Value::Null));
        assert_eq!(f.platform.recorded().asked_to_notify, 1);
        // Allowed: the timer's notification is shown again, now that it can be
        assert_eq!(f.platform.recorded().timer_notices.len(), 2);
    }

    #[test]
    fn turning_system_notifications_off_takes_the_timers_down() {
        let f = fixture();
        crate::timer_notice::enable(&f.state);
        run(&f, "take_opened_notification", json!({})).unwrap();
        f.state
            .backend
            .call_named(
                "set_app_record",
                json!({ "key": "predefinedTasks", "value": [
                    { "id": "t1", "name": "Writing", "createdAt": "x", "updatedAt": "x" }
                ] }),
            )
            .unwrap();
        f.state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();
        assert!(f
            .platform
            .recorded()
            .timer_notices
            .last()
            .unwrap()
            .is_some());

        let prefs = json!({ "prefs": { "desktopEnabled": false } });
        run(&f, "set_notification_preferences", prefs).unwrap();
        assert_eq!(f.platform.recorded().timer_notices.last(), Some(&None));
    }

    #[test]
    fn the_app_takes_what_a_tapped_notification_opens_once() {
        let f = fixture();
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(Value::Null)
        );
        // The page is up: the phone's channels can be made
        assert_eq!(f.platform.recorded().notifications_prepared, 1);
        notifications::performed(
            &f.state,
            notifications::TAPPED,
            Some(1),
            Some(taskmint_core::shell::MenuCommand::Settings),
        );
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(json!({ "type": "settings" }))
        );
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(Value::Null)
        );
    }

    #[test]
    fn a_shortcut_or_widget_action_reaches_the_launch_actions() {
        let f = fixture();
        let action = json!({ "action": "payouts" });
        assert_eq!(run(&f, "launch_action", action), Ok(Value::Null));
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(json!({ "type": "showView", "view": "payouts" }))
        );
    }

    #[test]
    fn a_phone_downloads_the_update_it_found() {
        let f = fixture();
        assert_eq!(run(&f, "download_update", json!({})), Ok(Value::Null));
        assert_eq!(f.platform.recorded().updates_downloaded, 1);
        f.platform.fail("download_update");
        assert_eq!(
            run(&f, "download_update", json!({})),
            Err("download_update failed".to_string())
        );
    }

    #[test]
    fn an_android_tap_opens_the_page_its_id_says() {
        let f = fixture();
        let tap = |id: i32| json!({ "id": id, "action": "tap" });
        run(&f, "notification_action", tap(4100)).unwrap();
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(json!({ "type": "showView", "view": "payouts" }))
        );
        // One about no page, or no kind, only brings the app forward
        run(&f, "notification_action", tap(5000)).unwrap();
        run(&f, "notification_action", tap(1)).unwrap();
        assert_eq!(
            run(&f, "take_opened_notification", json!({})),
            Ok(Value::Null)
        );
        assert_eq!(f.platform.recorded().windows_shown, 3);
    }

    #[test]
    fn the_capture_servers_status_is_reported() {
        let f = fixture();
        assert_eq!(
            run(&f, "get_capture_server_status", json!({})),
            // A dev build's own port (tests are dev)
            Ok(json!({ "running": false, "port": 43127, "warning": null }))
        );
    }

    #[test]
    fn backups_are_checked_and_written() {
        let f = fixture();
        let folder = f.dir.0.join("backups");
        let path = folder.to_string_lossy().to_string();
        assert_eq!(
            run(&f, "validate_backup_path", json!({ "path": path })),
            Ok(json!({ "isValid": true, "error": null }))
        );
        let written = run(
            &f,
            "perform_automatic_backup",
            json!({ "backupPath": path, "currentDataJson": "{}", "maxBackups": 3 }),
        )
        .unwrap();
        assert_eq!(written["success"], true);
        assert_eq!(written["timestamp"], "2026-03-02T15:00:00+00:00");

        f.platform.set_documents("/Users/me/Documents");
        assert_eq!(
            run(&f, "default_backup_dir", json!({})),
            Ok(json!("/Users/me/Documents/TaskMint Backups"))
        );
        f.platform.answer(Some(folder.clone()));
        assert_eq!(run(&f, "pick_backup_dir", json!({})), Ok(json!(path)));

        let listed = run(&f, "list_backups", json!({ "folder": path })).unwrap();
        assert_eq!(listed[0]["valid"], false);
        let name = listed[0]["name"].clone();
        assert_eq!(
            run(&f, "read_backup", json!({ "folder": path, "name": name })),
            Ok(json!("{}"))
        );
    }

    #[test]
    fn files_are_exported_imported_and_shown_through_the_shell() {
        let f = fixture();
        let export = f.dir.0.join("export.json");
        f.platform.answer(Some(export.clone()));
        assert_eq!(
            run(
                &f,
                "export_data_to_file",
                json!({ "dataJson": "{}", "suggestedFilename": "mine" })
            ),
            Ok(json!(export.to_string_lossy()))
        );
        let csv = f.dir.0.join("entries.csv");
        f.platform.answer(Some(csv.clone()));
        assert_eq!(
            run(
                &f,
                "export_csv_file",
                json!({ "csv": "a", "suggestedFilename": "entries" })
            ),
            Ok(json!(csv.to_string_lossy()))
        );
        f.platform.answer(Some(export.clone()));
        assert_eq!(run(&f, "import_data_from_file", json!({})), Ok(json!("{}")));
        assert_eq!(
            run(&f, "reveal_path", json!({ "path": "/tmp/export.json" })),
            Ok(Value::Null)
        );
        assert_eq!(
            f.platform.recorded().revealed,
            [PathBuf::from("/tmp/export.json")]
        );
    }

    #[test]
    fn the_shells_refusals_reach_the_webview() {
        let f = fixture();
        f.platform.fail("reveal");
        for (command, args) in [
            ("default_backup_dir", json!({})),
            ("export_data_to_file", json!({ "dataJson": "{}" })),
            (
                "export_csv_file",
                json!({ "csv": "a", "suggestedFilename": "x" }),
            ),
            ("import_data_from_file", json!({})),
            ("list_backups", json!({ "folder": "/dev/null" })),
            ("read_backup", json!({ "folder": "/tmp", "name": "x.json" })),
            ("reveal_path", json!({ "path": "/tmp/x" })),
            ("reveal_path", json!({})),
        ] {
            assert!(run(&f, command, args).is_err(), "{}", command);
        }
    }

    #[test]
    fn data_commands_go_to_the_backend() {
        let f = fixture();
        assert_eq!(run(&f, "get_sessions", json!({})), Ok(json!([])));
        assert_eq!(
            run(&f, "launch", json!({})),
            Err("Unknown command: launch".to_string())
        );
    }

    #[test]
    fn the_capabilities_name_the_runtime_and_the_data_location() {
        let f = fixture();
        assert_eq!(
            run(&f, "get_capabilities", json!({})),
            Ok(json!({ "runtime": "desktop", "dataLocation": "local" }))
        );
    }

    #[test]
    fn google_sign_in_opens_the_browser_and_says_when_it_cannot() {
        let f = fixture();
        f.platform.fail("open_url");
        let args = json!({ "clientId": "c", "clientSecret": "s" });
        assert!(run(&f, "google_sign_in", args).is_err());
        let args = json!({ "clientId": "c", "clientSecret": "s", "colorMode": "light" });
        assert!(run(&f, "google_sign_in", args).is_err());
        assert!(run(&f, "google_sign_in", json!({})).is_err());
        // A mode the page doesn't have is refused with the arguments
        let args = json!({ "clientId": "c", "clientSecret": "s", "colorMode": "sepia" });
        assert!(run(&f, "google_sign_in", args)
            .unwrap_err()
            .contains("unknown variant"));
    }

    #[test]
    fn updates_are_checked_for_and_installed_through_the_shell() {
        let f = fixture();
        assert_eq!(run(&f, "check_for_update", json!({})), Ok(Value::Null));
        f.platform.announce(Some(crate::platform::AvailableUpdate {
            version: "1.3.0".to_string(),
            current_version: "1.2.3".to_string(),
            notes: Some("### Added\n\n- Updates".to_string()),
            date: None,
        }));
        assert_eq!(
            run(&f, "check_for_update", json!({})),
            Ok(json!({
                "version": "1.3.0",
                "currentVersion": "1.2.3",
                "notes": "### Added\n\n- Updates",
                "date": null
            }))
        );
        assert_eq!(run(&f, "install_update", json!({})), Ok(Value::Null));
        assert_eq!(f.platform.recorded().restarts, 1);

        f.platform.fail("check_update");
        f.platform.fail("install_update");
        assert!(run(&f, "check_for_update", json!({})).is_err());
        assert!(run(&f, "install_update", json!({})).is_err());
        assert_eq!(f.platform.recorded().restarts, 1);
    }

    #[test]
    fn links_folders_and_app_info_go_through_the_shell() {
        let f = fixture();
        assert_eq!(
            run(&f, "open_link", json!({ "link": "issues" })),
            Ok(Value::Null)
        );
        assert_eq!(
            f.platform.recorded().opened_urls,
            [taskmint_core::contract::ISSUES_URL]
        );
        // Only TaskMint's own pages, by name
        for link in [json!("evil"), json!("https://example.com")] {
            assert!(run(&f, "open_link", json!({ "link": link }))
                .unwrap_err()
                .contains("unknown variant"));
        }

        assert_eq!(
            run(&f, "open_folder", json!({ "folder": "data" })),
            Ok(Value::Null)
        );
        assert_eq!(f.platform.recorded().opened, std::slice::from_ref(&f.dir.0));
        assert_eq!(
            run(&f, "open_folder", json!({ "folder": "logs" })),
            Err("no log folder".to_string())
        );
        f.platform.fail("open_url");
        assert!(run(&f, "open_link", json!({ "link": "help" })).is_err());

        assert_eq!(
            run(&f, "get_app_info", json!({})),
            Ok(json!({
                "version": "1.2.3",
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "dataDir": f.dir.0.display().to_string(),
                "logDir": null
            }))
        );
    }

    /// The webview's view: an app on the mock runtime, managing `state`.
    fn webview(
        f: &Fixture,
    ) -> (
        tauri::App<tauri::test::MockRuntime>,
        tauri::WebviewWindow<tauri::test::MockRuntime>,
    ) {
        let app = tauri::test::mock_builder()
            .manage(f.state.clone())
            .invoke_handler(tauri::generate_handler![dispatch])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        (app, webview)
    }

    fn invoke(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        body: Value,
    ) -> Result<Value, Value> {
        tauri::test::get_ipc_response(
            webview,
            tauri::webview::InvokeRequest {
                cmd: "dispatch".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .map(|response| response.deserialize::<Value>().unwrap())
    }

    #[test]
    fn the_webview_reaches_both_kinds_of_command_through_ipc() {
        let f = fixture();
        let (_app, webview) = webview(&f);
        assert_eq!(
            invoke(&webview, json!({ "command": "get_sessions", "args": {} })),
            Ok(json!([]))
        );
        assert_eq!(
            invoke(&webview, json!({ "command": "get_idle_pause", "args": {} })),
            Ok(Value::Null)
        );
        // The backend's own words come back as the error
        assert_eq!(
            invoke(
                &webview,
                json!({ "command": "start_task", "args": { "taskId": "", "taskName": "" } })
            ),
            Err(json!("Choose a task to start"))
        );
    }

    #[test]
    fn a_call_without_a_command_or_its_args_is_refused() {
        let f = fixture();
        let (_app, webview) = webview(&f);
        for body in [
            json!({ "args": {} }),
            json!({ "command": 7, "args": {} }),
            json!({ "command": "get_sessions" }),
        ] {
            let error = invoke(&webview, body.clone()).unwrap_err();
            assert!(
                error.as_str().unwrap().contains("dispatch"),
                "{}: {}",
                body,
                error
            );
        }
    }
}
