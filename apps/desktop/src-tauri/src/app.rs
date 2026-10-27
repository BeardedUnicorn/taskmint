//! The Tauri app: plugins, the window, and starting the shell. It needs a
//! real event loop and main thread, so the coverage policy leaves it to the
//! manual QA checklist: it only wires up code that's tested elsewhere.

use crate::capture_server::{self, CaptureServer};
use crate::platform::os::TauriPlatform;
use crate::state::AppState;
use crate::store::JsonFileStore;
use crate::ticker::Ticker;
use crate::{dispatch, idle, tray};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

/// What runs in the background for as long as the app does.
struct Background {
    _tickers: Vec<Ticker>,
    _capture_server: Option<CaptureServer>,
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.platform.show_main_window();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the FIRST plugin: a second launch (e.g. a taskmint:// deep
        // link on Windows) forwards its args here and exits; the deep-link
        // plugin's "deep-link" feature routes those args to on_open_url.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_window(app)
        }))
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
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = AppState::open(
                JsonFileStore::new(app.path().app_data_dir()?),
                Arc::new(chrono::Utc::now),
                Arc::new(TauriPlatform::new(handle.clone())),
            );
            app.manage(state.clone());

            let menu_state = state.clone();
            app.on_menu_event(move |_app, event| {
                tray::handle_menu_event(&menu_state, event.id().as_ref())
            });
            let mut tickers = Vec::new();
            if tray::start(&state) {
                tickers.push(tray::start_ticker(&state));
            }
            // System-wide idle detection (acts once the app sends enabled
            // settings), and the long-run reminder
            tickers.push(idle::start_monitor(&state));

            // taskmint:// deep links (browser-extension captures). macOS
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
                capture_server::handle_deep_link_urls(&state, &urls);
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
                _capture_server: CaptureServer::start(&state, capture_server::default_address()),
            });
            Ok(())
        })
        // Closing the window hides it to the tray: timers keep running and the
        // tray stays usable; quit from the tray menu. Without a tray icon the
        // window closes normally, since nothing could bring it back.
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
        })
        // Every webview call goes through dispatch (see dispatch.rs)
        .invoke_handler(tauri::generate_handler![dispatch::dispatch])
        .build(tauri::generate_context!())
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
