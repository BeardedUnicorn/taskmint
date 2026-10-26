// TaskMint Tauri app with system tray and timer functionality
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import all modules
pub mod backend;
pub mod backup;
pub mod capture_server;
pub mod config;
mod dispatch;
pub mod events;
pub mod files;
pub mod idle;
pub mod notifications;
pub mod state;
pub mod store;
pub mod tray;
pub mod utils;

// Re-export commonly used types
pub use state::AppState;

use backend::{LocalBackend, Published};
use store::JsonFileStore;
use taskmint_core::workspace::Parts;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the FIRST plugin: a second launch (e.g. a taskmint:// deep
        // link on Windows) forwards its args here and exits; the deep-link
        // plugin's "deep-link" feature routes those args to on_open_url.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
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
            let app_state = AppState::new(open_backend(app.handle())?);
            app.manage(app_state.clone());
            setup_app(app, &app_state);
            Ok(())
        })
        // Closing the window hides it to the tray: timers keep running and the
        // tray stays usable; quit from the tray menu. Without a tray icon the
        // window closes normally, since nothing could bring it back.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let has_tray = window.try_state::<AppState>().is_some_and(|state| {
                    state.with_tray_icon(|tray| tray.is_some()).unwrap_or(false)
                });
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
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}

/// The data in the app data folder. Saved changes reach the frontend as
/// events, and the tray follows the sessions and tasks.
fn open_backend(app: &tauri::AppHandle) -> Result<LocalBackend, tauri::Error> {
    let store = JsonFileStore::new(app.path().app_data_dir()?);
    let handle = app.clone();
    let publish = move |published: &Published| {
        for event in published.events {
            events::emit_quiet(&handle, event.name, &event.payload);
        }
        if published
            .changed
            .intersects(Parts::SESSIONS | Parts::RECORDS)
        {
            if let Some(state) = handle.try_state::<AppState>() {
                tray::sync_tray(&handle, &state);
            }
        }
    };
    Ok(LocalBackend::open(
        store,
        Box::new(chrono::Utc::now),
        Box::new(publish),
    ))
}

/// Launch work once the data is loaded: the tray, the idle monitor, deep
/// links and the capture server.
fn setup_app(app: &tauri::App, app_state: &AppState) {
    // Set up menu event handling
    let app_handle = app.handle().clone();
    let state_for_menu = app_state.clone();

    app.on_menu_event(move |app, event| {
        log::debug!("Menu event received: {:?}", event.id());
        tray::handle_menu_event(event.id().as_ref(), app, &state_for_menu);
    });
    log::debug!("Menu event handler registered");

    // Setup system tray
    if let Err(e) = tray::setup_system_tray(&app_handle, app_state) {
        log::error!(
            "Failed to set up the system tray; no tray icon this session: {:?}",
            e
        );
        // Continue running even if tray setup fails
    } else {
        log::info!("System tray setup successful, starting update timer...");
        // Start the real-time tray update timer
        tray::start_tray_update_timer(&app_handle, app_state);
    }

    // System-wide idle detection (acts only once the app sends
    // enabled settings)
    idle::start_idle_monitor(&app_handle, app_state);

    // taskmint:// deep links (browser-extension captures). macOS
    // registration is bundle-time (Info.plist via tauri.conf.json);
    // production Windows registers via the installer; runtime
    // registration covers Linux and Windows dev builds.
    {
        use tauri_plugin_deep_link::DeepLinkExt;

        #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
        if let Err(e) = app_handle.deep_link().register_all() {
            log::error!("Failed to register deep-link schemes: {}", e);
        }

        // URLs the app was launched with (cold start via a link).
        if let Ok(Some(urls)) = app_handle.deep_link().get_current() {
            let urls: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
            capture_server::handle_deep_link_urls(&app_handle, app_state, &urls);
        }

        // URLs opened while running (macOS Apple events; forwarded
        // argv from a second instance on Windows/Linux).
        let link_app = app_handle.clone();
        let link_state = app_state.clone();
        app_handle.deep_link().on_open_url(move |event| {
            let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
            capture_server::handle_deep_link_urls(&link_app, &link_state, &urls);
        });
    }

    // Localhost capture server for the browser extension.
    capture_server::start_capture_server(&app_handle, app_state);
}
