// Timer-related command handlers

use crate::state::AppState;
use chrono::{DateTime, Utc};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn update_timer_state(
    app: AppHandle,
    app_state: State<AppState>,
    is_running: bool,
    task_name: String,
    start_time: Option<String>,
    elapsed_ms: u64,
) -> Result<(), String> {
    app_state.with_timer_state_mut(|timer_state| {
        timer_state.is_running = is_running;
        timer_state.task_name = task_name;
        timer_state.start_time = if let Some(time_str) = start_time {
            DateTime::parse_from_rfc3339(&time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .ok()
        } else {
            None
        };
        timer_state.elapsed_ms = elapsed_ms;
    })?;
    
    // Immediately update the tray menu to reflect the new timer state
    if let Err(e) = crate::tray::update_tray_menu(&app, &*app_state) {
        eprintln!("Failed to update tray menu after timer state change: {:?}", e);
        // Don't fail the command if tray update fails, just log the error
    }

    // Also refresh the tooltip/title so a stopped timer doesn't leave stale
    // elapsed-time text in the menu bar
    if let Err(e) = crate::tray::update_tray_tooltip_only(&*app_state) {
        eprintln!("Failed to update tray tooltip after timer state change: {:?}", e);
    }

    Ok(())
}
