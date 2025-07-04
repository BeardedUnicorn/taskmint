// Tray-related command handlers

use crate::state::AppState;
use crate::tray;
use crate::types::DailyTotal;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn update_tray_menu_command(
    app: AppHandle,
    app_state: State<AppState>,
    time_entries: Vec<serde_json::Value>,
) -> Result<(), String> {
    // Calculate daily total (unused in current implementation but kept for compatibility)
    let _daily_total = super::tasks::get_daily_total(time_entries).unwrap_or(DailyTotal {
        total_duration_ms: 0,
        task_count: 0,
    });

    tray::update_tray_menu(&app, &*app_state)
        .map_err(|e| format!("Failed to update tray menu: {:?}", e))
}

#[tauri::command]
pub fn test_new_task_dialog(app: AppHandle) -> Result<(), String> {
    println!("Test command: test_new_task_dialog called");
    
    // Emit event to show new task dialog
    if let Err(e) = app.emit("show-new-task-dialog", ()) {
        eprintln!("Failed to emit show-new-task-dialog event: {}", e);
        return Err(format!("Failed to emit event: {}", e));
    } else {
        println!("Successfully emitted show-new-task-dialog event");
    }

    // Show the main window
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            eprintln!("Failed to show window: {}", e);
        }
        if let Err(e) = window.set_focus() {
            eprintln!("Failed to focus window: {}", e);
        }
        println!("Window shown and focused");
    } else {
        eprintln!("Main window not found");
    }

    Ok(())
}
