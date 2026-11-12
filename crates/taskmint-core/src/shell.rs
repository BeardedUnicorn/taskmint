//! What the desktop and phone shells offer the app beyond its data: the
//! pages and folders About opens, what About says about this copy of
//! TaskMint, and what the desktop's menu bar asks the app to do. The shells
//! implement them; the types are here so the app's TypeScript is generated
//! from them (packages/contracts).

use crate::contract::{HELP_URL, ISSUES_URL, RELEASES_URL, REPOSITORY_URL};
use serde::{Deserialize, Serialize};

/// A page of TaskMint's the shell opens in the browser. The app names one;
/// it never sends a URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub enum AppLink {
    Repository,
    Help,
    Issues,
    Releases,
}

impl AppLink {
    pub fn url(self) -> &'static str {
        match self {
            AppLink::Repository => REPOSITORY_URL,
            AppLink::Help => HELP_URL,
            AppLink::Issues => ISSUES_URL,
            AppLink::Releases => RELEASES_URL,
        }
    }
}

/// A folder of the app's the shell shows in the file manager.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub enum AppFolder {
    /// The data files (and the safety copies imports and restores keep).
    Data,
    /// The app's logs.
    Logs,
}

/// This copy of TaskMint and where it keeps its files, for About and the
/// diagnostics it copies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    /// "macos", "windows", "android", …
    pub os: String,
    /// "aarch64", "x86_64", …
    pub arch: String,
    pub data_dir: String,
    /// Null when the system has no place for logs.
    pub log_dir: Option<String>,
}

/// A page the menu bar's View menu opens (the app's pages but Settings,
/// which has its own item).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub enum MenuView {
    Home,
    Sessions,
    Tasks,
    Notes,
    History,
    Calendar,
    Payouts,
}

/// What a menu bar item asks the app to do (the `menu-command` event's
/// payload). The menu's own items (Edit, Window, Quit), its links and
/// folders, and the timer's pause and stop are the shell's to do itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MenuCommand {
    ShowView { view: MenuView },
    NewTask,
    StartWork,
    AddTime,
    ImportWorkLogs,
    CommandPalette,
    Settings,
    CloudSync,
    About,
    CheckForUpdates,
    WhatsNew,
    KeyboardShortcuts,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn menu_commands_say_what_they_are_and_which_page() {
        assert_eq!(
            json!(MenuCommand::ShowView {
                view: MenuView::Payouts
            }),
            json!({ "type": "showView", "view": "payouts" })
        );
        assert_eq!(
            json!(MenuCommand::CheckForUpdates),
            json!({ "type": "checkForUpdates" })
        );
        let parsed: MenuCommand =
            serde_json::from_value(json!({ "type": "importWorkLogs" })).unwrap();
        assert_eq!(parsed, MenuCommand::ImportWorkLogs);
    }

    #[test]
    fn links_are_named_on_the_wire_and_open_taskmints_pages() {
        let links = [
            AppLink::Repository,
            AppLink::Help,
            AppLink::Issues,
            AppLink::Releases,
        ];
        let names: Vec<_> = links.iter().map(|link| json!(link)).collect();
        assert_eq!(
            names,
            [
                json!("repository"),
                json!("help"),
                json!("issues"),
                json!("releases")
            ]
        );
        assert_eq!(
            links.map(AppLink::url),
            [REPOSITORY_URL, HELP_URL, ISSUES_URL, RELEASES_URL]
        );
        let parsed: AppLink = serde_json::from_value(json!("issues")).unwrap();
        assert_eq!(parsed, AppLink::Issues);
        assert!(serde_json::from_value::<AppLink>(json!("https://example.com")).is_err());
    }

    #[test]
    fn folders_and_info_keep_their_wire_shape() {
        assert_eq!(json!(AppFolder::Data), json!("data"));
        assert_eq!(json!(AppFolder::Logs), json!("logs"));
        let info = AppInfo {
            version: "4.4.0".into(),
            os: "macos".into(),
            arch: "aarch64".into(),
            data_dir: "/data".into(),
            log_dir: None,
        };
        assert_eq!(
            json!(info),
            json!({ "version": "4.4.0", "os": "macos", "arch": "aarch64", "dataDir": "/data", "logDir": null })
        );
    }
}
