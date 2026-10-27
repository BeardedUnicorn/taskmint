//! OS notifications. Every one goes through `post`, which applies the user's
//! notification preferences (sent by the app via set_notification_preferences;
//! the rules are in taskmint_core::notifications) and the sound setting. The
//! ones the backend shows itself (the long-run reminder, an idle pause) are
//! also announced to the frontend so they appear in its notification history.

use crate::events::{emit_quiet, NOTIFICATION_POSTED};
use crate::state::Shell;
use serde::Serialize;
use taskmint_core::notifications::NotificationKind;

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
struct PostedNotification<'a> {
    id: String,
    kind: NotificationKind,
    title: &'a str,
    body: &'a str,
    at: String,
}

/// Show a notification if the preferences allow it. Returns whether it was
/// shown (the app falls back to a toast when it wasn't).
pub fn post(
    shell: &Shell,
    kind: NotificationKind,
    title: &str,
    body: &str,
    origin: Origin,
) -> bool {
    let prefs = shell.with_notification_prefs(|prefs| prefs.clone());
    if !prefs.allows(kind) {
        log::debug!("Notification {:?} suppressed by the user's settings", kind);
        return false;
    }
    if let Err(e) = shell.platform.notify(title, body, prefs.sound) {
        log::warn!("Failed to show a notification: {}", e);
        return false;
    }
    if origin == Origin::Backend {
        let at = (shell.clock)();
        emit_quiet(
            shell,
            NOTIFICATION_POSTED,
            PostedNotification {
                id: format!("backend-{}", at.timestamp_millis()),
                kind,
                title,
                body,
                at: at.to_rfc3339(),
            },
        );
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::fixture;
    use serde_json::json;
    use taskmint_core::notifications::NotificationPrefs;

    #[test]
    fn the_backends_notifications_are_shown_and_announced() {
        let f = fixture();
        let (state, platform) = (&f.state, &f.platform);
        state.with_notification_prefs_mut(|prefs| prefs.sound = true);

        assert!(post(
            state,
            NotificationKind::LongRun,
            "Still working?",
            "4h",
            Origin::Backend
        ));

        assert_eq!(
            platform.recorded().notifications,
            [("Still working?".to_string(), "4h".to_string(), true)]
        );
        assert_eq!(
            platform.recorded().events,
            [(
                "notification-posted".to_string(),
                json!({
                    "id": "backend-1772463600000",
                    "kind": "longRun",
                    "title": "Still working?",
                    "body": "4h",
                    "at": "2026-03-02T15:00:00+00:00"
                })
            )]
        );
    }

    #[test]
    fn the_apps_own_are_shown_without_an_announcement() {
        let f = fixture();
        let (state, platform) = (&f.state, &f.platform);

        assert!(post(
            state,
            NotificationKind::General,
            "Saved",
            "",
            Origin::App
        ));

        // Sound is off unless the user turns it on
        assert!(!platform.recorded().notifications[0].2);
        assert!(platform.recorded().events.is_empty());
    }

    #[test]
    fn the_users_settings_can_turn_them_off() {
        let f = fixture();
        f.state.with_notification_prefs_mut(|prefs| {
            *prefs = serde_json::from_value::<NotificationPrefs>(json!({ "desktopEnabled": false }))
                .unwrap()
        });
        assert!(!post(
            &f.state,
            NotificationKind::LongRun,
            "t",
            "b",
            Origin::Backend
        ));
    }

    #[test]
    fn one_the_os_refuses_isnt_shown() {
        let f = fixture();
        f.platform.fail("notify");
        assert!(!post(
            &f.state,
            NotificationKind::General,
            "t",
            "b",
            Origin::App
        ));
    }
}
