//! A Platform for tests: it records what the shell asked of it, and answers
//! dialogs with what the test queued. A picked document (Android's) is a
//! file the test names, or one it can't open.

use super::{
    AvailableUpdate, DownloadEvent, PickedFile, Platform, SaveDialog, ScheduledNotification,
};
use crate::app_menu::model::{Action, AppMenu};
use crate::tray::model::{TrayMenu, TrayStatus};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct Recorded {
    pub events: Vec<(String, Value)>,
    pub notifications: Vec<(String, String, bool)>,
    /// Set for later, in order; a cancel doesn't remove one.
    pub scheduled: Vec<ScheduledNotification>,
    pub cancelled: Vec<i32>,
    pub save_dialogs: Vec<SaveDialog>,
    pub open_dialogs: Vec<String>,
    pub folder_dialogs: Vec<String>,
    pub revealed: Vec<PathBuf>,
    pub opened: Vec<PathBuf>,
    pub opened_urls: Vec<String>,
    pub windows_shown: usize,
    pub menus: Vec<TrayMenu>,
    pub statuses: Vec<TrayStatus>,
    /// The menu bars put up, and each in-place update to one.
    pub app_menus: Vec<AppMenu>,
    pub app_menu_updates: Vec<Vec<Action>>,
    pub restarts: usize,
    pub update_checks: usize,
    pub updates_installed: usize,
}

#[derive(Default)]
pub struct FakePlatform {
    pub recorded: Mutex<Recorded>,
    /// Answers for the next dialogs, in order (None: dismissed).
    pub dialog_answers: Mutex<VecDeque<Option<PickedFile>>>,
    /// The file behind each picked document the system lets the app open.
    document_files: Mutex<HashMap<url::Url, PathBuf>>,
    documents: Mutex<Option<PathBuf>>,
    /// What the update feed announces.
    update: Mutex<Option<AvailableUpdate>>,
    /// How an update's download goes, in order.
    download: Mutex<Vec<DownloadEvent>>,
    /// Where the logs go; None: the system has no place for them.
    log_dir: Mutex<Option<PathBuf>>,
    /// Calls that fail from now on: "emit", "notify", "schedule", "cancel",
    /// "reveal", "open_dir", "open_url",
    /// "tray", "status", "app_menu", "app_menu_update", "check_update",
    /// "install_update" (after its download).
    failing: Mutex<Vec<&'static str>>,
}

impl FakePlatform {
    pub fn fail(&self, call: &'static str) {
        self.failing.lock().unwrap().push(call);
    }

    /// `call` works again.
    pub fn heal(&self, call: &'static str) {
        self.failing
            .lock()
            .unwrap()
            .retain(|failing| *failing != call);
    }

    pub fn set_documents(&self, folder: &str) {
        *self.documents.lock().unwrap() = Some(PathBuf::from(folder));
    }

    pub fn answer(&self, answer: Option<PathBuf>) {
        self.dialog_answers
            .lock()
            .unwrap()
            .push_back(answer.map(PickedFile::Path));
    }

    /// The next dialog picks the document `uri`, kept in `file` (None: one
    /// the app can't open).
    pub fn answer_document(&self, uri: &str, file: Option<PathBuf>) {
        let url = url::Url::parse(uri).unwrap();
        if let Some(file) = file {
            self.document_files
                .lock()
                .unwrap()
                .insert(url.clone(), file);
        }
        self.dialog_answers
            .lock()
            .unwrap()
            .push_back(Some(PickedFile::Document(url)));
    }

    /// The logs go in `folder` from now on.
    pub fn set_log_dir(&self, folder: &Path) {
        *self.log_dir.lock().unwrap() = Some(folder.to_path_buf());
    }

    /// The update feed announces `update` from now on.
    pub fn announce(&self, update: Option<AvailableUpdate>) {
        *self.update.lock().unwrap() = update;
    }

    /// An update's download goes like `events`.
    pub fn download_goes(&self, events: Vec<DownloadEvent>) {
        *self.download.lock().unwrap() = events;
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

    fn next_answer(&self) -> Option<PickedFile> {
        self.dialog_answers.lock().unwrap().pop_front().flatten()
    }

    /// The file a picked file is, as the system would open it.
    fn resolve(&self, file: &PickedFile) -> std::io::Result<PathBuf> {
        match file {
            PickedFile::Path(path) => Ok(path.clone()),
            PickedFile::Document(url) => self
                .document_files
                .lock()
                .unwrap()
                .get(url)
                .cloned()
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        format!("no access to {}", url),
                    )
                }),
        }
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

    fn schedule_notification(&self, scheduled: &ScheduledNotification) -> Result<(), String> {
        self.check("schedule")?;
        self.recorded().scheduled.push(scheduled.clone());
        Ok(())
    }

    fn cancel_notification(&self, id: i32) -> Result<(), String> {
        self.check("cancel")?;
        self.recorded().cancelled.push(id);
        Ok(())
    }

    fn pick_save_file(&self, dialog: &SaveDialog) -> Option<PickedFile> {
        self.recorded().save_dialogs.push(dialog.clone());
        self.next_answer()
    }

    fn pick_json_file(&self, title: &str) -> Option<PickedFile> {
        self.recorded().open_dialogs.push(title.to_string());
        self.next_answer()
    }

    fn create_picked(&self, file: &PickedFile) -> std::io::Result<File> {
        File::create(self.resolve(file)?)
    }

    fn open_picked(&self, file: &PickedFile) -> std::io::Result<File> {
        File::open(self.resolve(file)?)
    }

    fn pick_folder(&self, title: &str) -> Option<PathBuf> {
        self.recorded().folder_dialogs.push(title.to_string());
        self.next_answer()
            .and_then(|folder| self.resolve(&folder).ok())
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

    fn open_url(&self, url: &str) -> Result<(), String> {
        self.check("open_url")?;
        self.recorded().opened_urls.push(url.to_string());
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

    fn render_app_menu(&self, menu: &AppMenu) -> Result<(), String> {
        self.check("app_menu")?;
        self.recorded().app_menus.push(menu.clone());
        Ok(())
    }

    fn update_app_menu(&self, actions: &[Action]) -> Result<(), String> {
        self.check("app_menu_update")?;
        self.recorded().app_menu_updates.push(actions.to_vec());
        Ok(())
    }

    fn app_version(&self) -> String {
        "1.2.3".to_string()
    }

    fn log_dir(&self) -> Result<PathBuf, String> {
        self.log_dir
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "no log folder".to_string())
    }

    fn restart(&self) {
        self.recorded().restarts += 1;
    }

    fn check_update(&self) -> Result<Option<AvailableUpdate>, String> {
        self.check("check_update")?;
        self.recorded().update_checks += 1;
        Ok(self.update.lock().unwrap().clone())
    }

    fn install_update(
        &self,
        progress: &mut (dyn FnMut(DownloadEvent) + Send),
    ) -> Result<(), String> {
        let events = self.download.lock().unwrap().clone();
        events.into_iter().for_each(&mut *progress);
        self.check("install_update")?;
        self.recorded().updates_installed += 1;
        Ok(())
    }
}
