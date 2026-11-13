//! A phone's running-timer notification: the task, its time counting up
//! (the system draws the clock), and buttons to pause or resume, switch
//! task, or stop. It follows the sessions as the tray does on a desktop
//! (state.rs publishes each change to both), so a timer started on Home, by
//! a button here, or on another device through sync all show.
//!
//! It shows only on a phone (app.rs enables it) and only once the page is up
//! (`start`, from take_opened_notification): the notification plugin is
//! ready only once the webview has loaded. It follows the "System
//! notifications" switch in Settings; the phone's settings can turn off its
//! channel on its own.
//!
//! The system takes it down when it's tapped, and the user can swipe it
//! away. A tap or a button puts it back (`refresh`); a swipe leaves it gone
//! until the timer changes.

use crate::notifications::{self, TAPPED};
use crate::state::AppState;
use crate::tray::{self, model::TrayAction};
use chrono::{DateTime, Duration, Utc};
use taskmint_core::sessions::start::{live_timer, LiveTimer};
use taskmint_core::shell::{MenuCommand, MenuView};

/// The notification's id: showing it again replaces it.
pub const TIMER_NOTICE_ID: i32 = 4200;

/// Its buttons, as the system reports them back.
pub const PAUSE: &str = "pause";
pub const RESUME: &str = "resume";
pub const SWITCH: &str = "switch";
pub const STOP: &str = "stop";

/// The running timer's notification, as it should look.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimerNotice {
    pub task_name: String,
    /// While it runs: when it would have started had it never paused, which
    /// the system's clock counts up from. None while paused.
    pub counting_from: Option<DateTime<Utc>>,
    /// The line under the task.
    pub text: String,
}

impl TimerNotice {
    pub fn of(live: &LiveTimer, now: DateTime<Utc>) -> Self {
        let task_name = live.task_name.clone();
        match live.is_paused {
            true => Self {
                task_name,
                counting_from: None,
                text: format!("Paused at {}", in_words(live.elapsed_ms)),
            },
            false => Self {
                task_name,
                counting_from: Some(now - Duration::milliseconds(live.elapsed_ms as i64)),
                text: "Running".to_string(),
            },
        }
    }

    pub fn is_paused(&self) -> bool {
        self.counting_from.is_none()
    }
}

/// "1h 23m", "23m", "0m": the app's way of giving a finished time.
fn in_words(ms: u64) -> String {
    let minutes = ms / 60_000;
    match minutes / 60 {
        0 => format!("{}m", minutes),
        hours => format!("{}h {}m", hours, minutes % 60),
    }
}

/// Whether there is one, and what was last shown.
#[derive(Debug, Default)]
pub struct TimerNoticeState {
    /// This device shows one (a phone).
    pub enabled: bool,
    /// The page is up, so the notification plugin is ready.
    pub ready: bool,
    /// What was last shown (Some(None): taken down); None until shown once,
    /// or after the system took it down.
    pub shown: Option<Option<TimerNotice>>,
}

/// This device shows the running timer in a notification (a phone).
pub fn enable(state: &AppState) {
    state.with_timer_notice_mut(|notice| notice.enabled = true);
}

/// The page is up: shows the timer as it is now. After a restart that puts
/// back a notification the timer still needs, or takes down one it doesn't.
pub fn start(state: &AppState) {
    state.with_timer_notice_mut(|notice| notice.ready = true);
    sync(state);
}

/// What the notification should be now: none without a live timer, or with
/// system notifications turned off.
fn wanted(state: &AppState) -> Option<TimerNotice> {
    if !state.with_notification_prefs(|prefs| prefs.desktop_enabled) {
        return None;
    }
    let now = (state.clock)();
    state
        .backend
        .read(|workspace| live_timer(&workspace.sessions, now))
        .map(|live| TimerNotice::of(&live, now))
}

/// Shows the notification as the timer is now, if that changed.
pub fn sync(state: &AppState) {
    let (on, shown) =
        state.with_timer_notice(|notice| (notice.enabled && notice.ready, notice.shown.clone()));
    if !on {
        return;
    }
    let notice = wanted(state);
    if shown.as_ref() == Some(&notice) {
        return;
    }
    // (No lock held while the system shows it)
    match state.platform.set_timer_notice(notice.as_ref()) {
        Ok(()) => state.with_timer_notice_mut(|shown| shown.shown = Some(notice)),
        Err(e) => log::error!("Failed to show the running timer's notification: {}", e),
    }
}

/// Shows it again, whatever was shown before: the system took it down.
pub fn refresh(state: &AppState) {
    state.with_timer_notice_mut(|notice| notice.shown = None);
    sync(state);
}

