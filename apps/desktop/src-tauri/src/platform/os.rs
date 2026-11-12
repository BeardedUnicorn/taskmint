//! The Platform the app runs on: Tauri's window, dialogs, opener,
//! notifications, tray and updater. It needs a real UI session, so the coverage
//! policy leaves it to the manual QA checklist: keep it to calls, with any
//! decision made in the code that uses it.
//!
//! The tray, the folder picker and the updater exist only on a desktop. On
//! Android and iOS `mobile::DesktopParts` stands in for them and reports
//! each one missing: there's then no tray (tray::start), and the webview
//! leaves out the features that need the others (apps/desktop/src/tauriBackend.ts).
//!
//! The Save and Open dialogs pick a path on a desktop, and on Android a
//! document (a content:// address) that the fs plugin opens for the app.

use super::{
    AvailableUpdate, DownloadEvent, PickedFile, Platform, SaveDialog, ScheduledNotification,
};
use crate::tray::model::{TrayMenu, TrayStatus};
use serde_json::Value;
use std::fs::File;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(desktop)]
use desktop::DesktopParts;
#[cfg(mobile)]
use mobile::DesktopParts;

/// The system sound a notification plays when sound is on (Android plays
/// its default for a name it has no sound for).
const SOUND: &str = if cfg!(target_os = "macos") {
    "Glass"
} else if cfg!(target_os = "linux") {
    "message-new-instant"
} else {
    "Default"
};

pub struct TauriPlatform {
    app: AppHandle,
    desktop: DesktopParts,
}

impl TauriPlatform {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            #[cfg(desktop)]
            desktop: DesktopParts::default(),
            #[cfg(mobile)]
            desktop: DesktopParts,
        }
    }
}

fn text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// What a dialog picked: a path, or a document's address.
fn picked(file: FilePath) -> PickedFile {
    match file {
        FilePath::Path(path) => PickedFile::Path(path),
        FilePath::Url(url) => PickedFile::Document(url),
    }
}

/// Opens a picked file to write (emptied first) or to read. A desktop's
/// dialogs only pick paths.
#[cfg(desktop)]
fn open_picked_file(_app: &AppHandle, file: &PickedFile, write: bool) -> std::io::Result<File> {
    match file {
        PickedFile::Path(path) if write => File::create(path),
        PickedFile::Path(path) => File::open(path),
        PickedFile::Document(url) => Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            format!("{} isn't a file on this computer", url),
        )),
    }
}

/// Opens a picked file to write (emptied first) or to read: the fs plugin
/// asks the system for a document's file.
#[cfg(mobile)]
fn open_picked_file(app: &AppHandle, file: &PickedFile, write: bool) -> std::io::Result<File> {
    use tauri_plugin_fs::{FsExt, OpenOptions};
    let path = match file {
        PickedFile::Path(path) => FilePath::Path(path.clone()),
        PickedFile::Document(url) => FilePath::Url(url.clone()),
    };
    let mut options = OpenOptions::new();
    match write {
        true => options.write(true).create(true).truncate(true),
        false => options.read(true),
    };
    app.fs().open(path, options)
}

/// A phone's alarm: the system shows the notification at its time, with the
/// app closed, and in Doze too.
#[cfg(mobile)]
fn schedule_os_notification(
    app: &AppHandle,
    scheduled: &ScheduledNotification,
) -> Result<(), String> {
    use tauri_plugin_notification::Schedule;
    let nanos = i128::from(scheduled.at.timestamp_millis()) * 1_000_000;
    let date = time::OffsetDateTime::from_unix_timestamp_nanos(nanos).map_err(text)?;
    let mut builder = app
        .notification()
        .builder()
        .id(scheduled.id)
        .title(&scheduled.title)
        .body(&scheduled.body)
        // Shown expanded too (see notify)
        .large_body(&scheduled.body)
        .schedule(Schedule::At {
            date,
            repeating: false,
            allow_while_idle: true,
        });
    if scheduled.sound {
        builder = builder.sound(SOUND);
    }
    builder.show().map_err(text)
}

