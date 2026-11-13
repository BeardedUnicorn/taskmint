//! The Tauri app: plugins, the window, and starting the shell. It needs a
//! real event loop and main thread, so the coverage policy leaves it to the
//! manual QA checklist: it only wires up code that's tested elsewhere.
//!
//! On Android and iOS (Tauri's `mobile` cfg) the app is the window and its
//! data: no second instance, taskmint:// links or capture server for the
//! browser extension, tray, idle monitor, hide-on-close, updater or move
//! from the old identifier.

use crate::dispatch;
use crate::environment::Environment;
use crate::platform::os::TauriPlatform;
use crate::state::AppState;
use crate::store::JsonFileStore;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::utils::config::AppDirectoriesOverride;
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;
#[cfg(desktop)]
use {
    crate::app_menu::{self, model::MenuOs},
    crate::capture_server::{self, CaptureServer},
    crate::legacy_identifier::{self, Dirs, Os},
    crate::ticker::Ticker,
    crate::{idle, tray},
    tauri_plugin_deep_link::DeepLinkExt,
};

/// What runs in the background for as long as the app does.
#[cfg(desktop)]
struct Background {
    _tickers: Vec<Ticker>,
    _capture_server: Option<CaptureServer>,
}

#[cfg(desktop)]
fn show_window(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.platform.show_main_window();
    }
}

/// The menu bar's layout here: macOS's or Windows'. Linux has none.
#[cfg(desktop)]
fn menu_os() -> Option<MenuOs> {
    if cfg!(target_os = "macos") {
        Some(MenuOs::MacOs)
    } else if cfg!(windows) {
        Some(MenuOs::Windows)
    } else {
        None
    }
}

#[cfg(desktop)]
fn current_os() -> Os {
    if cfg!(target_os = "macos") {
        Os::MacOs
    } else if cfg!(windows) {
        Os::Windows
    } else {
        Os::Other
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    // A development build can keep its files (data, logs) in a folder of its
    // own, so trying sync leaves the installed app's alone
    let dev_data = std::env::var_os("TASKMINT_DATA_DIR")
        .filter(|_| cfg!(debug_assertions))
        .map(PathBuf::from);
    if let Some(dir) = &dev_data {
        context.config_mut().app.app_directories_override =
            Some(AppDirectoriesOverride::Root(dir.clone()));
    }

    let builder = tauri::Builder::default();
    // Must be the FIRST plugin: a second launch (e.g. a taskmint:// deep
    // link on Windows) forwards its args here and exits; the deep-link
    // plugin's "deep-link" feature routes those args to on_open_url.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_window(app)
    }));
    let builder = builder
        // Levelled logs to stdout and the app log dir (stdout is lost in
        // bundled builds). Debug detail (tray rebuilds etc.) in dev only.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .build(),
        );
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_deep_link::init());
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());
    // Opens the documents Android's Save and Open dialogs pick
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_fs::init());
    // The withdrawal reminder's alarm, which a restart doesn't lose
    #[cfg(target_os = "android")]
    let builder = builder.plugin(crate::platform::os::reminders_plugin());
    #[cfg(desktop)]
    let builder = builder
        // Updates from GitHub's latest release (plugins.updater: the feed is
        // in tauri.production.conf.json, so a dev build has none); the
        // webview asks before installing one
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Closing the window hides it to the tray: timers keep running and
        // the tray stays usable; quit from the tray menu. Without a tray icon
        // the window closes normally, since nothing could bring it back.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let has_tray = window
                    .try_state::<AppState>()
                    .is_some_and(|state| state.platform.has_tray());
                if window.label() == "main" && has_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });

    builder
        .setup(move |app| {
            let handle = app.handle().clone();
            #[cfg(desktop)]
            let identifier = app.config().identifier.clone();
            // A production build runs only as the installed app, and a dev
            // build never as it (environment.rs)
            #[cfg(desktop)]
            Environment::current().check_identifier(&identifier)?;
            // Before 2.1 the identifier was com.taskmint.app: move what it
            // left behind. This runs before the window exists, since the
            // webview opens its storage when it's created. Only the real
            // app takes it: a dev build's folders stay its own.
            #[cfg(desktop)]
            if dev_data.is_none() && Environment::current().moves_legacy_folders() {
                let path = app.path();
                let dirs = Dirs {
                    home: path.home_dir()?,
                    data: path.data_dir()?,
                    local_data: path.local_data_dir()?,
                };
                legacy_identifier::run(current_os(), &dirs, &identifier);
            }
            let state = AppState::open(
                JsonFileStore::new(app.path().app_data_dir()?),
                Arc::new(chrono::Utc::now),
                Arc::new(TauriPlatform::new(handle.clone())),
            );
            app.manage(state.clone());

            // The menu bar, before the window: a window takes the app's menu
            // as it's made (and Windows' then follows dark mode)
            #[cfg(desktop)]
            if let Some(os) = menu_os() {
                app_menu::start(&state, os);
            }

            // The main window ("create": false in tauri.conf.json, so it
            // comes after the move above), titled as the build is named
            // ("TaskMint Dev" for a dev build)
            let window = app.config().app.windows[0].clone();
            WebviewWindowBuilder::from_config(&handle, &window)?
                .title(&handle.package_info().name)
                .build()?;

            // Clicking a notification brings the window forward (it may be
            // hidden to the tray), on the page it's about. Registered before
            // anything can notify: notifications shown before a handler
            // exists report nothing.
            let notified_state = state.clone();
            app.notification().on_action(move |action| {
                let shown = action.notification();
                let opens = shown
                    .and_then(|shown| shown.extra().get(crate::platform::os::OPENS))
                    .and_then(|command| serde_json::from_value(command.clone()).ok());
                crate::notifications::performed(
                    &notified_state,
                    action.action_id(),
                    shown.map(|shown| shown.id()),
                    opens,
                );
            })?;

            // A phone shows the running timer in a notification (once the
            // page is up: timer_notice::start)
            #[cfg(mobile)]
            crate::timer_notice::enable(&state);

            #[cfg(desktop)]
            start_desktop(app, &handle, &state);
            Ok(())
        })
        // Every webview call goes through dispatch (see dispatch.rs)
        .invoke_handler(tauri::generate_handler![dispatch::dispatch])
        .build(context)
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: clicking the Dock icon brings back a window hidden by close.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = _event
            {
                show_window(_app);
            }
        });
}

