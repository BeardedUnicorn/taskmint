//! Idle detection and the long-run reminder, as pure decisions.
//!
//! The host samples the operating system's idle time (time since the last
//! keyboard or mouse input anywhere) and asks `idle_tick` what to do. Past the
//! threshold, the running timer is paused as of when the user went idle, so
//! the away time isn't counted. When input returns, the app asks whether to
//! discard the away time (resume), keep it (resume, counting it), or stay
//! paused. The pending question is in memory only: after a restart the timer
//! simply stays paused.

use crate::contract::{
    ERR_ANOTHER_TIMER_RUNNING, ERR_RESUME_INACTIVE_SESSION, IDLE_CHOICE_DISCARD_RESUME,
    IDLE_CHOICE_KEEP_RESUME, IDLE_CHOICE_STAY_PAUSED,
};
use crate::model::TaskSession;
use crate::timer::{keep_idle_time, pause_instance_at, resume_instance};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Input within this window after an idle pause counts as being back.
const RETURN_INPUT_MS: u64 = 10_000;

/// Detection settings, mirrored from the app (localStorage owns them).
/// Disabled until the app sends them.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct IdleSettings {
    pub enabled: bool,
    pub threshold_minutes: u32,
    /// Remind after a timer has run this many hours straight (0 = off).
    /// Independent of `enabled`: it's the reminder for when idle detection
    /// is off and a timer gets forgotten.
    #[serde(default)]
    pub long_run_hours: u32,
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
    /// The run the long-run reminder last fired for (see long_run_tick).
    pub long_run_reminded: Option<String>,
}

/// What the app shows in its "welcome back" question.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
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
// DECISIONS
// ============================================================================

/// A timer that has run long enough to remind about.
#[derive(Debug, Clone, PartialEq)]
pub struct LongRun {
    /// `<instance id>@<when the run began>`: one reminder per run.
    pub key: String,
    pub task_name: String,
    pub run_ms: u64,
}

/// The long-run reminder, as a pure function: the running timer whose
/// current run (since it started or last resumed) has lasted `hours`, unless
/// this run was already reminded about.
pub fn long_run_tick(
    sessions: &[TaskSession],
    reminded: Option<&str>,
    hours: u32,
    now: DateTime<Utc>,
) -> Option<LongRun> {
    if hours == 0 {
        return None;
    }
    let (session, instance) = sessions.iter().find_map(|s| {
        s.timer_instances
            .iter()
            .find(|i| i.is_running)
            .map(|i| (s, i))
    })?;
    let run_began = instance.resumed_at.unwrap_or(instance.start_time);
    let run_ms = (now - run_began).num_milliseconds();
    if run_ms < hours as i64 * 3_600_000 {
        return None;
    }
    let key = format!("{}@{}", instance.id, run_began.to_rfc3339());
    if reminded == Some(key.as_str()) {
        return None;
    }
    Some(LongRun {
        key,
        task_name: session.task_name.clone(),
        run_ms: run_ms as u64,
    })
}

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
            IDLE_CHOICE_DISCARD_RESUME => Ok(Self::DiscardResume),
            IDLE_CHOICE_KEEP_RESUME => Ok(Self::KeepResume),
            IDLE_CHOICE_STAY_PAUSED => Ok(Self::StayPaused),
            other => Err(format!("Unknown choice: {}", other)),
        }
    }
}

