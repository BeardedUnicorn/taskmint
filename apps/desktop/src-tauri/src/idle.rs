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
use crate::storage;
use chrono::{DateTime, Utc};
use taskmint_core::idle::{
    apply_idle_choice, idle_tick, long_run_tick, pause_for_idle, IdleAction, IdleChoice, IdlePause,
    LongRun,
};
use taskmint_core::notifications::NotificationKind;
use taskmint_core::DayZone;
use tauri::AppHandle;

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

/// Pause the running timer as of `idle_since`, persist, and record the
/// pending question.
fn apply_pause(
    app: &AppHandle,
    state: &AppState,
    instance_id: &str,
    task_name: &str,
    idle_since: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Result<(), String> {
    let paused = state.with_task_sessions_mut(|sessions| -> Result<bool, String> {
        if !pause_for_idle(sessions, instance_id, idle_since, now) {
            return Ok(false);
        }
        storage::save_sessions(app, sessions)?;
        Ok(true)
    })??;
    if !paused {
        return Ok(());
    }

    state.with_idle_mut(|idle| {
        idle.pause = Some(IdlePause {
            instance_id: instance_id.to_string(),
            task_name: task_name.to_string(),
            idle_since,
            returned_at: None,
        });
    })?;
    log::info!(
        "Idle: paused '{}' as of {} (no input since then)",
        task_name,
        idle_since.to_rfc3339()
    );
    events::emit_instance_event(
        app,
        events::TIMER_INSTANCE_PAUSED,
        instance_id,
        "pausedAt",
        idle_since,
    );
    notifications::post(
        app,
        state,
        NotificationKind::IdlePause,
        "Timer paused",
        &format!(
            "{} — no activity since {}. The away time isn't counted unless you keep it.",
            task_name,
            DayZone::Local.time_label(idle_since)
        ),
        Origin::Backend,
    );
    crate::tray::sync_tray(app, state);
    Ok(())
}

fn apply_return(app: &AppHandle, state: &AppState, now: DateTime<Utc>) -> Result<(), String> {
    let payload = state.with_idle_mut(|idle| {
        idle.pause.as_mut().map(|pause| {
            pause.returned_at = Some(now);
            pause.payload(now)
        })
    })?;
    if let Some(payload) = payload {
        log::info!("Idle: input returned after {} ms away", payload.away_ms);
        events::emit_quiet(app, events::IDLE_RETURNED, &payload);
        crate::tray::show_main_window(app);
        crate::tray::sync_tray(app, state);
    }
    Ok(())
}

fn clear_pending(app: &AppHandle, state: &AppState) -> Result<(), String> {
    state.with_idle_mut(|idle| idle.pause = None)?;
    events::emit_quiet(app, events::IDLE_RESOLVED, ());
    crate::tray::sync_tray(app, state);
    Ok(())
}

/// Answer the pending question (from the app's dialog or the tray).
pub fn resolve(app: &AppHandle, state: &AppState, choice: IdleChoice) -> Result<(), String> {
    let now = Utc::now();
    let Some(pause) = state.with_idle(|idle| idle.pause.clone())? else {
        return Ok(());
    };
    let resumed = state.with_task_sessions_mut(|sessions| -> Result<bool, String> {
        let resumed = apply_idle_choice(sessions, &pause, choice, now)?;
        if resumed {
            storage::save_sessions(app, sessions)?;
        }
        Ok(resumed)
    })??;
    if resumed {
        events::emit_instance_event(
            app,
            events::TIMER_INSTANCE_RESUMED,
            &pause.instance_id,
            "resumedAt",
            now,
        );
    }
    clear_pending(app, state)
}

/// Remind once per run, with a native notification.
fn apply_long_run(app: &AppHandle, state: &AppState, long_run: LongRun) -> Result<(), String> {
    state.with_idle_mut(|idle| idle.long_run_reminded = Some(long_run.key.clone()))?;
    log::info!("Long-run reminder for '{}'", long_run.task_name);
    notifications::post(
        app,
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
    Ok(())
}

/// Every few seconds: the long-run reminder, and (where the system reports
/// idle time) idle detection.
pub fn start_idle_monitor(app: &AppHandle, state: &AppState) {
    if !is_supported() {
        log::info!("Idle detection is not supported on this platform");
    }
    let app = app.clone();
    let state = state.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL_INTERVAL);
        let now = Utc::now();
        let Ok(idle_state) = state.with_idle(|idle| idle.clone()) else {
            continue;
        };

        let long_run = state
            .with_task_sessions(|sessions| {
                long_run_tick(
                    sessions,
                    idle_state.long_run_reminded.as_deref(),
                    idle_state.settings.long_run_hours,
                    now,
                )
            })
            .ok()
            .flatten();
        if let Some(long_run) = long_run {
            if let Err(e) = apply_long_run(&app, &state, long_run) {
                log::error!("Long-run reminder: {}", e);
            }
        }

        let Some(idle_ms) = system_idle_ms() else {
            continue;
        };
        let action = state
            .with_task_sessions(|sessions| idle_tick(sessions, &idle_state, idle_ms, now))
            .unwrap_or(IdleAction::None);
        let result = match action {
            IdleAction::None => Ok(()),
            IdleAction::Pause {
                instance_id,
                task_name,
                idle_since,
            } => apply_pause(&app, &state, &instance_id, &task_name, idle_since, now),
            IdleAction::Returned => apply_return(&app, &state, now),
            IdleAction::ClearPending => clear_pending(&app, &state),
        };
        if let Err(e) = result {
            log::error!("Idle monitor: {}", e);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
