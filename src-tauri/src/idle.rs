// System-wide idle detection.
//
// The webview only sees input inside TaskMint's own window, so work done in
// another app looked idle. This reads the operating system's idle time (time
// since the last keyboard or mouse input anywhere) and, past the threshold,
// pauses the running timer as of when the user went idle, so the away time
// isn't counted. When input returns, the app comes forward and asks whether
// to discard the away time (resume), keep it (resume, counting it), or stay
// paused. The pending question is in memory only: after a restart the timer
// simply stays paused.

use crate::commands::sessions::{keep_idle_time, pause_instance_at, resume_instance};
use crate::state::AppState;
use crate::storage;
use crate::types::TaskSession;
use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// How often the monitor samples the system idle time.
const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(5);

/// Input within this window after an idle pause counts as being back.
const RETURN_INPUT_MS: u64 = 10_000;

/// Detection settings, mirrored from the app (localStorage owns them).
/// Disabled until the app sends them.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdleSettings {
    pub enabled: bool,
    pub threshold_minutes: u32,
}

/// A timer the monitor paused, awaiting the user's keep/discard answer.
#[derive(Debug, Clone, PartialEq)]
pub struct IdlePause {
    pub instance_id: String,
    pub task_name: String,
    /// When input stopped; the timer's pause starts here.
    pub idle_since: DateTime<Utc>,
    /// When input returned (None while the user is still away).
    pub returned_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default)]
pub struct IdleState {
    pub settings: IdleSettings,
    pub pause: Option<IdlePause>,
}

/// What the app shows in its "welcome back" question.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdlePausePayload {
    pub instance_id: String,
    pub task_name: String,
    pub idle_since: String,
    pub returned: bool,
    /// From going idle until returning (or until now while still away).
    pub away_ms: u64,
}

impl IdlePause {
    pub fn payload(&self, now: DateTime<Utc>) -> IdlePausePayload {
        let until = self.returned_at.unwrap_or(now);
        IdlePausePayload {
            instance_id: self.instance_id.clone(),
            task_name: self.task_name.clone(),
            idle_since: self.idle_since.to_rfc3339(),
            returned: self.returned_at.is_some(),
            away_ms: (until - self.idle_since).num_milliseconds().max(0) as u64,
        }
    }
}

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
// DECISIONS
// ============================================================================

#[derive(Debug, Clone, PartialEq)]
pub enum IdleAction {
    None,
    /// Pause the running timer as of `idle_since`.
    Pause {
        instance_id: String,
        task_name: String,
        idle_since: DateTime<Utc>,
    },
    /// Input came back after an idle pause: ask the user.
    Returned,
    /// The idle-paused timer was resumed or stopped elsewhere: drop the question.
    ClearPending,
}

/// One monitor step, as a pure function of the sessions, the idle state and
/// the sampled system idle time.
pub fn idle_tick(
    sessions: &[TaskSession],
    idle: &IdleState,
    idle_ms: u64,
    now: DateTime<Utc>,
) -> IdleAction {
    if let Some(pause) = &idle.pause {
        let still_paused = sessions
            .iter()
            .flat_map(|s| s.timer_instances.iter())
            .any(|i| i.id == pause.instance_id && i.is_paused);
        if !still_paused {
            return IdleAction::ClearPending;
        }
        if pause.returned_at.is_none() && idle_ms < RETURN_INPUT_MS {
            return IdleAction::Returned;
        }
        return IdleAction::None;
    }

    if !idle.settings.enabled || idle.settings.threshold_minutes == 0 {
        return IdleAction::None;
    }
    let threshold_ms = idle.settings.threshold_minutes as u64 * 60_000;
    if idle_ms < threshold_ms {
        return IdleAction::None;
    }

    let Some((session, instance)) = sessions.iter().find_map(|s| {
        s.timer_instances
            .iter()
            .find(|i| i.is_running)
            .map(|i| (s, i))
    }) else {
        return IdleAction::None;
    };

    // Never back past the run's own start: a timer started (or resumed)
    // while the user was already idle only loses time since then.
    let went_idle = now - chrono::Duration::milliseconds(idle_ms as i64);
    let run_began = instance.resumed_at.unwrap_or(instance.start_time);
    IdleAction::Pause {
        instance_id: instance.id.clone(),
        task_name: session.task_name.clone(),
        idle_since: went_idle.max(run_began),
    }
}