/// Apply a choice to the idle-paused timer. Resuming upholds the same
/// invariants as resume_timer_instance (active session, one running timer).
/// Returns whether the timer was resumed.
pub fn apply_idle_choice(
    sessions: &mut [TaskSession],
    instance_id: &str,
    choice: IdleChoice,
    now: DateTime<Utc>,
) -> Result<bool, String> {
    let keep_away_time = match choice {
        IdleChoice::StayPaused => return Ok(false),
        IdleChoice::DiscardResume => false,
        IdleChoice::KeepResume => true,
    };
    let another_running = sessions
        .iter()
        .flat_map(|s| s.timer_instances.iter())
        .any(|i| i.is_running && i.id != instance_id);
    let (session, index) = sessions
        .iter_mut()
        .find_map(|session| {
            let index = session
                .timer_instances
                .iter()
                .position(|i| i.id == instance_id);
            index.map(|index| (session, index))
        })
        .ok_or_else(|| "The paused timer no longer exists".to_string())?;
    if !session.is_active {
        return Err(ERR_RESUME_INACTIVE_SESSION.to_string());
    }
    if another_running {
        return Err(ERR_ANOTHER_TIMER_RUNNING.to_string());
    }
    let instance = &mut session.timer_instances[index];
    if !instance.is_paused {
        return Err("The timer is no longer paused".to_string());
    }
    if keep_away_time {
        keep_idle_time(instance, now);
    } else {
        resume_instance(instance, now);
    }
    session.updated_at = now.to_rfc3339();
    Ok(true)
}

