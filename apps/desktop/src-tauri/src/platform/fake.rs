//! A Platform for tests: it records what the shell asked of it, and answers
//! dialogs with what the test queued. MemorySecrets stands in for the
//! keychain.

use super::{Platform, SaveDialog, SecretStore};
use crate::tray::model::{TrayMenu, TrayStatus};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct Recorded {
    pub events: Vec<(String, Value)>,
    pub notifications: Vec<(String, String, bool)>,
    pub save_dialogs: Vec<SaveDialog>,
    pub open_dialogs: Vec<String>,
    pub folder_dialogs: Vec<String>,
    pub revealed: Vec<PathBuf>,
    pub opened: Vec<PathBuf>,
    pub windows_shown: usize,
    pub menus: Vec<TrayMenu>,
    pub statuses: Vec<TrayStatus>,
    pub restarts: usize,
}

#[derive(Default)]
pub struct FakePlatform {
    pub recorded: Mutex<Recorded>,
    /// Answers for the next dialogs, in order (None: dismissed).
    pub dialog_answers: Mutex<VecDeque<Option<PathBuf>>>,
    documents: Mutex<Option<PathBuf>>,
    /// Calls that fail from now on: "emit", "notify", "reveal", "open_dir",
    /// "tray", "status".
    failing: Mutex<Vec<&'static str>>,
}

impl FakePlatform {
    pub fn fail(&self, call: &'static str) {
        self.failing.lock().unwrap().push(call);
    }

    pub fn set_documents(&self, folder: &str) {
        *self.documents.lock().unwrap() = Some(PathBuf::from(folder));
    }

    pub fn answer(&self, answer: Option<PathBuf>) {
        self.dialog_answers.lock().unwrap().push_back(answer);
    }

    pub fn recorded(&self) -> std::sync::MutexGuard<'_, Recorded> {
        self.recorded.lock().unwrap()
    }

    pub fn event_names(&self) -> Vec<String> {
        self.recorded()
            .events
            .iter()
            .map(|(name, _)| name.clone())
            .collect()
    }

    fn check(&self, call: &str) -> Result<(), String> {
        match self.failing.lock().unwrap().contains(&call) {
            true => Err(format!("{} failed", call)),
            false => Ok(()),
        }
    }

    fn next_answer(&self) -> Option<PathBuf> {
        self.dialog_answers.lock().unwrap().pop_front().flatten()
    }
}

impl Platform for FakePlatform {
    fn emit(&self, event: &str, payload: &Value) -> Result<(), String> {
        self.check("emit")?;
        self.recorded()
            .events
            .push((event.to_string(), payload.clone()));
        Ok(())
    }

    fn notify(&self, title: &str, body: &str, sound: bool) -> Result<(), String> {
        self.check("notify")?;
        self.recorded()
            .notifications
            .push((title.to_string(), body.to_string(), sound));
        Ok(())
    }

    fn pick_save_file(&self, dialog: &SaveDialog) -> Option<PathBuf> {
        self.recorded().save_dialogs.push(dialog.clone());
        self.next_answer()
    }

    fn pick_json_file(&self, title: &str) -> Option<PathBuf> {
        self.recorded().open_dialogs.push(title.to_string());
        self.next_answer()
    }

    fn pick_folder(&self, title: &str) -> Option<PathBuf> {
        self.recorded().folder_dialogs.push(title.to_string());
        self.next_answer()
    }

    fn documents_dir(&self) -> Result<PathBuf, String> {
        self.documents
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "no Documents folder".to_string())
    }

    fn reveal(&self, path: &Path) -> Result<(), String> {
        self.check("reveal")?;
        self.recorded().revealed.push(path.to_path_buf());
        Ok(())
    }

    fn open_dir(&self, path: &Path) -> Result<(), String> {
        self.check("open_dir")?;
        self.recorded().opened.push(path.to_path_buf());
        Ok(())
    }

    fn show_main_window(&self) {
        self.recorded().windows_shown += 1;
    }

    fn render_tray(&self, menu: &TrayMenu) -> Result<(), String> {
        self.check("tray")?;
        self.recorded().menus.push(menu.clone());
        Ok(())
    }

    fn set_tray_status(&self, status: &TrayStatus) -> Result<(), String> {
        self.check("status")?;
        self.recorded().statuses.push(status.clone());
        Ok(())
    }

    fn has_tray(&self) -> bool {
        !self.recorded().menus.is_empty()
    }

    fn app_version(&self) -> String {
        "1.2.3".to_string()
    }

    fn restart(&self) {
        self.recorded().restarts += 1;
    }
}

/// The keychain, in memory. `fail()` makes every call fail from then on.
#[derive(Default)]
pub struct MemorySecrets {
    secrets: Mutex<HashMap<String, String>>,
    failing: Mutex<bool>,
}

impl MemorySecrets {
    pub fn fail(&self) {
        *self.failing.lock().unwrap() = true;
    }

    fn check(&self) -> Result<std::sync::MutexGuard<'_, HashMap<String, String>>, String> {
        match *self.failing.lock().unwrap() {
            true => Err("the keychain is locked".to_string()),
            false => Ok(self.secrets.lock().unwrap()),
        }
    }
}

impl SecretStore for MemorySecrets {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        Ok(self.check()?.get(name).cloned())
    }

    fn set(&self, name: &str, secret: &str) -> Result<(), String> {
        self.check()?.insert(name.to_string(), secret.to_string());
        Ok(())
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        self.check()?.remove(name);
        Ok(())
    }
}