#[cfg(mobile)]
fn cancel_os_notification(app: &AppHandle, id: i32) -> Result<(), String> {
    app.notification().cancel(vec![id]).map_err(text)
}

/// A desktop's reminders are timed by the app while it runs, so the system
/// is never asked to set one.
#[cfg(desktop)]
fn schedule_os_notification(
    _app: &AppHandle,
    _scheduled: &ScheduledNotification,
) -> Result<(), String> {
    Err("Scheduled notifications are only set on a phone or tablet.".to_string())
}

/// Nothing is ever set on a desktop, so there's nothing to take back.
#[cfg(desktop)]
fn cancel_os_notification(_app: &AppHandle, _id: i32) -> Result<(), String> {
    Ok(())
}

/// The tray, the folder picker and the updater.
#[cfg(desktop)]
mod desktop {
    use super::text;
    use crate::config::{
        ICON_TRAY_FALLBACK, ICON_TRAY_PRIMARY, ICON_TRAY_TEMPLATE, TRAY_TOOLTIP_APP_NAME,
    };
    use crate::platform::{AvailableUpdate, DownloadEvent};
    use crate::tray::model::{TrayItem, TrayMenu, TrayStatus};
    use std::future::Future;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use tauri::image::Image;
    use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
    use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
    use tauri::{AppHandle, Manager, Wry};
    use tauri_plugin_dialog::DialogExt;
    use tauri_plugin_updater::{Update, UpdaterExt};

    #[derive(Default)]
    pub struct DesktopParts {
        tray: Mutex<Option<TrayIcon>>,
        /// The update the last check found, for install_update.
        update: Mutex<Option<Update>>,
    }

    /// Runs one of the updater's futures to its end. dispatch already runs on
    /// the async runtime, where block_on panics, so it gets a thread of its own.
    fn finish<T: Send>(future: impl Future<Output = T> + Send) -> T {
        std::thread::scope(|scope| {
            scope
                .spawn(|| tauri::async_runtime::block_on(future))
                .join()
                .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
        })
    }

    fn menu_item(app: &AppHandle, item: &TrayItem) -> tauri::Result<Box<dyn IsMenuItem<Wry>>> {
        Ok(match item {
            TrayItem::Label(label) => Box::new(MenuItem::new(app, label, false, None::<&str>)?),
            // with_id: MenuItem::new's last argument is an accelerator, not an id
            TrayItem::Action { id, label } => {
                Box::new(MenuItem::with_id(app, id, label, true, None::<&str>)?)
            }
            TrayItem::Separator => Box::new(PredefinedMenuItem::separator(app)?),
            TrayItem::Submenu { label, items } => {
                let submenu = Submenu::new(app, label, true)?;
                for item in items {
                    submenu.append(menu_item(app, item)?.as_ref())?;
                }
                Box::new(submenu)
            }
            TrayItem::Quit => Box::new(PredefinedMenuItem::quit(app, Some("Quit"))?),
        })
    }

    fn build_menu(app: &AppHandle, menu: &TrayMenu) -> tauri::Result<Menu<Wry>> {
        let built = Menu::new(app)?;
        for item in &menu.0 {
            built.append(menu_item(app, item)?.as_ref())?;
        }
        Ok(built)
    }

