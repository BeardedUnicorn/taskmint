// Timer-related functionality

use crate::error::{AppError, retry_operation};
use crate::state::AppState;
use crate::utils::get_current_elapsed_ms;
use chrono::Utc;
use tauri::{AppHandle, Emitter};

// Start timer functionality
pub fn start_timer_from_tray(
    app: &AppHandle,
    state: &AppState,
    task_name: String,
) -> Result<(), AppError> {
    let start_time = Utc::now();

    // Update timer state with retry
    retry_operation(
        || {
            state.with_timer_state_mut(|timer_state| {
                timer_state.is_running = true;
                timer_state.task_name = task_name.clone();
                timer_state.start_time = Some(start_time);
                timer_state.elapsed_ms = 0;
            })?;
            Ok(())
        },
        3,
        100,
    )?;

    // Emit event to frontend with retry
    retry_operation(
        || {
            app.emit(
                "timer-started-from-tray",
                serde_json::json!({
                    "taskName": task_name,
                    "startTime": start_time.to_rfc3339()
                }),
            )
            .map_err(|e| AppError::new(format!("Failed to emit timer started event: {}", e)))
        },
        3,
        100,
    )?;

    println!("✅ Timer started successfully for task: '{}'", task_name);
    Ok(())
}

// Stop timer functionality
pub fn stop_timer_from_tray(app: &AppHandle, state: &AppState) -> Result<(), AppError> {
    let (task_name, start_time, elapsed_ms) = retry_operation(
        || {
            state.with_timer_state_mut(|timer_state| {
                let task_name = timer_state.task_name.clone();
                let start_time = timer_state.start_time;
                let elapsed_ms = if let Some(start) = timer_state.start_time {
                    get_current_elapsed_ms(&start)
                } else {
                    timer_state.elapsed_ms
                };

                timer_state.is_running = false;
                timer_state.start_time = None;
                timer_state.elapsed_ms = 0;

                Ok((task_name, start_time, elapsed_ms))
            })?
        },
        3,
        100,
    )?;

    // Emit event to frontend with retry
    retry_operation(
        || {
            app.emit(
                "timer-stopped-from-tray",
                serde_json::json!({
                    "taskName": task_name,
                    "startTime": start_time.map(|t| t.to_rfc3339()),
                    "elapsedMs": elapsed_ms
                }),
            )
            .map_err(|e| AppError::new(format!("Failed to emit timer stopped event: {}", e)))
        },
        3,
        100,
    )?;

    println!("✅ Timer stopped successfully");
    Ok(())
}
