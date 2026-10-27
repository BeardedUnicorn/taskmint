// System-wide idle detection.
//
// The webview only sees input inside TaskMint's own window, so work done in
// another app looked idle. This reads the operating system's idle time (time
// since the last keyboard or mouse input anywhere) and, past the threshold,
// pauses the running timer as of when the user went idle, so the away time
// isn't counted. When input returns, the app comes forward and asks whether
// to discard the away time (resume), keep it (resume, counting it), or stay
// paused. The pending question is in memory only: after a restart the timer
// simply stays paused. The decisions are in taskmint_core::idle; this module
// samples the system and acts on them.

use crate::events;
use crate::notifications::{self, Origin};
use crate::state::AppState;
use crate::ticker::Ticker;
use chrono::{DateTime, Utc};
use taskmint_core::command::{ApplyIdleChoiceArgs, Command, PauseTimerAtArgs};
use taskmint_core::idle::{idle_tick, long_run_tick, IdleAction, IdleChoice, IdlePause, LongRun};
use taskmint_core::notifications::NotificationKind;
use taskmint_core::DayZone;

/// How often the monitor samples the system idle time.
const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(5);

// ============================================================================
// PLATFORM IDLE TIME
// ============================================================================

#[cfg(target_os = "macos")]
pub fn system_idle_ms() -> Option<u64> {
    // kCGEventSourceStateHIDSystemState = 1, kCGAnyInputEventType = ~0
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
    }
    let seconds = unsafe { CGEventSourceSecondsSinceLastEventType(1, u32::MAX) };
    (seconds.is_finite() && seconds >= 0.0).then_some((seconds * 1000.0) as u64)
}

#[cfg(target_os = "windows")]
pub fn system_idle_ms() -> Option<u64> {
    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(plii: *mut LastInputInfo) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount() -> u32;
    }
    let mut info = LastInputInfo {
        cb_size: std::mem::size_of::<LastInputInfo>() as u32,
        dw_time: 0,
    };
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return None;
    }
    // Both are 32-bit millisecond tick counts that wrap every ~49.7 days
    Some(unsafe { GetTickCount() }.wrapping_sub(info.dw_time) as u64)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn system_idle_ms() -> Option<u64> {
    None
}

/// Whether this platform can report system idle time at all.
pub fn is_supported() -> bool {
    system_idle_ms().is_some()
}

// ============================================================================
// RUNTIME
// ============================================================================

/// Pause the running timer as of `idle_since`, and record the pending
/// question.
fn apply_pause(
    state: &AppState,
    instance_id: String,
    task_name: String,
    idle_since: DateTime<Utc>,
) -> Result<(), String> {
    let paused = state.backend.call(Command::PauseTimerAt(PauseTimerAtArgs {
        instance_id: instance_id.clone(),
        idle_since,
    }))?;
    // The timer stopped running in the meantime
    if paused != serde_json::Value::Bool(true) {
        return Ok(());
    }
    let since = DayZone::Local.time_label(idle_since);
    log::info!(
        "Idle: paused '{}' as of {} (no input since then)",
        task_name,
        since
    );
    notifications::post(
        state,
        NotificationKind::IdlePause,
        "Timer paused",
        &format!(
            "{} — no activity since {}. The away time isn't counted unless you keep it.",
            task_name, since
        ),
        Origin::Backend,
    );
    state.with_idle_mut(|idle| {
        idle.pause = Some(IdlePause {
            instance_id,
            task_name,
            idle_since,
            returned_at: None,
        })
    });
    crate::tray::sync(state);
    Ok(())
}

/// Input came back: bring the app forward with the question.
fn apply_return(state: &AppState, now: DateTime<Utc>) {
    let payload = state.with_idle_mut(|idle| {
        idle.pause.as_mut().map(|pause| {
            pause.returned_at = Some(now);
            pause.payload(now)
        })
    });
    if let Some(payload) = payload {
        log::info!("Idle: input returned after {} ms away", payload.away_ms);
        events::emit_quiet(state, events::IDLE_RETURNED, &payload);
        state.platform.show_main_window();
        crate::tray::sync(state);
    }
}

fn clear_pending(state: &AppState) {
    state.with_idle_mut(|idle| idle.pause = None);
    events::emit_quiet(state, events::IDLE_RESOLVED, ());
    crate::tray::sync(state);
}

