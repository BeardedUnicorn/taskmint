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
    let start_time = start_time.and_then(|time_str| {
        DateTime::parse_from_rfc3339(&time_str)
            .map(|dt| dt.with_timezone(&Utc))
            .ok()
    });

    // Rebuild the tray menu only when a field it displays actually changed.
    // This command is re-invoked from frontend render effects, and a rebuild
    // tears down the open menu, so no-op calls must not reach the tray.
    // elapsed_ms only feeds the menu when running without a start time;
    // otherwise the menu derives elapsed from start_time on its own.
    let menu_changed = app_state.with_timer_state_mut(|timer_state| {
        let changed = timer_state.is_running != is_running
            || timer_state.task_name != task_name
            || timer_state.start_time != start_time
            || (is_running && start_time.is_none() && timer_state.elapsed_ms != elapsed_ms);
        timer_state.is_running = is_running;
        timer_state.task_name = task_name;
        timer_state.start_time = start_time;
        timer_state.elapsed_ms = elapsed_ms;
        changed
    })?;

    if menu_changed {
        if let Err(e) = crate::tray::update_tray_menu(&app, &*app_state) {
            eprintln!("Failed to update tray menu after timer state change: {:?}", e);
            // Don't fail the command if tray update fails, just log the error
        }
    }

    Ok(())
}