/// The user's answer to "you were away".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdleChoice {
    /// Resume; the away time stays uncounted.
    DiscardResume,
    /// Resume, counting the away time as work.
    KeepResume,
    /// Leave the timer paused; the away time stays uncounted.
    StayPaused,
}

impl IdleChoice {
    pub fn parse(choice: &str) -> Result<Self, String> {
        match choice {
            "discardResume" => Ok(Self::DiscardResume),
            "keepResume" => Ok(Self::KeepResume),
            "stayPaused" => Ok(Self::StayPaused),
            other => Err(format!("Unknown choice: {}", other)),
        }
    }
}

/// Apply a choice to the idle-paused timer. Resuming upholds the same
/// invariants as resume_timer_instance (active session, one running timer).
/// Returns whether the timer was resumed.
pub fn apply_idle_choice(
    sessions: &mut [TaskSession],
    pause: &IdlePause,
    choice: IdleChoice,
    now: DateTime<Utc>,
) -> Result<bool, String> {
    if choice == IdleChoice::StayPaused {
        return Ok(false);
    }
    let another_running = sessions
        .iter()
        .flat_map(|s| s.timer_instances.iter())
        .any(|i| i.is_running && i.id != pause.instance_id);
    let session = sessions
        .iter_mut()
        .find(|s| s.timer_instances.iter().any(|i| i.id == pause.instance_id))
        .ok_or_else(|| "The paused timer no longer exists".to_string())?;
    if !session.is_active {
        return Err("Cannot resume timer for inactive session".to_string());
    }
    if another_running {
        return Err("Another timer instance is already running".to_string());
    }
    let instance = session
        .timer_instances
        .iter_mut()
        .find(|i| i.id == pause.instance_id)
        .ok_or_else(|| "The paused timer no longer exists".to_string())?;
    if !instance.is_paused {
        return Err("The timer is no longer paused".to_string());
    }
    match choice {
        IdleChoice::DiscardResume => resume_instance(instance, now),
        IdleChoice::KeepResume => keep_idle_time(instance, now),
        IdleChoice::StayPaused => unreachable!("handled above"),
    }
    session.updated_at = now.to_rfc3339();
    Ok(true)
}

// ============================================================================
// RUNTIME
// ============================================================================

fn local_time_label(at: DateTime<Utc>) -> String {
    at.with_timezone(&Local).format("%-I:%M %p").to_string()
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("Failed to show idle notification: {}", e);
    }
}

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
        let Some(session) = sessions
            .iter_mut()
            .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
        else {
            return Ok(false);
        };
        let Some(instance) = session
            .timer_instances
            .iter_mut()
            .find(|i| i.id == instance_id && i.is_running)
        else {
            return Ok(false);
        };
        pause_instance_at(instance, idle_since, now);
        session.updated_at = now.to_rfc3339();
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
    let _ = app.emit(
        "timer-instance-paused",
        serde_json::json!({ "instanceId": instance_id, "pausedAt": idle_since.to_rfc3339() }),
    );
    notify(
        app,
        "Timer paused",
        &format!(
            "{} — no activity since {}. The away time isn't counted unless you keep it.",
            task_name,
            local_time_label(idle_since)
        ),
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
        let _ = app.emit("idle-returned", &payload);
        crate::tray::show_main_window(app);
        crate::tray::sync_tray(app, state);
    }
    Ok(())
}

fn clear_pending(app: &AppHandle, state: &AppState) -> Result<(), String> {
    state.with_idle_mut(|idle| idle.pause = None)?;
    let _ = app.emit("idle-resolved", ());
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
        let _ = app.emit(
            "timer-instance-resumed",
            serde_json::json!({ "instanceId": pause.instance_id, "resumedAt": now.to_rfc3339() }),
        );
    }
    clear_pending(app, state)
}