    /// macOS's one-color menu-bar icon (None elsewhere, or if it won't load).
    fn tray_template() -> Option<Image<'static>> {
        if !cfg!(target_os = "macos") {
            return None;
        }
        Image::from_bytes(include_bytes!("../../icons/tray-template.png"))
            .inspect_err(|e| log::error!("Failed to load {}: {:?}", ICON_TRAY_TEMPLATE, e))
            .ok()
    }

    fn tray_icon() -> tauri::Result<Image<'static>> {
        Image::from_bytes(include_bytes!("../../icons/32x32.png")).or_else(|e| {
            log::error!(
                "Failed to load {}: {:?}; trying {}",
                ICON_TRAY_PRIMARY,
                e,
                ICON_TRAY_FALLBACK
            );
            Image::from_bytes(include_bytes!("../../icons/icon.png"))
        })
    }

    impl DesktopParts {
        /// The tray icon's handle, taken out of the lock: Tauri runs tray calls
        /// on the main thread and waits for them, so holding the lock through
        /// one would deadlock against a menu click handled there.
        fn tray(&self) -> Option<TrayIcon> {
            self.tray.lock().unwrap_or_else(|e| e.into_inner()).clone()
        }

        pub fn pick_folder(&self, app: &AppHandle, title: &str) -> Option<PathBuf> {
            app.dialog()
                .file()
                .set_title(title)
                .blocking_pick_folder()
                .map(|path| PathBuf::from(path.to_string()))
        }

        pub fn render_tray(&self, app: &AppHandle, menu: &TrayMenu) -> Result<(), String> {
            let built = build_menu(app, menu).map_err(text)?;
            if let Some(tray) = self.tray() {
                return tray.set_menu(Some(built)).map_err(text);
            }
            let handle = app.clone();
            let builder = match tray_template() {
                Some(template) => TrayIconBuilder::new().icon(template).icon_as_template(true),
                None => TrayIconBuilder::new().icon(tray_icon().map_err(text)?),
            };
            let icon = builder
                .menu(&built)
                .tooltip(TRAY_TOOLTIP_APP_NAME)
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.show().and_then(|()| window.set_focus());
                        }
                    }
                })
                .build(app)
                .map_err(text)?;
            *self.tray.lock().unwrap_or_else(|e| e.into_inner()) = Some(icon);
            Ok(())
        }

        pub fn set_tray_status(&self, status: &TrayStatus) -> Result<(), String> {
            let Some(tray) = self.tray() else {
                return Err("there's no tray icon".to_string());
            };
            tray.set_tooltip(Some(&status.tooltip)).map_err(text)?;
            // macOS shows a title beside the icon
            if cfg!(target_os = "macos") {
                tray.set_title(status.title.as_deref()).map_err(text)?;
            }
            Ok(())
        }

        pub fn has_tray(&self) -> bool {
            self.tray().is_some()
        }

        pub fn check_update(&self, app: &AppHandle) -> Result<Option<AvailableUpdate>, String> {
            let updater = app.updater().map_err(text)?;
            let found = finish(updater.check()).map_err(text)?;
            let available = found.as_ref().map(|update| AvailableUpdate {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                notes: update.body.clone(),
                date: update.raw_json["pub_date"].as_str().map(str::to_string),
            });
            *self.update.lock().unwrap_or_else(|e| e.into_inner()) = found;
            Ok(available)
        }

        pub fn install_update(
            &self,
            progress: &mut (dyn FnMut(DownloadEvent) + Send),
        ) -> Result<(), String> {
            // A development build's executable isn't an installed app, so the
            // updater would replace the wrong thing
            if cfg!(debug_assertions) {
                return Err(
                    "A development build can't install updates. Build the app to try one."
                        .to_string(),
                );
            }
            let update = self
                .update
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            let update = update.ok_or("Check for updates first.")?;
            // Both callbacks report to `progress`, one at a time
            let progress = Mutex::new(progress);
            let report = |event| (progress.lock().unwrap_or_else(|e| e.into_inner()))(event);
            finish(update.download_and_install(
                |bytes, total| {
                    report(DownloadEvent::Chunk {
                        bytes: bytes as u64,
                        total,
                    })
                },
                || report(DownloadEvent::Downloaded),
            ))
            .map_err(text)
        }
    }
}

/// A phone's or tablet's stand-in for the desktop parts: none of them is
/// there.
#[cfg(mobile)]
mod mobile {
    use crate::platform::{AvailableUpdate, DownloadEvent};
    use crate::tray::model::{TrayMenu, TrayStatus};
    use std::path::PathBuf;
    use tauri::AppHandle;

    pub struct DesktopParts;

    fn missing(what: &str) -> String {
        format!("{} isn't available on a phone or tablet.", what)
    }

    impl DesktopParts {
        pub fn pick_folder(&self, _app: &AppHandle, _title: &str) -> Option<PathBuf> {
            None
        }

        pub fn render_tray(&self, _app: &AppHandle, _menu: &TrayMenu) -> Result<(), String> {
            Err(missing("The system tray"))
        }