/// Pause the running timer `instance_id` as of `idle_since` (an IdleAction::
/// Pause). Returns false, changing nothing, when that timer is gone or no
/// longer running.
pub fn pause_for_idle(
    sessions: &mut [TaskSession],
    instance_id: &str,
    idle_since: DateTime<Utc>,
    now: DateTime<Utc>,
) -> bool {
    let Some(session) = sessions
        .iter_mut()
        .find(|s| s.timer_instances.iter().any(|i| i.id == instance_id))
    else {
        return false;
    };
    let Some(instance) = session
        .timer_instances
        .iter_mut()
        .find(|i| i.id == instance_id && i.is_running)
    else {
        return false;
    };
    pause_instance_at(instance, idle_since, now);
    session.updated_at = now.to_rfc3339();
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TimerInstance;
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
                long_run_hours: 0,
            },
            pause: None,
            long_run_reminded: None,
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
        assert!(apply_idle_choice(
            &mut sessions,
            &pause.instance_id,
            IdleChoice::DiscardResume,
            ts(3_000)
        )
        .unwrap());
        // 600s more of work after returning: 1800 + 600
        assert_eq!(net_ms_at(&sessions, ts(3_600)), 2_400_000);
    }

    #[test]
    fn keep_and_resume_counts_the_away_time() {
        let (mut sessions, pause) = idle_paused_sessions();
        assert!(apply_idle_choice(
            &mut sessions,
            &pause.instance_id,
            IdleChoice::KeepResume,
            ts(3_000)
        )
        .unwrap());
        let timer = &sessions[0].timer_instances[0];
        assert!(timer.is_running && !timer.is_paused);
        assert_eq!(net_ms_at(&sessions, ts(3_600)), 3_600_000);
    }

    #[test]
    fn stay_paused_changes_nothing() {
        let (mut sessions, pause) = idle_paused_sessions();
        let before = sessions.clone();
        assert!(!apply_idle_choice(
            &mut sessions,
            &pause.instance_id,
            IdleChoice::StayPaused,
            ts(3_000)
        )
        .unwrap());
        assert_eq!(sessions, before);
    }

    #[test]
    fn resuming_is_refused_while_another_timer_runs() {
        let (mut sessions, pause) = idle_paused_sessions();
        sessions[0].timer_instances.push(running("other", 3_100));
        let err = apply_idle_choice(
            &mut sessions,
            &pause.instance_id,
            IdleChoice::DiscardResume,
            ts(3_200),
        )
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
    // --- long-run reminder ---------------------------------------------------

    const HOUR: i64 = 3_600;

    #[test]
    fn reminds_once_a_run_reaches_the_setting() {
        let sessions = vec![session(true, vec![running("r", 0)])];

        assert_eq!(long_run_tick(&sessions, None, 4, ts(4 * HOUR - 1)), None);
        let reminder = long_run_tick(&sessions, None, 4, ts(4 * HOUR)).unwrap();
        assert_eq!(reminder.run_ms, 4 * 3_600_000);
        assert!(reminder.key.starts_with("r@"));
    }

    #[test]
    fn the_same_run_is_reminded_about_once() {
        let sessions = vec![session(true, vec![running("r", 0)])];
        let first = long_run_tick(&sessions, None, 4, ts(4 * HOUR)).unwrap();

        assert_eq!(
            long_run_tick(&sessions, Some(&first.key), 4, ts(9 * HOUR)),
            None
        );
    }

    #[test]
    fn a_resumed_run_counts_from_the_resume_and_can_remind_again() {
        let mut resumed = running("r", 0);
        resumed.resumed_at = Some(ts(5 * HOUR));
        let sessions = vec![session(true, vec![resumed])];
        let earlier_key = format!("r@{}", ts(0).to_rfc3339());

        assert_eq!(
            long_run_tick(&sessions, Some(&earlier_key), 4, ts(8 * HOUR)),
            None
        );
        assert!(long_run_tick(&sessions, Some(&earlier_key), 4, ts(9 * HOUR)).is_some());
    }

    #[test]
    fn no_reminder_when_off_or_nothing_runs() {
        let sessions = vec![session(true, vec![running("r", 0)])];
        assert_eq!(long_run_tick(&sessions, None, 0, ts(10 * HOUR)), None);
        assert_eq!(
            long_run_tick(
                &[session(true, vec![instance("i", 0)])],
                None,
                4,
                ts(10 * HOUR)
            ),
            None
        );
    }

    #[test]
    fn resuming_needs_the_timer_paused_in_the_active_session() {
        let (mut sessions, pause) = idle_paused_sessions();
        sessions[0].is_active = false;
        assert_eq!(
            apply_idle_choice(
                &mut sessions,
                &pause.instance_id,
                IdleChoice::KeepResume,
                ts(3_000)
            )
            .unwrap_err(),
            ERR_RESUME_INACTIVE_SESSION
        );

        let (mut sessions, pause) = idle_paused_sessions();
        resume_instance(&mut sessions[0].timer_instances[0], ts(3_000));
        assert_eq!(
            apply_idle_choice(
                &mut sessions,
                &pause.instance_id,
                IdleChoice::DiscardResume,
                ts(3_100)
            )
            .unwrap_err(),
            "The timer is no longer paused"
        );

        let mut gone = vec![session(true, vec![running("other", 0)])];
        gone[0].timer_instances[0].is_running = false;
        assert_eq!(
            apply_idle_choice(
                &mut gone,
                &pause.instance_id,
                IdleChoice::DiscardResume,
                ts(3_100)
            )
            .unwrap_err(),
            "The paused timer no longer exists"
        );
    }

    #[test]
    fn the_idle_pause_backdates_the_running_timer() {
        let mut sessions = vec![
            session(false, vec![instance("old", 0)]),
            session(true, vec![running("r", 0)]),
        ];

        assert!(pause_for_idle(&mut sessions, "r", ts(1_800), ts(3_000)));

        let timer = &sessions[1].timer_instances[0];
        assert!(timer.is_paused && !timer.is_running);
        assert_eq!(timer.paused_at, Some(ts(1_800)));
        assert_eq!(sessions[1].updated_at, ts(3_000).to_rfc3339());
    }

    #[test]
    fn the_idle_pause_skips_a_timer_that_stopped_or_vanished() {
        let mut sessions = vec![session(true, vec![instance("stopped", 0)])];
        let before = sessions.clone();

        assert!(!pause_for_idle(&mut sessions, "stopped", ts(10), ts(20)));
        assert!(!pause_for_idle(&mut sessions, "gone", ts(10), ts(20)));
        assert_eq!(sessions, before);
    }

    #[test]
    fn settings_from_older_apps_default_the_long_run_reminder_off() {
        let settings: IdleSettings =
            serde_json::from_str(r#"{"enabled": true, "thresholdMinutes": 5}"#).unwrap();
        assert_eq!(
            settings,
            IdleSettings {
                enabled: true,
                threshold_minutes: 5,
                long_run_hours: 0,
            }
        );
    }
}
