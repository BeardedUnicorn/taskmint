//! The Platform the app runs on: Tauri's window, dialogs, opener,
//! notifications, tray and updater. It needs a real UI session, so the coverage
//! policy leaves it to the manual QA checklist: keep it to calls, with any
//! decision made in the code that uses it.

use super::{AvailableUpdate, DownloadEvent, Platform, SaveDialog};
use crate::config::{
    ICON_TRAY_FALLBACK, ICON_TRAY_PRIMARY, ICON_TRAY_TEMPLATE, TRAY_TOOLTIP_APP_NAME,
};
use crate::tray::model::{TrayItem, TrayMenu, TrayStatus};
use serde_json::Value;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

/// The system sound a notification plays when sound is on.
const SOUND: &str = if cfg!(target_os = "macos") {
    "Glass"
} else if cfg!(target_os = "linux") {
    "message-new-instant"
} else {
    "Default"
};

pub struct TauriPlatform {
    app: AppHandle,
    tray: Mutex<Option<TrayIcon>>,
    /// The update the last check found, for install_update.
    update: Mutex<Option<Update>>,
}

impl TauriPlatform {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            tray: Mutex::new(None),
            update: Mutex::new(None),
        }
    }

    /// The tray icon's handle, taken out of the lock: Tauri runs tray calls
    /// on the main thread and waits for them, so holding the lock through
    /// one would deadlock against a menu click handled there.
    fn tray(&self) -> Option<TrayIcon> {
        self.tray.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

fn text(error: impl std::fmt::Display) -> String {
    error.to_string()
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

impl Platform for TauriPlatform {
    fn emit(&self, event: &str, payload: &Value) -> Result<(), String> {
        self.app.emit(event, payload).map_err(text)
    }

    fn notify(&self, title: &str, body: &str, sound: bool) -> Result<(), String> {
        let mut builder = self.app.notification().builder().title(title).body(body);
        if sound {
            builder = builder.sound(SOUND);
        }
        builder.show().map_err(text)
    }

    fn pick_save_file(&self, dialog: &SaveDialog) -> Option<PathBuf> {
        self.app
            .dialog()
            .file()
            .set_title(dialog.title)
            .add_filter(dialog.filter_name, &[dialog.extension])
            .set_file_name(&dialog.file_name)
            .blocking_save_file()
            .map(|path| PathBuf::from(path.to_string()))
    }

    fn pick_json_file(&self, title: &str) -> Option<PathBuf> {
        self.app
            .dialog()
            .file()
            .set_title(title)
            .add_filter("JSON Files", &["json"])
            .blocking_pick_file()
            .map(|path| PathBuf::from(path.to_string()))
    }

    fn pick_folder(&self, title: &str) -> Option<PathBuf> {
        self.app
            .dialog()
            .file()
            .set_title(title)
            .blocking_pick_folder()
            .map(|path| PathBuf::from(path.to_string()))
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

    fn show_main_window(&self) {
        let Some(window) = self.app.get_webview_window("main") else {
            log::error!("Main window not found");
            return;
        };
        if let Err(e) = window.show().and_then(|()| window.set_focus()) {
            log::error!("Failed to bring the window forward: {}", e);
        }
    }

    fn render_tray(&self, menu: &TrayMenu) -> Result<(), String> {
        let built = build_menu(&self.app, menu).map_err(text)?;
        if let Some(tray) = self.tray() {
            return tray.set_menu(Some(built)).map_err(text);
        }
        let app = self.app.clone();
        let builder = match tray_template() {
            Some(template) => TrayIconBuilder::new().icon(template).icon_as_template(true),
            None => TrayIconBuilder::new().icon(tray_icon().map_err(text)?),
        };
        let icon = builder
            .menu(&built)
            .tooltip(TRAY_TOOLTIP_APP_NAME)
            .on_tray_icon_event(move |_tray, event| {
                if let TrayIconEvent::DoubleClick { .. } = event {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show().and_then(|()| window.set_focus());
                    }
                }
            })
            .build(&self.app)
            .map_err(text)?;
        *self.tray.lock().unwrap_or_else(|e| e.into_inner()) = Some(icon);
        Ok(())
    }

    fn set_tray_status(&self, status: &TrayStatus) -> Result<(), String> {
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

    fn has_tray(&self) -> bool {
        self.tray().is_some()
    }

    fn app_version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    fn restart(&self) {
        self.app.restart()
    }

    fn check_update(&self) -> Result<Option<AvailableUpdate>, String> {
        let updater = self.app.updater().map_err(text)?;
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

    fn install_update(
        &self,
        progress: &mut (dyn FnMut(DownloadEvent) + Send),
    ) -> Result<(), String> {
        // A development build's executable isn't an installed app, so the
        // updater would replace the wrong thing
        if cfg!(debug_assertions) {
            return Err(
                "A development build can't install updates. Build the app to try one.".to_string(),
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