/// Sample the system idle time every few seconds and act on it. Does
/// nothing on platforms without an idle-time source.
pub fn start_idle_monitor(app: &AppHandle, state: &AppState) {
    if !is_supported() {
        log::info!("Idle detection is not supported on this platform");
        return;
    }
    let app = app.clone();
    let state = state.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL_INTERVAL);
        let Some(idle_ms) = system_idle_ms() else {
            continue;
        };
        let now = Utc::now();
        let Ok(idle_state) = state.with_idle(|idle| idle.clone()) else {
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
    use crate::types::TimerInstance;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    const MIN_MS: u64 = 60_000;

    fn instance(id: &str, start: i64) -> TimerInstance {
        TimerInstance {
            id: id.to_string(),
            session_id: "s".to_string(),
            start_time: ts(start),
            end_time: None,
            duration: None,
            is_running: false,
            is_paused: false,
            paused_at: None,
            paused_duration: Some(0),
            resumed_at: None,
            external_id: None,
            notes: None,
            created_at: ts(start).to_rfc3339(),
            updated_at: ts(start).to_rfc3339(),
        }
    }

    fn running(id: &str, start: i64) -> TimerInstance {
        TimerInstance {
            is_running: true,
            resumed_at: Some(ts(start)),
            ..instance(id, start)
        }
    }

    fn session(active: bool, instances: Vec<TimerInstance>) -> TaskSession {
        let json = serde_json::json!({
            "id": "s",
            "taskId": "a",
            "taskName": "Annotation",
            "timerInstances": [],
            "isActive": active,
            "notes": null
        });
        let mut session: TaskSession = serde_json::from_value(json).unwrap();
        session.timer_instances = instances;
        session
    }

    fn enabled(threshold_minutes: u32) -> IdleState {
        IdleState {
            settings: IdleSettings {
                enabled: true,
                threshold_minutes,
            },
            pause: None,
        }
    }

    fn pending(instance_id: &str, idle_since: i64, returned_at: Option<i64>) -> IdlePause {
        IdlePause {
            instance_id: instance_id.to_string(),
            task_name: "Annotation".to_string(),
            idle_since: ts(idle_since),
            returned_at: returned_at.map(ts),
        }
    }

    #[test]
    fn pauses_at_the_threshold_as_of_when_input_stopped() {
        let sessions = vec![session(true, vec![running("r", 0)])];
        let now = ts(3_600);

        assert_eq!(
            idle_tick(&sessions, &enabled(15), 15 * MIN_MS - 1, now),
            IdleAction::None
        );
        assert_eq!(
            idle_tick(&sessions, &enabled(15), 20 * MIN_MS, now),
            IdleAction::Pause {
                instance_id: "r".to_string(),
                task_name: "Annotation".to_string(),
                idle_since: ts(3_600 - 20 * 60),
            }
        );
    }

    #[test]
    fn idle_since_never_precedes_the_runs_own_start() {
        // Started 5 minutes ago, idle for 30: lose only the 5 minutes.
        let sessions = vec![session(true, vec![running("r", 3_300)])];
        let action = idle_tick(&sessions, &enabled(1), 30 * MIN_MS, ts(3_600));
        assert!(matches!(action, IdleAction::Pause { idle_since, .. } if idle_since == ts(3_300)));
    }

    #[test]
    fn does_nothing_when_disabled_or_nothing_runs() {
        let running_sessions = vec![session(true, vec![running("r", 0)])];
        let disabled = IdleState::default();
        assert_eq!(
            idle_tick(&running_sessions, &disabled, 60 * MIN_MS, ts(7_200)),
            IdleAction::None
        );

        let mut paused = running("p", 0);
        paused.is_running = false;
        paused.is_paused = true;
        let idle_only = vec![session(true, vec![paused, instance("i", 0)])];
        assert_eq!(
            idle_tick(&idle_only, &enabled(1), 60 * MIN_MS, ts(7_200)),
            IdleAction::None
        );
    }

    #[test]
    fn reports_the_return_once_input_comes_back() {
        let mut paused = running("r", 0);
        paused.is_running = false;
        paused.is_paused = true;
        let sessions = vec![session(true, vec![paused])];
        let mut state = enabled(15);
        state.pause = Some(pending("r", 600, None));

        // Still away: nothing
        assert_eq!(
            idle_tick(&sessions, &state, 30 * MIN_MS, ts(2_400)),
            IdleAction::None
        );
        // Input just now: back
        assert_eq!(
            idle_tick(&sessions, &state, 2_000, ts(2_400)),
            IdleAction::Returned
        );
        // Already marked back: not again
        state.pause = Some(pending("r", 600, Some(2_400)));
        assert_eq!(
            idle_tick(&sessions, &state, 1_000, ts(2_500)),
            IdleAction::None
        );
    }

    #[test]
    fn drops_the_question_when_the_timer_was_resumed_or_stopped_elsewhere() {
        let mut state = enabled(15);
        state.pause = Some(pending("r", 600, Some(2_400)));

        let resumed = vec![session(true, vec![running("r", 0)])];
        assert_eq!(
            idle_tick(&resumed, &state, 1_000, ts(2_500)),
            IdleAction::ClearPending
        );
        let gone: Vec<TaskSession> = vec![session(true, vec![])];
        assert_eq!(
            idle_tick(&gone, &state, 1_000, ts(2_500)),
            IdleAction::ClearPending
        );
    }

    /// Run 0..3600s, idle from 1800s (paused backdated), back at 3000s.
    fn idle_paused_sessions() -> (Vec<TaskSession>, IdlePause) {
        let mut timer = running("r", 0);
        pause_instance_at(&mut timer, ts(1_800), ts(3_000));
        (
            vec![session(true, vec![timer])],
            pending("r", 1_800, Some(3_000)),
        )
    }

    fn net_ms_at(sessions: &[TaskSession], now: DateTime<Utc>) -> i64 {
        let i = &sessions[0].timer_instances[0];
        let paused = i.paused_duration.unwrap_or(0) as i64;
        let end = if i.is_paused {
            i.paused_at.unwrap()
        } else {
            now
        };
        (end - i.start_time).num_milliseconds() - paused
    }

    #[test]
    fn a_backdated_pause_excludes_the_away_time() {
        let (sessions, _) = idle_paused_sessions();
        // Frozen at 1800s even though it was paused at 3000s
        assert_eq!(net_ms_at(&sessions, ts(3_000)), 1_800_000);
    }

    #[test]
    fn discard_and_resume_leaves_the_away_time_uncounted() {
        let (mut sessions, pause) = idle_paused_sessions();
        assert!(
            apply_idle_choice(&mut sessions, &pause, IdleChoice::DiscardResume, ts(3_000)).unwrap()
        );
        // 600s more of work after returning: 1800 + 600
        assert_eq!(net_ms_at(&sessions, ts(3_600)), 2_400_000);
    }

    #[test]
    fn keep_and_resume_counts_the_away_time() {
        let (mut sessions, pause) = idle_paused_sessions();
        assert!(
            apply_idle_choice(&mut sessions, &pause, IdleChoice::KeepResume, ts(3_000)).unwrap()
        );
        let timer = &sessions[0].timer_instances[0];
        assert!(timer.is_running && !timer.is_paused);
        assert_eq!(net_ms_at(&sessions, ts(3_600)), 3_600_000);
    }

    #[test]
    fn stay_paused_changes_nothing() {
        let (mut sessions, pause) = idle_paused_sessions();
        let before = sessions.clone();
        assert!(
            !apply_idle_choice(&mut sessions, &pause, IdleChoice::StayPaused, ts(3_000)).unwrap()
        );
        assert_eq!(sessions, before);
    }

    #[test]
    fn resuming_is_refused_while_another_timer_runs() {
        let (mut sessions, pause) = idle_paused_sessions();
        sessions[0].timer_instances.push(running("other", 3_100));
        let err = apply_idle_choice(&mut sessions, &pause, IdleChoice::DiscardResume, ts(3_200))
            .unwrap_err();
        assert_eq!(err, "Another timer instance is already running");
    }

    #[test]
    fn payload_reports_the_away_time() {
        let pause = pending("r", 1_800, Some(3_000));
        let payload = pause.payload(ts(9_999));
        assert_eq!(payload.away_ms, 1_200_000);
        assert!(payload.returned);
        let still_away = pending("r", 1_800, None).payload(ts(2_400));
        assert_eq!(still_away.away_ms, 600_000);
        assert!(!still_away.returned);
    }

    // Exercises the real CoreGraphics call: it must link and answer without
    // any permission prompt (the value is seconds since the last input).
    #[cfg(target_os = "macos")]
    #[test]
    fn reads_the_system_idle_time() {
        let idle_ms = system_idle_ms().expect("macOS reports system idle time");
        assert!(idle_ms < 365 * 24 * 60 * MIN_MS);
        assert!(is_supported());
    }

    #[test]
    fn parses_the_apps_choices() {
        assert_eq!(
            IdleChoice::parse("discardResume"),
            Ok(IdleChoice::DiscardResume)
        );
        assert_eq!(IdleChoice::parse("keepResume"), Ok(IdleChoice::KeepResume));
        assert_eq!(IdleChoice::parse("stayPaused"), Ok(IdleChoice::StayPaused));
        assert!(IdleChoice::parse("nope").is_err());
    }
}
