//! OS notifications. Every one goes through `post`, which applies the user's
//! notification preferences (sent by the app via set_notification_preferences;
//! the rules are in taskmint_core::notifications) and the sound setting. The
//! ones the backend shows itself (the long-run reminder, an idle pause) are
//! also announced to the frontend so they appear in its notification history.

use crate::events::{emit_quiet, NOTIFICATION_POSTED};
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use taskmint_core::notifications::NotificationKind;
use tauri::AppHandle;

/// The system sound to play when sound is on.
const SOUND: &str = if cfg!(target_os = "macos") {
    "Glass"
} else if cfg!(target_os = "linux") {
    "message-new-instant"
} else {
    "Default"
};

/// Who asked for the notification: the app (it records its own history) or
/// the backend (announced so the app can record it).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    App,
    Backend,
}

/// Announced for backend-shown notifications (camelCase for the frontend).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PostedNotification {
    id: String,
    kind: NotificationKind,
    title: String,
    body: String,
    at: String,
}

/// Show a notification if the preferences allow it. Returns whether it was
/// shown (the app falls back to a toast when it wasn't).
pub fn post(
    app: &AppHandle,
    state: &AppState,
    kind: NotificationKind,
    title: &str,
    body: &str,
    origin: Origin,
) -> bool {
    let prefs = state
        .with_notification_prefs(|prefs| prefs.clone())
        .unwrap_or_default();
    if !prefs.allows(kind) {
        log::debug!("Notification {:?} suppressed by the user's settings", kind);
        return false;
    }

    use tauri_plugin_notification::NotificationExt;
    let mut builder = app.notification().builder().title(title).body(body);
    if prefs.sound {
        builder = builder.sound(SOUND);
    }
    if let Err(e) = builder.show() {
        log::warn!("Failed to show a notification: {}", e);
        return false;
    }

    if origin == Origin::Backend {
        let at = Utc::now();
        emit_quiet(
            app,
            NOTIFICATION_POSTED,
            PostedNotification {
                id: format!("backend-{}", at.timestamp_millis()),
                kind,
                title: title.to_string(),
                body: body.to_string(),
                at: at.to_rfc3339(),
            },
        );
    }
    true
}
