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
    AvailableUpdate, Channel, DownloadEvent, PickedFile, Platform, SaveDialog,
    ScheduledNotification, ShownNotification,
};
use crate::app_menu::model::{Action, AppMenu};
use crate::timer_notice::TimerNotice;
use crate::tray::model::{TrayMenu, TrayStatus};
use serde_json::Value;
use std::fs::File;
use std::path::{Path, PathBuf};
use taskmint_core::shell::MenuCommand;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_notification::{NotificationBuilder, NotificationExt};
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

/// Android's id for each channel (its name and description are in
/// create_channels).
#[cfg(target_os = "android")]
fn channel_id(channel: Channel) -> &'static str {
    match channel {
        Channel::Timer => "timer",
        Channel::Reminders => "reminders",
        Channel::Activity => "activity",
    }
}

/// Puts a notification in its channel (Android's; a desktop has none) and
/// says what tapping it opens, which the tap reports back (app.rs).
fn routed<R: tauri::Runtime>(
    builder: NotificationBuilder<R>,
    _channel: Channel,
    opens: Option<MenuCommand>,
) -> NotificationBuilder<R> {
    #[cfg(target_os = "android")]
    let builder = builder.channel_id(channel_id(_channel));
    match opens {
        Some(command) => builder.extra(OPENS, command),
        None => builder,
    }
}

/// The key of the notification's extra data that says what tapping it opens.
pub const OPENS: &str = "opens";

/// Creates TaskMint's channels, which the phone's settings list under the
/// app: the system drops a notification for a channel that doesn't exist.
/// Also deletes the notification plugin's own "Default" channel, which
/// nothing uses; the plugin makes it again each time the app starts, so this
/// runs once per start, after the plugin has (prepare_notifications).
#[cfg(target_os = "android")]
fn create_channels(app: &AppHandle) {
    use tauri_plugin_notification::{Channel as Group, Importance};
    let groups = [
        // Quiet: no sound, no pop-up, only in the shade and the status bar
        Group::builder(channel_id(Channel::Timer), "Running timer")
            .description("The timer while it runs, with buttons to pause or stop it")
            .importance(Importance::Low)
            .build(),
        Group::builder(channel_id(Channel::Reminders), "Reminders")
            .description("Withdrawals, your daily goal and summary, and a timer left running")
            .importance(Importance::High)
            .vibration(true)
            .build(),
        Group::builder(channel_id(Channel::Activity), "Activity")
            .description("Work logs captured, backups and errors")
            .importance(Importance::Default)
            .build(),
    ];
    for group in groups {
        if let Err(e) = app.notification().create_channel(group) {
            log::error!("Failed to create a notification channel: {}", e);
        }
    }
    if let Err(e) = app.notification().delete_channel("default") {
        log::error!("Failed to delete the default notification channel: {}", e);
    }
}

/// The running timer's notification (a phone's): its task, the system's
/// clock counting up while it runs, and its buttons. Showing it again
/// replaces it in place.
#[cfg(mobile)]
fn set_os_timer_notice(app: &AppHandle, notice: Option<&TimerNotice>) -> Result<(), String> {
    use crate::timer_notice::TIMER_NOTICE_ID;
    let Some(notice) = notice else {
        return app
            .notification()
            .remove_active(vec![TIMER_NOTICE_ID])
            .map_err(text);
    };
    add_timer_buttons(app);
    let buttons = match notice.is_paused() {
        true => PAUSED_BUTTONS,
        false => RUNNING_BUTTONS,
    };
    let builder = app
        .notification()
        .builder()
        .id(TIMER_NOTICE_ID)
        .title(&notice.task_name)
        .body(&notice.text)
        // Shown expanded too (see notify)
        .large_body(&notice.text)
        .ongoing()
        .action_type_id(buttons);
    let mut builder = routed(builder, Channel::Timer, None);
    if let Some(from) = notice.counting_from {
        builder = builder.when(from.timestamp_millis()).uses_chronometer();
    }
    builder.show().map_err(text)
}

/// A desktop has the tray instead.
#[cfg(desktop)]
fn set_os_timer_notice(_app: &AppHandle, _notice: Option<&TimerNotice>) -> Result<(), String> {
    Ok(())
}

/// The running timer's buttons (and a paused one's), by the id the
/// notification names them with.
#[cfg(mobile)]
const RUNNING_BUTTONS: &str = "timer-running";
#[cfg(mobile)]
const PAUSED_BUTTONS: &str = "timer-paused";

