//! OS notifications. Every one goes through `post`, which applies the user's
//! notification preferences (sent by the app via set_notification_preferences;
//! the rules are in taskmint_core::notifications) and the sound setting. The
//! ones the backend shows itself (the long-run reminder, an idle pause) are
//! also announced to the frontend so they appear in its notification history.
//!
//! On a phone the app also sets notifications for later (`schedule`), which
//! the system shows at their time with the app closed.
//!
//! Each kind goes in a channel (Android lists them in its settings, to
//! silence one or let it pop up) and says which page tapping it opens. A tap
//! is kept until the page takes it (`take_opened`): the tap may be what
//! started the app, before the page could hear of it.

use crate::events::{emit_quiet, NOTIFICATION_OPENED, NOTIFICATION_POSTED};
use crate::platform::{Channel, ScheduledNotification, ShownNotification};
use crate::state::{AppState, Shell};
use crate::timer_notice::{self, TIMER_NOTICE_ID};
use chrono::{DateTime, Utc};
use serde::Serialize;
use taskmint_core::notifications::NotificationKind;
use taskmint_core::shell::{MenuCommand, MenuView};

/// What the system reports when the user taps a notification itself (not
/// one of its buttons).
pub const TAPPED: &str = "tap";

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

/// The channel a kind of notification goes in: the same two groups as
/// Settings → Notifications.
pub fn channel_of(kind: NotificationKind) -> Channel {
    use NotificationKind::*;
    match kind {
        GoalMilestone | LongRun | IdlePause | DailySummary | WithdrawalReady | Test => {
            Channel::Reminders
        }
        General | WorkLogCapture | BackupFailure | BackupSuccess | Error => Channel::Activity,
    }
}

/// What tapping a kind of notification opens: the page it's about (None:
/// the app as it was).
pub fn opens(kind: NotificationKind) -> Option<MenuCommand> {
    use NotificationKind::*;
    let page = |view| Some(MenuCommand::ShowView { view });
    match kind {
        GoalMilestone | DailySummary => page(MenuView::Home),
        LongRun | IdlePause => page(MenuView::Sessions),
        WithdrawalReady | WorkLogCapture => page(MenuView::Payouts),
        BackupFailure => Some(MenuCommand::Settings),
        General | BackupSuccess | Error | Test => None,
    }
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
    let notification = ShownNotification {
        title: title.to_string(),
        body: body.to_string(),
        sound: prefs.sound,
        channel: channel_of(kind),
        opens: opens(kind),
    };
    if let Err(e) = shell.platform.notify(&notification) {
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
        channel: channel_of(kind),
        opens: opens(kind),
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

/// The system reported `action` (a tap, a button, a swipe away) on the
/// notification `id`; `opens` is what the notification said tapping it
/// opens. A tap brings the app forward, on the page it's about. The running
/// timer's notification has buttons of its own (timer_notice).
pub fn performed(state: &AppState, action: &str, id: Option<i32>, opens: Option<MenuCommand>) {
    if id == Some(TIMER_NOTICE_ID) {
        return timer_notice::performed(state, action);
    }
    if action != TAPPED {
        return;
    }
    state.platform.show_main_window();
    if let Some(command) = opens {
        open(state, command);
    }
}

/// Keeps `command` for the app to run (`take_opened`), and tells it so.
pub fn open(shell: &Shell, command: MenuCommand) {
    shell.with_opened_notification_mut(|opened| *opened = Some(command));
    emit_quiet(shell, NOTIFICATION_OPENED, ());
}

/// What the last tapped notification opens, once. The page asks as soon as
/// it's up (the tap may have started the app) and whenever it hears of a
/// tap.
pub fn take_opened(shell: &Shell) -> Option<MenuCommand> {
    shell.with_opened_notification_mut(Option::take)
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
            [ShownNotification {
                title: "Still working?".to_string(),
                body: "4h".to_string(),
                sound: true,
                channel: Channel::Reminders,
                opens: Some(MenuCommand::ShowView {
                    view: MenuView::Sessions
                }),
            }]
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
        assert!(!platform.recorded().notifications[0].sound);
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
                channel: Channel::Reminders,
                opens: Some(MenuCommand::ShowView {
                    view: MenuView::Payouts
                }),
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

    #[test]
    fn each_kind_goes_in_its_settings_group_and_opens_its_page() {
        use NotificationKind::*;
        let page = |view| Some(MenuCommand::ShowView { view });
        let cases = [
            (GoalMilestone, Channel::Reminders, page(MenuView::Home)),
            (DailySummary, Channel::Reminders, page(MenuView::Home)),
            (LongRun, Channel::Reminders, page(MenuView::Sessions)),
            (IdlePause, Channel::Reminders, page(MenuView::Sessions)),
            (WithdrawalReady, Channel::Reminders, page(MenuView::Payouts)),
            (Test, Channel::Reminders, None),
            (WorkLogCapture, Channel::Activity, page(MenuView::Payouts)),
            (
                BackupFailure,
                Channel::Activity,
                Some(MenuCommand::Settings),
            ),
            (BackupSuccess, Channel::Activity, None),
            (General, Channel::Activity, None),
            (Error, Channel::Activity, None),
        ];
        for (kind, channel, page) in cases {
            assert_eq!(
                (channel_of(kind), opens(kind)),
                (channel, page),
                "{:?}",
                kind
            );
        }
    }

    #[test]
    fn a_tap_brings_the_app_forward_and_keeps_its_page_for_the_app() {
        let f = fixture();
        let payouts = MenuCommand::ShowView {
            view: MenuView::Payouts,
        };
        performed(&f.state, TAPPED, Some(7), Some(payouts));

        assert_eq!(f.platform.recorded().windows_shown, 1);
        assert_eq!(f.platform.event_names(), ["notification-opened"]);
        // The page takes it once
        assert_eq!(take_opened(&f.state), Some(payouts));
        assert_eq!(take_opened(&f.state), None);
    }

    #[test]
    fn a_tap_on_one_about_no_page_only_brings_the_app_forward() {
        let f = fixture();
        performed(&f.state, TAPPED, Some(7), None);
        assert_eq!(f.platform.recorded().windows_shown, 1);
        assert!(f.platform.event_names().is_empty());
        assert_eq!(take_opened(&f.state), None);
    }

    #[test]
    fn the_running_timers_notification_answers_its_own_taps() {
        let f = fixture();
        // Whatever it says, a tap on it opens Sessions
        performed(&f.state, TAPPED, Some(TIMER_NOTICE_ID), None);
        assert_eq!(
            take_opened(&f.state),
            Some(MenuCommand::ShowView {
                view: MenuView::Sessions
            })
        );
    }

    #[test]
    fn swiping_one_away_does_nothing() {
        let f = fixture();
        performed(&f.state, "dismiss", None, Some(MenuCommand::Settings));
        assert_eq!(f.platform.recorded().windows_shown, 0);
        assert_eq!(take_opened(&f.state), None);
    }
}
