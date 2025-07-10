// TaskMint Tauri app with system tray and timer functionality
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]



// Import all modules
pub mod types;
pub mod commands;
pub mod error;
pub mod state;
pub mod timer;
pub mod tray;
pub mod utils;
pub mod backup;
pub mod google_drive;
pub mod config;


// Re-export commonly used types
pub use types::*;
pub use error::AppError;
pub use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state.clone())
        .setup({
            let app_state = app_state.clone();
            move |app| {
                // Set up menu event handling
                let app_handle = app.handle().clone();
                let state_for_menu = app_state.clone();

                app.on_menu_event(move |app, event| {
                    println!("🎯 Menu event received: {:?}", event.id());
                    tray::handle_menu_event(&event.id().as_ref(), app, &state_for_menu);
                });
                println!("✅ Menu event handler registered successfully");

                // Setup system tray
                if let Err(e) = tray::setup_system_tray(&app_handle, &app_state) {
                    eprintln!("CRITICAL ERROR: Failed to setup system tray: {:?}", e);
                    eprintln!("This means the system tray icon will not appear!");
                    // Continue running even if tray setup fails
                } else {
                    println!("System tray setup successful, starting update timer...");
                    // Start the real-time tray update timer
                    tray::start_tray_update_timer(&app_handle, &app_state);
                }

                Ok(())
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Basic commands
            commands::basic::greet,
            commands::basic::log_to_terminal,
            
            // Timer commands
            commands::timer::update_timer_state,
            commands::timer::get_timer_state,
            commands::timer::start_timer_from_tray,
            commands::timer::stop_timer_from_tray,
            
            // Task commands
            commands::tasks::update_tasks,
            commands::tasks::get_tasks,
            commands::tasks::get_daily_total,
            
            // Tray commands
            commands::tray::update_tray_menu_command,
            commands::tray::test_new_task_dialog,
            
            // System commands
            commands::system::execute_cli_command,
            
            // Backup commands
            commands::backup::validate_backup_path,
            commands::backup::perform_automatic_backup,
            commands::backup::export_data_to_file,
            commands::backup::import_data_from_file,
            
            // Google Drive commands
            commands::google_drive::get_auth_url,
            commands::google_drive::authenticate,
            commands::google_drive::list_files,
            commands::google_drive::get_file_metadata,
            commands::google_drive::download_file,
            commands::google_drive::upload_file,
            commands::google_drive::update_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