/// Tells the system the timer notification's buttons, the first time it's
/// shown (the plugin keeps them for the app's run).
#[cfg(mobile)]
fn add_timer_buttons(app: &AppHandle) {
    use crate::timer_notice::{PAUSE, RESUME, STOP, SWITCH};
    use tauri_plugin_notification::{Action as Button, ActionType as Buttons};
    static ADDED: std::sync::Once = std::sync::Once::new();
    ADDED.call_once(|| {
        let buttons = |id: &str, first: Button| {
            Buttons::builder(id)
                .actions(vec![
                    first,
                    Button::builder(SWITCH, "Switch task").build(),
                    Button::builder(STOP, "Stop").build(),
                ])
                .build()
        };
        let types = vec![
            buttons(RUNNING_BUTTONS, Button::builder(PAUSE, "Pause").build()),
            buttons(PAUSED_BUTTONS, Button::builder(RESUME, "Resume").build()),
        ];
        if let Err(e) = app.notification().register_action_types(types) {
            log::error!("Failed to add the timer notification's buttons: {}", e);
        }
    });
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
    let builder = app
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
    let mut builder = routed(builder, scheduled.channel, scheduled.opens);
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
    use crate::app_menu::model::{Action, AppMenu, AppMenuItem, Predefined, SubmenuRole};
    use crate::config::{
        ICON_TRAY_FALLBACK, ICON_TRAY_PRIMARY, ICON_TRAY_TEMPLATE, TRAY_TOOLTIP_APP_NAME,
    };
    use crate::platform::{AvailableUpdate, DownloadEvent};
    use crate::tray::model::{TrayItem, TrayMenu, TrayStatus};
    use std::collections::HashMap;
    use std::future::Future;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use tauri::image::Image;
    use tauri::menu::{
        IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
    };
    use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
    use tauri::{AppHandle, Manager, Wry};
    use tauri_plugin_dialog::DialogExt;
    use tauri_plugin_updater::{Update, UpdaterExt};

    #[derive(Default)]
    pub struct DesktopParts {
        tray: Mutex<Option<TrayIcon>>,
        /// The menu bar's items the app answers, to relabel in place.
        app_menu: Mutex<AppMenuItems>,
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

    fn predefined(
        app: &AppHandle,
        kind: Predefined,
        label: Option<&str>,
    ) -> tauri::Result<PredefinedMenuItem<Wry>> {
        match kind {
            Predefined::Services => PredefinedMenuItem::services(app, label),
            Predefined::Hide => PredefinedMenuItem::hide(app, label),
            Predefined::HideOthers => PredefinedMenuItem::hide_others(app, label),
            Predefined::ShowAll => PredefinedMenuItem::show_all(app, label),
            Predefined::Quit => PredefinedMenuItem::quit(app, label),
            Predefined::CloseWindow => PredefinedMenuItem::close_window(app, label),
            Predefined::Undo => PredefinedMenuItem::undo(app, label),
            Predefined::Redo => PredefinedMenuItem::redo(app, label),
            Predefined::Cut => PredefinedMenuItem::cut(app, label),
            Predefined::Copy => PredefinedMenuItem::copy(app, label),
            Predefined::Paste => PredefinedMenuItem::paste(app, label),
            Predefined::SelectAll => PredefinedMenuItem::select_all(app, label),
            Predefined::Fullscreen => PredefinedMenuItem::fullscreen(app, label),
            Predefined::Minimize => PredefinedMenuItem::minimize(app, label),
            Predefined::Zoom => PredefinedMenuItem::maximize(app, label),
            Predefined::BringAllToFront => PredefinedMenuItem::bring_all_to_front(app, label),
        }
    }

    /// The menu bar's items the app answers, by id.
    type AppMenuItems = HashMap<&'static str, MenuItem<Wry>>;

    /// The menu bar, and its items the app answers by id.
    fn build_app_menu(app: &AppHandle, menu: &AppMenu) -> tauri::Result<(Menu<Wry>, AppMenuItems)> {
        let bar = Menu::new(app)?;
        let mut actions = HashMap::new();
        for submenu in &menu.submenus {
            // macOS fills these in: the window list, Help's search field
            let built = match submenu.role {
                Some(SubmenuRole::Window) => {
                    Submenu::with_id(app, WINDOW_SUBMENU_ID, submenu.label, true)?
                }
                Some(SubmenuRole::Help) => {
                    Submenu::with_id(app, HELP_SUBMENU_ID, submenu.label, true)?
                }
                None => Submenu::new(app, submenu.label, true)?,
            };
            for item in &submenu.items {
                match item {
                    AppMenuItem::Action(action) => {
                        let item = MenuItem::with_id(
                            app,
                            action.id,
                            &action.label,
                            action.enabled,
                            action.accelerator.as_deref(),
                        )?;
                        built.append(&item)?;
                        actions.insert(action.id, item);
                    }
                    AppMenuItem::Predefined { kind, label } => {
                        built.append(&predefined(app, *kind, *label)?)?
                    }
                    AppMenuItem::Separator => built.append(&PredefinedMenuItem::separator(app)?)?,
                }
            }
            bar.append(&built)?;
        }
        Ok((bar, actions))
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

        pub fn render_app_menu(&self, app: &AppHandle, menu: &AppMenu) -> Result<(), String> {
            let (bar, actions) = build_app_menu(app, menu).map_err(text)?;
            app.set_menu(bar).map_err(text)?;
            *self.app_menu.lock().unwrap_or_else(|e| e.into_inner()) = actions;
            Ok(())
        }

        pub fn update_app_menu(&self, actions: &[Action]) -> Result<(), String> {
            for action in actions {
                // Out of the lock: menu calls run on the main thread and wait
                let item = self
                    .app_menu
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .get(action.id)
                    .cloned()
                    .ok_or_else(|| format!("the menu bar has no {}", action.id))?;
                item.set_text(&action.label).map_err(text)?;
                item.set_enabled(action.enabled).map_err(text)?;
            }
            Ok(())
        }

        pub fn check_update(&self, app: &AppHandle) -> Result<Option<AvailableUpdate>, String> {
            // A dev build has no update feed (tauri.conf.json): it never
            // updates itself into the real app
            let updater = app.updater().map_err(|error| match error {
                tauri_plugin_updater::Error::EmptyEndpoints => {
                    "Dev builds don't update: install a release to try updates.".to_string()
                }
                error => text(error),
            })?;
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
    use crate::app_menu::model::{Action, AppMenu};
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

        pub fn render_app_menu(&self, _app: &AppHandle, _menu: &AppMenu) -> Result<(), String> {
            Err(missing("The menu bar"))
        }

        pub fn update_app_menu(&self, _actions: &[Action]) -> Result<(), String> {
            Err(missing("The menu bar"))
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

/// Asks for permission to notify, unless the user already answered, and
/// runs `allowed` if they allow it.
#[cfg(mobile)]
fn ask_to_notify(app: &AppHandle, allowed: Box<dyn FnOnce() + Send>) {
    use tauri_plugin_notification::PermissionState;
    let notification = app.notification();
    match notification.permission_state() {
        Ok(PermissionState::Granted | PermissionState::Denied) => {}
        Ok(_) => match notification.request_permission() {
            Ok(PermissionState::Granted) => allowed(),
            Ok(_) => {}
            Err(e) => log::error!("Failed to ask for permission to notify: {}", e),
        },
        Err(e) => log::error!("Failed to read the permission to notify: {}", e),
    }
}

impl Platform for TauriPlatform {
    fn emit(&self, event: &str, payload: &Value) -> Result<(), String> {
        self.app.emit(event, payload).map_err(text)
    }

    fn notify(&self, notification: &ShownNotification) -> Result<(), String> {
        // The large body is Android's: without it the plugin's empty inbox
        // style hides the text whenever the notification is expanded
        // (desktops ignore it)
        let builder = self
            .app
            .notification()
            .builder()
            .title(&notification.title)
            .body(&notification.body)
            .large_body(&notification.body);
        let mut builder = routed(builder, notification.channel, notification.opens);
        if notification.sound {
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

    fn prepare_notifications(&self) {
        #[cfg(target_os = "android")]
        {
            static PREPARED: std::sync::Once = std::sync::Once::new();
            PREPARED.call_once(|| create_channels(&self.app));
        }
    }

    fn ask_to_notify(&self, _allowed: Box<dyn FnOnce() + Send>) {
        // The plugin answers on the main thread, so the question waits on a
        // thread of its own
        #[cfg(mobile)]
        {
            let app = self.app.clone();
            std::thread::spawn(move || ask_to_notify(&app, _allowed));
        }
    }

    fn set_timer_notice(&self, notice: Option<&TimerNotice>) -> Result<(), String> {
        set_os_timer_notice(&self.app, notice)
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
        // Focusing does nothing to a minimized window (tao), so restore it
        // first. A phone has no minimizing (nor Tauri's unminimize).
        #[cfg(desktop)]
        if let Err(e) = window.unminimize() {
            log::error!("Failed to restore the window: {}", e);
        }
        if let Err(e) = window.show().and_then(|()| window.set_focus()) {
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

    fn render_app_menu(&self, menu: &AppMenu) -> Result<(), String> {
        self.desktop.render_app_menu(&self.app, menu)
    }

    fn update_app_menu(&self, actions: &[Action]) -> Result<(), String> {
        self.desktop.update_app_menu(actions)
    }

    fn app_version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    fn log_dir(&self) -> Result<PathBuf, String> {
        self.app.path().app_log_dir().map_err(text)
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