/// The tray, the idle monitor, taskmint:// links and the capture server.
#[cfg(desktop)]
fn start_desktop(app: &tauri::App, handle: &tauri::AppHandle, state: &AppState) {
    let menu_state = state.clone();
    // The menu bar's clicks and the tray's
    app.on_menu_event(move |_app, event| {
        app_menu::handle_menu_event(&menu_state, event.id().as_ref())
    });
    let mut tickers = Vec::new();
    if tray::start(state) {
        tickers.push(tray::start_ticker(state));
    }
    // System-wide idle detection (acts once the app sends enabled
    // settings), and the long-run reminder
    tickers.push(idle::start_monitor(state));

    // taskmint:// deep links (taskmint-dev:// in a dev build: browser-
    // extension captures, and the way back from Google sign-in). macOS
    // registers them at bundle time (Info.plist via tauri.conf.json)
    // and Windows releases in the installer; this covers Linux and
    // Windows dev builds.
    #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
    if let Err(e) = handle.deep_link().register_all() {
        log::error!("Failed to register deep-link schemes: {}", e);
    }
    // The links the app was launched with (a cold start via a link)
    if let Ok(Some(urls)) = handle.deep_link().get_current() {
        let urls: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
        capture_server::handle_deep_link_urls(state, &urls);
    }
    // Links opened while running (macOS Apple events; forwarded argv
    // from a second instance on Windows/Linux)
    let link_state = state.clone();
    handle.deep_link().on_open_url(move |event| {
        let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
        capture_server::handle_deep_link_urls(&link_state, &urls);
    });

    app.manage(Background {
        _tickers: tickers,
        _capture_server: CaptureServer::start(state, capture_server::default_address()),
    });
}