/// Answer the pending question (from the app's dialog or the tray):
/// "discardResume", "keepResume" or "stayPaused".
pub fn resolve(state: &AppState, choice: &str) -> Result<(), String> {
    IdleChoice::parse(choice)?;
    let Some(pause) = state.with_idle(|idle| idle.pause.clone()) else {
        return Ok(());
    };
    state
        .backend
        .call(Command::ApplyIdleChoice(ApplyIdleChoiceArgs {
            instance_id: pause.instance_id,
            choice: choice.to_string(),
        }))?;
    clear_pending(state);
    Ok(())
}

/// Remind once per run, with a native notification.
fn apply_long_run(state: &AppState, long_run: LongRun) {
    log::info!("Long-run reminder for '{}'", long_run.task_name);
    notifications::post(
        state,
        NotificationKind::LongRun,
        "Still working?",
        &format!(
            "{}'s timer has been running for {}.",
            long_run.task_name,
            crate::utils::format_duration_hm(long_run.run_ms)
        ),
        Origin::Backend,
    );
    state.with_idle_mut(|idle| idle.long_run_reminded = Some(long_run.key));
}

/// One monitor step: the long-run reminder, and (where the system reports
/// idle time, `idle_ms`) idle detection.
pub fn tick(state: &AppState, idle_ms: Option<u64>) {
    let now = (state.clock)();
    let idle_state = state.with_idle(|idle| idle.clone());
    let long_run = state.backend.read(|workspace| {
        long_run_tick(
            &workspace.sessions,
            idle_state.long_run_reminded.as_deref(),
            idle_state.settings.long_run_hours,
            now,
        )
    });
    if let Some(long_run) = long_run {
        apply_long_run(state, long_run);
    }

    let Some(idle_ms) = idle_ms else {
        return;
    };
    let action = state
        .backend
        .read(|workspace| idle_tick(&workspace.sessions, &idle_state, idle_ms, now));
    match action {
        IdleAction::None => {}
        IdleAction::Pause {
            instance_id,
            task_name,
            idle_since,
        } => {
            if let Err(e) = apply_pause(state, instance_id, task_name, idle_since) {
                log::error!("Idle monitor: {}", e);
            }
        }
        IdleAction::Returned => apply_return(state, now),
        IdleAction::ClearPending => clear_pending(state),
    }
}

/// Every few seconds, for as long as the app runs.
pub fn start_monitor(state: &AppState) -> Ticker {
    log::info!("System idle time is available: {}", is_supported());
    monitor(state, POLL_INTERVAL)
}

