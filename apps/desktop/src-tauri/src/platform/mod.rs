//! What the desktop shell needs from the OS and from Tauri, as one seam:
//! `Platform`. `os.rs` is the real thing (it needs a real UI session, so the
//! coverage policy leaves it to the manual QA checklist); tests use
//! `fake::FakePlatform`.

use crate::app_menu::model::{Action, AppMenu};
use crate::timer_notice::TimerNotice;
use crate::tray::model::{TrayMenu, TrayStatus};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::path::{Path, PathBuf};
use taskmint_core::shell::MenuCommand;

pub mod os;

#[cfg(test)]
pub mod fake;

/// A save dialog's title, file filter and suggested file name.
#[derive(Debug, Clone, PartialEq)]
pub struct SaveDialog {
    pub title: &'static str,
    pub filter_name: &'static str,
    pub extension: &'static str,
    pub file_name: String,
}

/// A file the user picked in a Save or Open dialog.
#[derive(Debug, Clone, PartialEq)]
pub enum PickedFile {
    /// A path on this computer.
    Path(PathBuf),
    /// A document only the system can open, with no path to show: what
    /// Android's pickers return (a content:// address).
    Document(url::Url),
}

/// The group a notification belongs to on Android (its notification
/// channel): the phone's settings list each one under TaskMint, to silence or
/// allow on its own. A desktop has no such thing and ignores it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Channel {
    /// The running timer's notification (a phone's).
    Timer,
    /// What the user asked to hear about: the withdrawal, the daily goal and
    /// summary, a long run (Settings → Notifications → Reminders).
    Reminders,
    /// What the app reports: captures, backups, errors (Settings →
    /// Notifications → Activity).
    Activity,
}

/// An OS notification to show now.
#[derive(Debug, Clone, PartialEq)]
pub struct ShownNotification {
    pub title: String,
    pub body: String,
    /// With the system sound (where the system lets the app choose).
    pub sound: bool,
    pub channel: Channel,
    /// What tapping it opens in the app (None: the app as it was).
    pub opens: Option<MenuCommand>,
}

/// An OS notification set to show later, by the system itself, so it shows
/// with the app closed (a phone's alarm).
#[derive(Debug, Clone, PartialEq)]
pub struct ScheduledNotification {
    /// Setting another with the same id replaces it.
    pub id: i32,
    pub at: DateTime<Utc>,
    pub title: String,
    pub body: String,
    pub sound: bool,
    pub channel: Channel,
    pub opens: Option<MenuCommand>,
}

/// A newer release the update feed announced (GitHub's latest release).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    pub version: String,
    /// The version running now.
    pub current_version: String,
    /// The release's notes: its CHANGELOG section, as Markdown.
    pub notes: Option<String>,
    /// When it was published (RFC 3339).
    pub date: Option<String>,
}

/// How an update's download is going (Platform::install_update).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DownloadEvent {
    /// `bytes` more arrived, of `total` (when the server says).
    Chunk { bytes: u64, total: Option<u64> },
    /// The download is complete and verified; installing comes next.
    Downloaded,
}

pub trait Platform: Send + Sync {
    /// Sends an event to the webview.
    fn emit(&self, event: &str, payload: &Value) -> Result<(), String>;
    /// Shows an OS notification.
    fn notify(&self, notification: &ShownNotification) -> Result<(), String>;
    /// Sets a notification for the system to show at its time, in place of
    /// any set before with the same id. Only a phone or tablet can.
    fn schedule_notification(&self, scheduled: &ScheduledNotification) -> Result<(), String>;
    /// Takes back the notification set with `id`, if it's still to come.
    fn cancel_notification(&self, id: i32) -> Result<(), String>;
    /// Sets up what notifications need before the first is shown (Android's
    /// channels). Called once the page is up: the system's notification
    /// plugin is ready only once the webview has loaded.
    fn prepare_notifications(&self);
    /// Asks the user to let the app notify (Android 13 and later), unless
    /// they already answered. Returns at once: the system asks on its own,
    /// and `allowed` runs if the user lets it then. A desktop has nothing to
    /// ask.
    fn ask_to_notify(&self, allowed: Box<dyn FnOnce() + Send>);
    /// Shows the running timer's notification in place of the one shown
    /// before, or takes it down (None). Only a phone has one; a desktop has
    /// the tray.
    fn set_timer_notice(&self, notice: Option<&TimerNotice>) -> Result<(), String>;
    /// Where to save; None when the dialog is dismissed.
    fn pick_save_file(&self, dialog: &SaveDialog) -> Option<PickedFile>;
    /// A JSON file to open; None when the dialog is dismissed.
    fn pick_json_file(&self, title: &str) -> Option<PickedFile>;
    /// Opens the file a Save dialog picked to write, emptied first.
    fn create_picked(&self, file: &PickedFile) -> std::io::Result<File>;
    /// Opens the file an Open dialog picked to read.
    fn open_picked(&self, file: &PickedFile) -> std::io::Result<File>;
    /// A folder; None when the dialog is dismissed.
    fn pick_folder(&self, title: &str) -> Option<PathBuf>;
    fn documents_dir(&self) -> Result<PathBuf, String>;
    /// Shows a file in the file manager.
    fn reveal(&self, path: &Path) -> Result<(), String>;
    /// Opens a folder in the file manager.
    fn open_dir(&self, path: &Path) -> Result<(), String>;
    /// Opens a web page in the system browser (Google sign-in).
    fn open_url(&self, url: &str) -> Result<(), String>;
    /// Shows and focuses the main window.
    fn show_main_window(&self);
    /// Shows `menu` in the tray, creating the tray icon the first time. An
    /// error then means there's no tray this session.
    fn render_tray(&self, menu: &TrayMenu) -> Result<(), String>;
    fn set_tray_status(&self, status: &TrayStatus) -> Result<(), String>;
    /// Whether the tray icon exists (closing the window then hides it).
    fn has_tray(&self) -> bool;
    /// Puts `menu` in the menu bar (macOS) or across the window (Windows),
    /// once. An error leaves the menu that was there.
    fn render_app_menu(&self, menu: &AppMenu) -> Result<(), String>;
    /// Relabels, and enables or disables, items render_app_menu put up, in
    /// place.
    fn update_app_menu(&self, actions: &[Action]) -> Result<(), String>;
    /// The app's version, for the capture server's health check and About.
    fn app_version(&self) -> String;
    /// Where the app's logs go.
    fn log_dir(&self) -> Result<PathBuf, String>;
    /// Starts the app again: switching between local data and a server
    /// takes effect at launch, since the webview starts with one backend.
    fn restart(&self);
    /// Asks the update feed whether there's a newer version, and keeps what
    /// it found for install_update. None: this is the newest.
    fn check_update(&self) -> Result<Option<AvailableUpdate>, String>;
    /// Downloads the update check_update found, verifies its signature and
    /// installs it, telling `progress` how the download goes. The new version
    /// runs once the app restarts; on Windows the installer quits the app
    /// and starts it again itself, so this doesn't return.
    fn install_update(
        &self,
        progress: &mut (dyn FnMut(DownloadEvent) + Send),
    ) -> Result<(), String>;
}
