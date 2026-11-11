//! OS notifications. Every one goes through `post`, which applies the user's
//! notification preferences (sent by the app via set_notification_preferences;
//! the rules are in taskmint_core::notifications) and the sound setting. The
//! ones the backend shows itself (the long-run reminder, an idle pause) are
//! also announced to the frontend so they appear in its notification history.
//!
//! On a phone the app also sets notifications for later (`schedule`), which
//! the system shows at their time with the app closed.

use crate::events::{emit_quiet, NOTIFICATION_POSTED};
use crate::platform::ScheduledNotification;
use crate::state::Shell;
use chrono::{DateTime, Utc};
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

/// Sets a notification for the system to show at `at`, replacing any set
/// before with `id`, if the preferences allow it and `at` is still to come.
/// Otherwise the one set before is taken back, so a reminder that's off or
/// past doesn't fire. Returns whether it was set.
pub fn schedule(
    shell: &Shell,
    kind: NotificationKind,
    id: i32,
    at: DateTime<Utc>,
    title: &str,
    body: &str,
) -> bool {
    let prefs = shell.with_notification_prefs(|prefs| prefs.clone());
    if !prefs.allows(kind) || at <= (shell.clock)() {
        log::debug!("Notification {:?} for {} not set", kind, at);
        cancel(shell, id);
        return false;
    }
    let scheduled = ScheduledNotification {
        id,
        at,
        title: title.to_string(),
        body: body.to_string(),
        sound: prefs.sound,
    };
    match shell.platform.schedule_notification(&scheduled) {
        Ok(()) => true,
        Err(e) => {
            log::warn!("Failed to set a notification for later: {}", e);
            false
        }
    }
}

/// Takes back the notification set with `id`, if it's still to come.
pub fn cancel(shell: &Shell, id: i32) {
    if let Err(e) = shell.platform.cancel_notification(id) {
        log::warn!("Failed to take back a notification set for later: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{fixture, start};
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

    #[test]
    fn a_notification_for_later_is_set_with_the_sound_setting() {
        let f = fixture();
        f.state
            .with_notification_prefs_mut(|prefs| prefs.sound = true);
        let at = start() + chrono::Duration::hours(3);

        assert!(schedule(
            &f.state,
            NotificationKind::WithdrawalReady,
            7,
            at,
            "Withdrawal ready",
            "$80.00"
        ));

        assert_eq!(
            f.platform.recorded().scheduled,
            [ScheduledNotification {
                id: 7,
                at,
                title: "Withdrawal ready".to_string(),
                body: "$80.00".to_string(),
                sound: true,
            }]
        );
        assert!(f.platform.recorded().cancelled.is_empty());
    }

    #[test]
    fn one_thats_off_or_past_is_taken_back_instead() {
        let f = fixture();
        assert!(!schedule(
            &f.state,
            NotificationKind::WithdrawalReady,
            7,
            start(),
            "t",
            "b"
        ));
        f.state
            .with_notification_prefs_mut(|prefs| prefs.desktop_enabled = false);
        assert!(!schedule(
            &f.state,
            NotificationKind::WithdrawalReady,
            7,
            start() + chrono::Duration::hours(1),
            "t",
            "b"
        ));

        assert!(f.platform.recorded().scheduled.is_empty());
        assert_eq!(f.platform.recorded().cancelled, [7, 7]);
    }

    #[test]
    fn one_the_system_refuses_isnt_set() {
        let f = fixture();
        f.platform.fail("schedule");
        assert!(!schedule(
            &f.state,
            NotificationKind::WithdrawalReady,
            7,
            start() + chrono::Duration::hours(1),
            "t",
            "b"
        ));
    }

    #[test]
    fn taking_one_back_survives_the_system_refusing() {
        let f = fixture();
        cancel(&f.state, 7);
        assert_eq!(f.platform.recorded().cancelled, [7]);
        f.platform.fail("cancel");
        cancel(&f.state, 8);
        assert_eq!(f.platform.recorded().cancelled, [7]);
    }
}