fn monitor(state: &AppState, interval: std::time::Duration) -> Ticker {
    let state = state.clone();
    Ticker::start("idle", interval, move || tick(&state, system_idle_ms()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{fixture, Fixture};
    use serde_json::json;
    use taskmint_core::idle::IdleSettings;

    const MIN_MS: u64 = 60_000;

    // Exercises the real CoreGraphics call: it must link and answer without
    // any permission prompt (the value is seconds since the last input).
    #[cfg(target_os = "macos")]
    #[test]
    fn reads_the_system_idle_time() {
        let idle_ms = system_idle_ms().expect("macOS reports system idle time");
        assert!(idle_ms < 365 * 24 * 60 * MIN_MS);
        assert!(is_supported());
    }

    /// A fixture with a running timer and the given detection settings.
    fn running(settings: IdleSettings) -> (Fixture, String) {
        let f = fixture();
        let started = f
            .state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();
        f.state.with_idle_mut(|idle| idle.settings = settings);
        (f, started["instanceId"].as_str().unwrap().to_string())
    }

    fn detecting() -> IdleSettings {
        IdleSettings {
            enabled: true,
            threshold_minutes: 5,
            long_run_hours: 0,
        }
    }

    fn is_paused(f: &Fixture) -> bool {
        f.state
            .backend
            .read(|w| w.sessions[0].timer_instances[0].is_paused)
    }

    #[test]
    fn going_idle_pauses_the_timer_as_of_when_input_stopped() {
        let (f, instance_id) = running(detecting());
        f.advance_ms(20 * MIN_MS as i64);

        tick(&f.state, Some(10 * MIN_MS));

        assert!(is_paused(&f));
        let pause = f.state.with_idle(|idle| idle.pause.clone()).unwrap();
        assert_eq!(pause.instance_id, instance_id);
        assert_eq!(
            pause.idle_since,
            crate::testing::start() + chrono::Duration::minutes(10)
        );
        assert_eq!(f.platform.recorded().notifications[0].0, "Timer paused");
        assert_eq!(
            f.platform.event_names()[1..],
            ["timer-instance-paused", "notification-posted"]
        );

        // Input comes back: the app comes forward with the question
        tick(&f.state, Some(1_000));
        assert_eq!(f.platform.event_names().last().unwrap(), "idle-returned");
        assert_eq!(f.platform.recorded().windows_shown, 1);
        assert!(f
            .state
            .with_idle(|idle| idle.pause.as_ref().unwrap().returned_at.is_some()));

        // Answered in the app: the timer resumes and the question goes
        resolve(&f.state, "discardResume").unwrap();
        assert!(!is_paused(&f));
        assert_eq!(f.platform.event_names().last().unwrap(), "idle-resolved");
        assert!(f.state.with_idle(|idle| idle.pause.is_none()));
    }

    #[test]
    fn a_question_whose_timer_was_resumed_elsewhere_goes_away() {
        let (f, instance_id) = running(detecting());
        f.advance_ms(20 * MIN_MS as i64);
        tick(&f.state, Some(10 * MIN_MS));
        f.state
            .backend
            .call_named(
                "resume_timer_instance",
                json!({ "instanceId": instance_id }),
            )
            .unwrap();

        tick(&f.state, Some(10 * MIN_MS));

        assert!(f.state.with_idle(|idle| idle.pause.is_none()));
        assert_eq!(f.platform.event_names().last().unwrap(), "idle-resolved");
    }

    #[test]
    fn short_idle_spells_and_no_sample_change_nothing() {
        let (f, _) = running(detecting());
        tick(&f.state, Some(MIN_MS));
        tick(&f.state, None);
        assert!(!is_paused(&f));
    }

    #[test]
    fn a_pause_that_cant_be_saved_is_logged_and_asks_nothing() {
        let (f, _) = running(detecting());
        std::fs::create_dir(f.dir.0.join("sessions.json.tmp")).unwrap();
        f.advance_ms(20 * MIN_MS as i64);

        tick(&f.state, Some(10 * MIN_MS));

        assert!(f.state.with_idle(|idle| idle.pause.is_none()));
        assert!(f.platform.recorded().notifications.is_empty());
    }

    #[test]
    fn a_timer_already_stopped_isnt_paused() {
        let f = fixture();
        assert_eq!(
            apply_pause(
                &f.state,
                "gone".to_string(),
                "Writing".to_string(),
                crate::testing::start()
            ),
            Ok(())
        );
        assert!(f.state.with_idle(|idle| idle.pause.is_none()));
        // Nothing pending: nothing to come back to
        apply_return(&f.state, crate::testing::start());
        assert!(f.platform.event_names().is_empty());
    }

    #[test]
    fn answering_checks_the_choice_and_needs_a_question() {
        let f = fixture();
        assert_eq!(
            resolve(&f.state, "maybe"),
            Err("Unknown choice: maybe".to_string())
        );
        assert_eq!(resolve(&f.state, "keepResume"), Ok(()));
        f.state.with_idle_mut(|idle| {
            idle.pause = Some(IdlePause {
                instance_id: "gone".to_string(),
                task_name: "Writing".to_string(),
                idle_since: crate::testing::start(),
                returned_at: None,
            })
        });
        assert_eq!(
            resolve(&f.state, "keepResume"),
            Err("The paused timer no longer exists".to_string())
        );
    }

    #[test]
    fn a_long_run_is_reminded_about_once() {
        let (f, _) = running(IdleSettings {
            enabled: false,
            threshold_minutes: 0,
            long_run_hours: 2,
        });
        f.advance_ms(2 * 60 * MIN_MS as i64);

        tick(&f.state, None);
        tick(&f.state, None);

        let notifications = &f.platform.recorded().notifications;
        assert_eq!(notifications.len(), 1);
        assert_eq!(
            notifications[0].1,
            "Writing's timer has been running for 02:00."
        );
    }

    #[test]
    fn the_monitor_samples_the_system_until_stopped() {
        let (f, _) = running(IdleSettings {
            enabled: false,
            threshold_minutes: 0,
            long_run_hours: 1,
        });
        f.advance_ms(60 * MIN_MS as i64);
        let ticker = monitor(&f.state, std::time::Duration::from_millis(1));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while f.platform.recorded().notifications.is_empty() {
            assert!(
                std::time::Instant::now() < deadline,
                "the monitor never ticked"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        ticker.stop();
        start_monitor(&f.state).stop();
    }
}