        pub fn set_tray_status(&self, _status: &TrayStatus) -> Result<(), String> {
            Err(missing("The system tray"))
        }

        pub fn has_tray(&self) -> bool {
            false
        }

        pub fn check_update(&self, _app: &AppHandle) -> Result<Option<AvailableUpdate>, String> {
            Err(missing("Updating from TaskMint's releases"))
        }

        pub fn install_update(
            &self,
            _progress: &mut (dyn FnMut(DownloadEvent) + Send),
        ) -> Result<(), String> {
            Err(missing("Updating from TaskMint's releases"))
        }
    }
}

impl Platform for TauriPlatform {
    fn emit(&self, event: &str, payload: &Value) -> Result<(), String> {
        self.app.emit(event, payload).map_err(text)
    }

    fn notify(&self, title: &str, body: &str, sound: bool) -> Result<(), String> {
        // The large body is Android's: without it the plugin's empty inbox
        // style hides the text whenever the notification is expanded
        // (desktops ignore it)
        let mut builder = self
            .app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .large_body(body);
        if sound {
            builder = builder.sound(SOUND);
        }
        builder.show().map_err(text)
    }

    fn schedule_notification(&self, scheduled: &ScheduledNotification) -> Result<(), String> {
        schedule_os_notification(&self.app, scheduled)
    }

    fn cancel_notification(&self, id: i32) -> Result<(), String> {
        cancel_os_notification(&self.app, id)
    }

    fn pick_save_file(&self, dialog: &SaveDialog) -> Option<PickedFile> {
        self.app
            .dialog()
            .file()
            .set_title(dialog.title)
            .add_filter(dialog.filter_name, &[dialog.extension])
            .set_file_name(&dialog.file_name)
            .blocking_save_file()
            .map(picked)
    }

    fn pick_json_file(&self, title: &str) -> Option<PickedFile> {
        self.app
            .dialog()
            .file()
            .set_title(title)
            .add_filter("JSON Files", &["json"])
            .blocking_pick_file()
            .map(picked)
    }

    fn create_picked(&self, file: &PickedFile) -> std::io::Result<File> {
        open_picked_file(&self.app, file, true)
    }

    fn open_picked(&self, file: &PickedFile) -> std::io::Result<File> {
        open_picked_file(&self.app, file, false)
    }

    fn pick_folder(&self, title: &str) -> Option<PathBuf> {
        self.desktop.pick_folder(&self.app, title)
    }

    fn documents_dir(&self) -> Result<PathBuf, String> {
        self.app.path().document_dir().map_err(text)
    }

    fn reveal(&self, path: &Path) -> Result<(), String> {
        self.app.opener().reveal_item_in_dir(path).map_err(text)
    }

    fn open_dir(&self, path: &Path) -> Result<(), String> {
        self.app
            .opener()
            .open_path(path.to_string_lossy(), None::<String>)
            .map_err(text)
    }

    fn open_url(&self, url: &str) -> Result<(), String> {
        self.app
            .opener()
            .open_url(url, None::<String>)
            .map_err(text)
    }

    fn show_main_window(&self) {
        let Some(window) = self.app.get_webview_window("main") else {
            log::error!("Main window not found");
            return;
        };
        // Focusing does nothing to a minimized window (tao), so restore it first
        if let Err(e) = window
            .unminimize()
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus())
        {
            log::error!("Failed to bring the window forward: {}", e);
        }
    }

    fn render_tray(&self, menu: &TrayMenu) -> Result<(), String> {
        self.desktop.render_tray(&self.app, menu)
    }

    fn set_tray_status(&self, status: &TrayStatus) -> Result<(), String> {
        self.desktop.set_tray_status(status)
    }

    fn has_tray(&self) -> bool {
        self.desktop.has_tray()
    }

    fn app_version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    fn restart(&self) {
        self.app.restart()
    }

    fn check_update(&self) -> Result<Option<AvailableUpdate>, String> {
        self.desktop.check_update(&self.app)
    }

    fn install_update(
        &self,
        progress: &mut (dyn FnMut(DownloadEvent) + Send),
    ) -> Result<(), String> {
        self.desktop.install_update(progress)
    }
}
