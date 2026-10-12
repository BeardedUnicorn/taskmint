// TaskMint Tauri app with system tray and timer functionality
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import all modules
pub mod backup;
pub mod capture_server;
pub mod commands;
pub mod config;
pub mod error;
pub mod idle;
pub mod state;
pub mod storage;
pub mod tray;
pub mod types;
pub mod utils;

// Re-export commonly used types
pub use error::AppError;
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
                // Load sessions from store. A partial or failed load must not
                // silently discard the user's data: back up the store file
                // before any later save can overwrite it, and record a warning
                // the frontend surfaces via get_session_load_warning.
                match storage::load_sessions(app.handle()) {
                    Ok(loaded) => {
                        let warning = if loaded.skipped > 0 {
                            let backup_note = match storage::backup_store_file(app.handle()) {
                                Ok(Some(path)) => {
                                    format!(" A backup was saved to {}.", path.display())
                                }
                                Ok(None) => String::new(),
                                Err(e) => {
                                    format!(" Backing up the previous data also failed: {}.", e)
                                }
                            };
                            Some(format!(
                                "{} saved session record(s) could not be read and were skipped.{}",
                                loaded.skipped, backup_note
                            ))
                        } else {
                            None
                        };

                        // Repair data stranded by older builds: paused (or
                        // running) timers left in inactive sessions can never
                        // be reached or resumed there, so finalize them.
                        // Idempotent — later launches find nothing to repair.
                        let mut loaded_sessions = loaded.sessions;
                        let migrated = commands::sessions::finalize_stranded_instances(
                            &mut loaded_sessions,
                            chrono::Utc::now(),
                        );
                        if migrated > 0 {
                            log::warn!(
                                "Finalized {} stranded timer instance(s) in inactive sessions",
                                migrated
                            );
                            // Keep a pre-migration copy unless the skipped-record
                            // path above already backed the file up.
                            if loaded.skipped == 0 {
                                if let Err(e) = storage::backup_store_file(app.handle()) {
                                    log::error!(
                                        "Failed to back up sessions before migration: {}",
                                        e
                                    );
                                }
                            }
                        }

                        if let Ok(mut sessions) = app_state.task_sessions.lock() {
                            *sessions = loaded_sessions;
                            if migrated > 0 {
                                if let Err(e) = storage::save_sessions(app.handle(), &sessions) {
                                    log::error!("Failed to persist migrated sessions: {}", e);
                                }
                            }
                        }
                        if let Some(warning) = warning {
                            log::warn!("{}", warning);
                            if let Ok(mut slot) = app_state.session_load_warning.lock() {
                                *slot = Some(warning);
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to load sessions: {}", e);
                        let backup_note = match storage::backup_store_file(app.handle()) {
                            Ok(Some(path)) => format!(" A backup was saved to {}.", path.display()),
                            Ok(None) => String::new(),
                            Err(backup_err) => {
                                format!(
                                    " Backing up the previous data also failed: {}.",
                                    backup_err
                                )
                            }
                        };
                        if let Ok(mut slot) = app_state.session_load_warning.lock() {
                            *slot = Some(format!(
                                "Failed to load saved sessions: {}.{}",
                                e, backup_note
                            ));
                        }
                    }
                }

                // Load the work-log ledger with the same tolerance and warning
                // surface as sessions (warning reaches the frontend via
                // get_work_logs).
                match storage::load_work_logs(app.handle()) {
                    Ok(loaded) => {
                        if loaded.skipped > 0 {
                            let backup_note = match storage::backup_store_file_named(
                                app.handle(),
                                storage::WORKLOG_STORE_FILENAME,
                            ) {
                                Ok(Some(path)) => {
                                    format!(" A backup was saved to {}.", path.display())
                                }
                                Ok(None) => String::new(),
                                Err(e) => {
                                    format!(" Backing up the previous data also failed: {}.", e)
                                }
                            };
                            let warning = format!(
                                "{} saved work-log record(s) could not be read and were skipped.{}",
                                loaded.skipped, backup_note
                            );
                            log::warn!("{}", warning);
                            if let Ok(mut slot) = app_state.work_log_load_warning.lock() {
                                *slot = Some(warning);
                            }
                        }
                        if let Ok(mut work_logs) = app_state.work_logs.lock() {
                            work_logs.entries = loaded.entries;
                            work_logs.mappings = loaded.mappings;
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to load work logs: {}", e);
                        let backup_note = match storage::backup_store_file_named(
                            app.handle(),
                            storage::WORKLOG_STORE_FILENAME,
                        ) {
                            Ok(Some(path)) => format!(" A backup was saved to {}.", path.display()),
                            Ok(None) => String::new(),
                            Err(backup_err) => {
                                format!(
                                    " Backing up the previous data also failed: {}.",
                                    backup_err
                                )
                            }
                        };
                        if let Ok(mut slot) = app_state.work_log_load_warning.lock() {
                            *slot = Some(format!(
                                "Failed to load saved work logs: {}.{}",
                                e, backup_note
                            ));
                        }
                    }
                }

                // Set up menu event handling
                let app_handle = app.handle().clone();
                let state_for_menu = app_state.clone();

                app.on_menu_event(move |app, event| {
                    log::debug!("Menu event received: {:?}", event.id());
                    tray::handle_menu_event(event.id().as_ref(), app, &state_for_menu);
                });
                log::debug!("Menu event handler registered");

                // Setup system tray
                if let Err(e) = tray::setup_system_tray(&app_handle, &app_state) {
                    log::error!(
                        "Failed to set up the system tray; no tray icon this session: {:?}",
                        e
                    );
                    // Continue running even if tray setup fails
                } else {
                    log::info!("System tray setup successful, starting update timer...");
                    // Start the real-time tray update timer
                    tray::start_tray_update_timer(&app_handle, &app_state);
                }

                // System-wide idle detection (acts only once the app sends
                // enabled settings)
                idle::start_idle_monitor(&app_handle, &app_state);

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
                        capture_server::handle_deep_link_urls(&app_handle, &app_state, &urls);
                    }

                    // URLs opened while running (macOS Apple events; forwarded
                    // argv from a second instance on Windows/Linux).
                    let link_app = app_handle.clone();
                    let link_state = app_state.clone();
                    app_handle.deep_link().on_open_url(move |event| {
                        let urls: Vec<String> =
                            event.urls().iter().map(|u| u.to_string()).collect();
                        capture_server::handle_deep_link_urls(&link_app, &link_state, &urls);
                    });
                }

                // Localhost capture server for the browser extension.
                capture_server::start_capture_server(&app_handle, &app_state);

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
            // Session commands
            commands::sessions::start_task,
            commands::sessions::add_manual_time,
            commands::sessions::get_sessions,
            commands::sessions::update_session,
            commands::sessions::delete_session,
            commands::sessions::create_timer_instance,
            commands::sessions::update_timer_instance,
            commands::sessions::start_timer_instance,
            commands::sessions::stop_timer_instance,
            commands::sessions::pause_timer_instance,
            commands::sessions::resume_timer_instance,
            commands::sessions::delete_timer_instance,
            commands::sessions::set_active_session,
            commands::sessions::get_session_load_warning,
            // Idle-detection commands
            commands::idle::set_idle_settings,
            commands::idle::get_idle_support,
            commands::idle::get_idle_pause,
            commands::idle::resolve_idle_pause,
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