/// The user tapped the notification or one of its buttons (`action`). The
/// system brings the app forward for either; a tap opens Sessions.
pub fn performed(state: &AppState, action: &str) {
    match action {
        PAUSE => tray::run(state, TrayAction::PauseTimer),
        RESUME => tray::run(state, TrayAction::ResumeTimer),
        STOP => tray::run(state, TrayAction::StopTimer),
        SWITCH => notifications::open(state, MenuCommand::StartWork),
        TAPPED => notifications::open(
            state,
            MenuCommand::ShowView {
                view: MenuView::Sessions,
            },
        ),
        // Swiped away: it stays gone until the timer changes
        _ => return,
    }
    state.platform.show_main_window();
    refresh(state);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{fixture, start as started_at, Fixture};
    use serde_json::json;

    fn with_tasks() -> Fixture {
        let f = fixture();
        f.state
            .backend
            .call_named(
                "set_app_record",
                json!({ "key": "predefinedTasks", "value": [
                    { "id": "t1", "name": "Writing", "createdAt": "x", "updatedAt": "x" }
                ] }),
            )
            .unwrap();
        f
    }

    fn call(f: &Fixture, command: &str) {
        f.state
            .backend
            .call_named(command, json!({ "taskId": "t1", "taskName": "Writing" }))
            .unwrap();
    }

    /// A phone whose page is up.
    fn phone(f: &Fixture) {
        enable(&f.state);
        start(&f.state);
    }

    fn shown(f: &Fixture) -> Vec<Option<TimerNotice>> {
        f.platform.recorded().timer_notices.clone()
    }

    fn running_since(at: DateTime<Utc>) -> Option<TimerNotice> {
        Some(TimerNotice {
            task_name: "Writing".to_string(),
            counting_from: Some(at),
            text: "Running".to_string(),
        })
    }

    #[test]
    fn a_running_timer_counts_up_from_when_it_would_have_started() {
        let f = with_tasks();
        phone(&f);
        // Nothing runs at start: any left from before is taken down
        assert_eq!(shown(&f), [None]);

        call(&f, "start_task");
        assert_eq!(shown(&f)[1], running_since(started_at()));
        assert!(!shown(&f)[1].as_ref().unwrap().is_paused());

        // Time passing alone changes nothing: the system's clock counts
        f.advance_ms(60_000);
        sync(&f.state);
        assert_eq!(shown(&f).len(), 2);
    }

    #[test]
    fn a_paused_timer_says_where_it_stopped_and_resuming_skips_the_pause() {
        let f = with_tasks();
        phone(&f);
        call(&f, "start_task");
        f.advance_ms(83 * 60_000);
        call(&f, "pause_live_timer");
        let paused = shown(&f).last().cloned().unwrap().unwrap();
        assert!(paused.is_paused());
        assert_eq!(paused.text, "Paused at 1h 23m");

        // Ten minutes paused: it counts from ten minutes later
        f.advance_ms(10 * 60_000);
        call(&f, "start_task");
        assert_eq!(
            shown(&f).last().cloned().unwrap(),
            running_since(started_at() + Duration::minutes(10))
        );

        call(&f, "stop_live_timer");
        assert_eq!(shown(&f).last().cloned().unwrap(), None);
    }

    #[test]
    fn short_times_read_in_minutes() {
        assert_eq!(in_words(0), "0m");
        assert_eq!(in_words(23 * 60_000 + 59_000), "23m");
        assert_eq!(in_words(2 * 3_600_000), "2h 0m");
    }

    #[test]
    fn a_desktop_or_a_page_not_yet_up_shows_none() {
        let f = with_tasks();
        call(&f, "start_task");
        start(&f.state);
        assert!(shown(&f).is_empty());

        let f = with_tasks();
        enable(&f.state);
        call(&f, "start_task");
        assert!(shown(&f).is_empty());
        // The page comes up: the timer shows
        start(&f.state);
        assert_eq!(shown(&f), [running_since(started_at())]);
    }

    #[test]
    fn it_follows_the_system_notifications_switch() {
        let f = with_tasks();
        phone(&f);
        call(&f, "start_task");
        f.state
            .with_notification_prefs_mut(|prefs| prefs.desktop_enabled = false);
        sync(&f.state);
        assert_eq!(shown(&f).last().cloned().unwrap(), None);
    }

    #[test]
    fn a_failure_to_show_it_is_tried_again_next_time() {
        let f = with_tasks();
        enable(&f.state);
        f.platform.fail("timer_notice");
        start(&f.state);
        call(&f, "start_task");
        assert!(shown(&f).is_empty());

        f.platform.heal("timer_notice");
        sync(&f.state);
        assert_eq!(shown(&f), [running_since(started_at())]);
    }

    #[test]
    fn its_buttons_pause_resume_and_stop_the_timer() {
        let f = with_tasks();
        phone(&f);
        call(&f, "start_task");

        performed(&f.state, PAUSE);
        assert!(shown(&f).last().cloned().unwrap().unwrap().is_paused());
        performed(&f.state, RESUME);
        assert!(!shown(&f).last().cloned().unwrap().unwrap().is_paused());
        performed(&f.state, STOP);
        assert_eq!(shown(&f).last().cloned().unwrap(), None);
        // Each brought the app forward (the system opens it for a button)
        assert_eq!(f.platform.recorded().windows_shown, 3);
    }

    #[test]
    fn a_tap_opens_sessions_and_switch_the_start_dialog_and_both_put_it_back() {
        let f = with_tasks();
        phone(&f);
        call(&f, "start_task");
        let before = shown(&f).len();

        performed(&f.state, TAPPED);
        assert_eq!(
            notifications::take_opened(&f.state),
            Some(MenuCommand::ShowView {
                view: MenuView::Sessions
            })
        );
        performed(&f.state, SWITCH);
        assert_eq!(
            notifications::take_opened(&f.state),
            Some(MenuCommand::StartWork)
        );
        // The system took it down for each; it's back
        assert_eq!(shown(&f).len(), before + 2);
        assert_eq!(
            shown(&f).last().cloned().unwrap(),
            running_since(started_at())
        );
    }

    #[test]
    fn swiping_it_away_leaves_it_gone_until_the_timer_changes() {
        let f = with_tasks();
        phone(&f);
        call(&f, "start_task");
        let before = shown(&f).len();
        performed(&f.state, "dismiss");
        assert_eq!(shown(&f).len(), before);
        assert_eq!(f.platform.recorded().windows_shown, 0);
    }
}
