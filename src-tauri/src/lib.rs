// TaskMint Tauri app with system tray and timer functionality
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import all modules
pub mod backup;
pub mod capture_server;
pub mod commands;
pub mod config;
pub mod events;
pub mod idle;
pub mod notifications;
pub mod startup;
pub mod state;
pub mod storage;
pub mod tray;
pub mod types;
pub mod utils;

// Re-export commonly used types
pub use state::AppState;
pub use types::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

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
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state.clone())
        .setup({
            let app_state = app_state.clone();
            move |app| {
                setup_app(app, &app_state);
                Ok(())
            }
        })
        // Closing the window hides it to the tray: timers keep running and the
        // tray stays usable; quit from the tray menu. Without a tray icon the
        // window closes normally, since nothing could bring it back.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use tauri::Manager;
                let has_tray = window
                    .state::<AppState>()
                    .with_tray_icon(|tray| tray.is_some())
                    .unwrap_or(false);
                if window.label() == "main" && has_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Task commands
            commands::tasks::update_tasks,
            // Records (tasks, notes, templates, goal) in appdata.json
            commands::records::get_app_records,
            commands::records::set_app_record,
            commands::records::import_app_records,
            // Session commands
            commands::sessions::start::start_task,
            commands::sessions::manual::add_manual_time,
            commands::sessions::lifecycle::get_sessions,
            commands::sessions::lifecycle::update_session,
            commands::sessions::lifecycle::delete_session,
            commands::sessions::lifecycle::clear_session_notes,
            commands::sessions::instances::create_timer_instance,
            commands::sessions::instances::update_timer_instance,
            commands::sessions::instances::start_timer_instance,
            commands::sessions::instances::stop_timer_instance,
            commands::sessions::instances::pause_timer_instance,
            commands::sessions::instances::resume_timer_instance,
            commands::sessions::instances::delete_timer_instance,
            commands::sessions::lifecycle::move_timer_instance,
            commands::sessions::lifecycle::set_active_session,
            commands::sessions::lifecycle::get_session_load_warning,
            // Idle-detection commands
            commands::idle::set_idle_settings,
            commands::idle::get_idle_support,
            commands::idle::get_idle_pause,
            commands::idle::resolve_idle_pause,
            // OS notifications
            commands::notifications::set_notification_preferences,
            commands::notifications::show_desktop_notification,
            // Work-log commands
            commands::worklogs::get_work_logs,
            commands::worklogs::apply_work_log_import,
            // Full app-data reset
            commands::reset::reset_all_app_data,
            // Browser-capture commands
            commands::capture::take_pending_work_log_capture,
            commands::capture::get_capture_server_status,
            // Backup commands
            commands::backup::validate_backup_path,
            commands::backup::perform_automatic_backup,
            commands::backup::export_data_to_file,
            commands::backup::export_csv_file,
            commands::backup::import_data_from_file,
            commands::restore::restore_backup_data,
        ])
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
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}

/// Launch work once the app exists: load the data, then start the tray, the
/// idle monitor, deep links and the capture server.
fn setup_app(app: &tauri::App, app_state: &AppState) {
    startup::load_sessions(app.handle(), app_state);
    startup::load_work_logs(app.handle(), app_state);

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
