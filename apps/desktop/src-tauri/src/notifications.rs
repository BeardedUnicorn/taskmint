//! OS notifications. Every one goes through `post`, which applies the user's
//! notification preferences (sent by the app via set_notification_preferences)
//! and the sound setting. The ones the backend shows itself (the long-run
//! reminder, an idle pause) are also announced to the frontend so they appear
//! in its notification history.

use crate::events::{emit_quiet, NOTIFICATION_POSTED};
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// What a notification is about (camelCase, as the frontend sends it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
    General,
    GoalMilestone,
    LongRun,
    IdlePause,
    WorkLogCapture,
    BackupFailure,
    BackupSuccess,
    DailySummary,
    Error,
    /// Settings' "Send test notification": always shown.
    Test,
}

/// The user's choices (camelCase; missing fields keep their defaults, unknown
/// ones such as the summary time are ignored). Until the app sends them, the
/// defaults keep reminders working.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationPrefs {
    pub desktop_enabled: bool,
    pub sound: bool,
    pub goal_milestones: bool,
    pub long_run_reminder: bool,
    pub idle_pause: bool,
    pub work_log_capture: bool,
    pub backup_failure: bool,
    pub backup_success: bool,
    pub daily_summary: bool,
    pub errors_while_away: bool,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            desktop_enabled: true,
            sound: false,
            goal_milestones: true,
            long_run_reminder: true,
            idle_pause: true,
            work_log_capture: true,
            backup_failure: true,
            backup_success: false,
            daily_summary: true,
            errors_while_away: true,
        }
    }
}

impl NotificationPrefs {
    /// Whether a notification of `kind` may be shown.
    pub fn allows(&self, kind: NotificationKind) -> bool {
        if kind == NotificationKind::Test {
            return true;
        }
        if !self.desktop_enabled {
            return false;
        }
        match kind {
            NotificationKind::General | NotificationKind::Test => true,
            NotificationKind::GoalMilestone => self.goal_milestones,
            NotificationKind::LongRun => self.long_run_reminder,
            NotificationKind::IdlePause => self.idle_pause,
            NotificationKind::WorkLogCapture => self.work_log_capture,
            NotificationKind::BackupFailure => self.backup_failure,
            NotificationKind::BackupSuccess => self.backup_success,
            NotificationKind::DailySummary => self.daily_summary,
            NotificationKind::Error => self.errors_while_away,
        }
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_keep_reminders_and_failures_but_not_backup_successes() {
        let prefs = NotificationPrefs::default();
        assert!(prefs.allows(NotificationKind::LongRun));
        assert!(prefs.allows(NotificationKind::IdlePause));
        assert!(prefs.allows(NotificationKind::BackupFailure));
        assert!(!prefs.allows(NotificationKind::BackupSuccess));
        assert!(!prefs.sound);
    }

    #[test]
    fn each_category_follows_its_own_switch() {
        let prefs = NotificationPrefs {
            long_run_reminder: false,
            ..NotificationPrefs::default()
        };
        assert!(!prefs.allows(NotificationKind::LongRun));
        assert!(prefs.allows(NotificationKind::IdlePause));
    }

    #[test]
    fn the_master_switch_silences_everything_but_the_test() {
        let prefs = NotificationPrefs {
            desktop_enabled: false,
            ..NotificationPrefs::default()
        };
        assert!(!prefs.allows(NotificationKind::GoalMilestone));
        assert!(!prefs.allows(NotificationKind::General));
        assert!(prefs.allows(NotificationKind::Test));
    }

    #[test]
    fn a_partial_payload_keeps_the_other_defaults() {
        let prefs: NotificationPrefs =
            serde_json::from_str(r#"{"sound": true, "dailySummaryTime": "18:30"}"#).unwrap();
        assert!(prefs.sound);
        assert!(prefs.desktop_enabled);
        assert!(!prefs.backup_success);
    }

    #[test]
    fn kinds_use_the_frontends_names() {
        let kind: NotificationKind = serde_json::from_str(r#""workLogCapture""#).unwrap();
        assert_eq!(kind, NotificationKind::WorkLogCapture);
        assert_eq!(
            serde_json::to_string(&NotificationKind::IdlePause).unwrap(),
            r#""idlePause""#
        );
    }
}
