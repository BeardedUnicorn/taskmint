//! What the desktop shell needs from the OS and from Tauri, as one seam.
//! `os.rs` is the real thing (and needs a real UI session, so the coverage
//! policy leaves it to the manual QA checklist); tests use `fake::FakePlatform`.

use crate::tray::model::{TrayMenu, TrayStatus};
use serde_json::Value;
use std::path::{Path, PathBuf};

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

pub trait Platform: Send + Sync {
    /// Sends an event to the webview.
    fn emit(&self, event: &str, payload: &Value) -> Result<(), String>;
    /// Shows an OS notification, with the system sound when `sound`.
    fn notify(&self, title: &str, body: &str, sound: bool) -> Result<(), String>;
    /// Where to save; None when the dialog is dismissed.
    fn pick_save_file(&self, dialog: &SaveDialog) -> Option<PathBuf>;
    /// A JSON file to open; None when the dialog is dismissed.
    fn pick_json_file(&self, title: &str) -> Option<PathBuf>;
    /// A folder; None when the dialog is dismissed.
    fn pick_folder(&self, title: &str) -> Option<PathBuf>;
    fn documents_dir(&self) -> Result<PathBuf, String>;
    /// Shows a file in the file manager.
    fn reveal(&self, path: &Path) -> Result<(), String>;
    /// Opens a folder in the file manager.
    fn open_dir(&self, path: &Path) -> Result<(), String>;
    /// Shows and focuses the main window.
    fn show_main_window(&self);
    /// Shows `menu` in the tray, creating the tray icon the first time. An
    /// error then means there's no tray this session.
    fn render_tray(&self, menu: &TrayMenu) -> Result<(), String>;
    fn set_tray_status(&self, status: &TrayStatus) -> Result<(), String>;
    /// Whether the tray icon exists (closing the window then hides it).
    fn has_tray(&self) -> bool;
    /// The app's version, for the capture server's health check.
    fn app_version(&self) -> String;
}
