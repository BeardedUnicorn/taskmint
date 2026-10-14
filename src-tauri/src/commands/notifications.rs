//! Notification preferences from the app, and OS notifications it asks for.

use crate::notifications::{self, NotificationKind, NotificationPrefs, Origin};
use crate::state::AppState;
use tauri::{AppHandle, State};

/// The app sends its saved preferences at startup and on every change.
#[tauri::command]
pub fn set_notification_preferences(
    app_state: State<'_, AppState>,
    prefs: NotificationPrefs,
) -> Result<(), String> {
    app_state.with_notification_prefs_mut(|current| *current = prefs)
}

/// Shows an OS notification the app decided to send; resolves to whether it
/// was shown (false when the user's settings don't allow it).
#[tauri::command]
pub fn show_desktop_notification(
    app: AppHandle,
    app_state: State<'_, AppState>,
    kind: NotificationKind,
    title: String,
    body: String,
) -> Result<bool, String> {
    Ok(notifications::post(
        &app,
        &app_state,
        kind,
        &title,
        &body,
        Origin::App,
    ))
}
