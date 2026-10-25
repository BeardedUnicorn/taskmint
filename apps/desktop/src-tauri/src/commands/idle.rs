// Idle-detection command handlers (see idle.rs for the monitor)

use crate::idle::{self, IdleChoice, IdlePausePayload, IdleSettings};
use crate::state::AppState;
use chrono::Utc;
use tauri::{AppHandle, State};

/// The app mirrors its saved detection settings here at startup and whenever
/// they change (localStorage owns them). A pending question is unaffected.
#[tauri::command]
pub fn set_idle_settings(
    app_state: State<'_, AppState>,
    settings: IdleSettings,
) -> Result<(), String> {
    app_state.with_idle_mut(|idle| idle.settings = settings)
}

/// Whether this platform can report system idle time.
#[tauri::command]
pub fn get_idle_support() -> bool {
    idle::is_supported()
}

/// The pending "you were away" question, for an app that missed the event.
#[tauri::command]
pub fn get_idle_pause(app_state: State<'_, AppState>) -> Result<Option<IdlePausePayload>, String> {
    let now = Utc::now();
    app_state.with_idle(|idle| idle.pause.as_ref().map(|pause| pause.payload(now)))
}

/// Answer the pending question: "discardResume", "keepResume" or "stayPaused".
#[tauri::command]
pub fn resolve_idle_pause(
    app: AppHandle,
    app_state: State<'_, AppState>,
    choice: String,
) -> Result<(), String> {
    let choice = IdleChoice::parse(&choice)?;
    idle::resolve(&app, &app_state, choice)
}
