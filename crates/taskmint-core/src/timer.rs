//! The timer state machine: what each transition does to a session and its
//! timer instances, with no storage or events (the hosts around it do that).
//! Kept pure so it can be tested directly.

use crate::contract::{
    ERR_ANOTHER_TIMER_RUNNING, ERR_START_INACTIVE_SESSION, ERR_STOP_NOT_RUNNING,
    MAX_TIMER_INSTANCES_PER_SESSION, WORKLOG_IMPORT_SOURCE,
};
use crate::model::{TaskSession, TimerInstance, TimerTask};
use crate::zone::DayZone;
use chrono::{DateTime, Utc};
use uuid::Uuid;

pub fn new_session_id() -> String {
    format!("session_{}", Uuid::new_v4())
}

pub fn new_instance_id() -> String {
    format!("instance_{}", Uuid::new_v4())
}

/// Net tracked duration for a run that ends at `now`, together with the final
/// accumulated pause total. `active_pause_started_at` covers a stop issued
/// while the timer is still paused.
pub fn compute_final_duration(
    start_time: DateTime<Utc>,
    accumulated_paused_ms: u64,
    active_pause_started_at: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> (u64, u64) {
    let total_elapsed = now.timestamp_millis() - start_time.timestamp_millis();
    let mut total_paused = accumulated_paused_ms as i64;
    if let Some(paused_at) = active_pause_started_at {
        total_paused += now.timestamp_millis() - paused_at.timestamp_millis();
    }
    let total_paused = total_paused.max(0);
    (
        (total_elapsed - total_paused).max(0) as u64,
        total_paused as u64,
    )
}

/// A timer instance may only be started when it has never run: a completed
/// instance is final (create a new instance to keep working). The error
/// strings for the inactive-session and concurrent-run cases are matched by
/// the frontend's automatic recovery in useSessionManagement.
pub fn validate_start(
    instance: &TimerInstance,
    session_is_active: bool,
    another_running: bool,
) -> Result<(), String> {
    if instance.is_running {
        return Err("Timer instance is already running".to_string());
    }
    if instance.is_paused {
        return Err("Cannot start a paused timer; resume it instead".to_string());
    }
    if instance.duration.is_some() || instance.end_time.is_some() {
        return Err("Timer instance has already completed; create a new timer instead".to_string());
    }
    if !session_is_active {
        return Err(ERR_START_INACTIVE_SESSION.to_string());
    }
    if another_running {
        return Err(ERR_ANOTHER_TIMER_RUNNING.to_string());
    }
    Ok(())
}

/// Stop is valid for a running or paused instance. The message is matched by
/// the frontend's start recovery (a timer stopped between its read and the
/// call is "not running").
pub fn ensure_stoppable(instance: &TimerInstance) -> Result<(), String> {
    if !instance.is_running && !instance.is_paused {
        return Err(ERR_STOP_NOT_RUNNING.to_string());
    }
    Ok(())
}

pub fn recalculate_total_duration(session: &mut TaskSession) {
    session.total_duration = session
        .timer_instances
        .iter()
        .filter_map(|i| i.duration)
        .sum();
}

/// The error for an instance id that isn't in any session.
pub fn instance_not_found(instance_id: &str) -> String {
    format!("Timer instance with ID {} not found", instance_id)
}

/// The error for a session already holding MAX_TIMER_INSTANCES_PER_SESSION
/// timers.
pub fn max_timers_reached() -> String {
    format!(
        "Maximum number of timers ({}) reached for this session",
        MAX_TIMER_INSTANCES_PER_SESSION
    )
}

/// The error for a session id that doesn't exist.
pub fn session_not_found(session_id: &str) -> String {
    format!("Session with ID {} not found", session_id)
}

/// Imported days are rebuilt from the work-log ledger on every import, so an
/// edit made here would silently vanish later: they change only by importing.
pub fn ensure_not_imported(session: &TaskSession) -> Result<(), String> {
    if session.source.as_deref() == Some(WORKLOG_IMPORT_SOURCE) {
        return Err("Imported time changes only through a work-log import".to_string());
    }
    Ok(())
}

/// A new, active session for a task, carrying the task's current rate.
/// Callers deactivate the others first.
pub fn new_task_session(
    task_id: String,
    task_name: String,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
    zone: DayZone,
) -> TaskSession {
    TaskSession {
        id: new_session_id(),
        task_id,
        task_name,
        timer_instances: Vec::new(),
        total_duration: 0,
        notes: None,
        is_active: true,
        source: None,
        hourly_rate,
        // Local day, not UTC: the dashboard's today-filter and the calendar
        // compare this string against the user's local date.
        date: zone.day(now),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    }
}

/// A fresh (idle, never-run) timer instance.
pub fn new_timer_instance(session_id: &str, now: DateTime<Utc>) -> TimerInstance {
    TimerInstance {
        id: new_instance_id(),
        session_id: session_id.to_string(),
        start_time: now,
        end_time: None,
        duration: None,
        is_running: false,
        is_paused: false,
        paused_at: None,
        paused_duration: None,
        resumed_at: None,
        external_id: None,
        task: None,
        notes: None,
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
        running_on: None,
    }
}

/// What a new timer for this task records in `session`, given the task's
/// current rate: the task itself, so it earns that rate, unless it's the
/// session's own task at the session's rate (then nothing; it earns the
/// session's). A rate change while a session stays open reaches its new
/// timers this way, and the earlier ones keep theirs. Only two known rates
/// count as a change: a session without one gets the task's when it has one
/// (fill_missing_session_rates), and a task without one (unrated or deleted)
/// leaves the session's.
pub fn timer_task_in(
    session: &TaskSession,
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
) -> Option<TimerTask> {
    let rate_changed =
        matches!((session.hourly_rate, hourly_rate), (Some(opened), Some(now)) if opened != now);
    (session.task_id != task_id || rate_changed).then(|| TimerTask {
        task_id: task_id.to_string(),
        task_name: task_name.to_string(),
        hourly_rate,
    })
}

/// Put a validated, never-run instance into the running state.
pub fn begin_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    instance.is_running = true;
    instance.is_paused = false;
    instance.start_time = now;
    instance.resumed_at = Some(now);
    instance.paused_duration = Some(0);
    instance.updated_at = now.to_rfc3339();
}

/// Resume a validated, paused instance, folding the pause into
/// `paused_duration` (the frontend's elapsed math subtracts it).
pub fn resume_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    if let Some(paused_at) = instance.paused_at {
        let pause_duration = (now.timestamp_millis() - paused_at.timestamp_millis()).max(0) as u64;
        instance.paused_duration = Some(instance.paused_duration.unwrap_or(0) + pause_duration);
    }
    instance.is_running = true;
    instance.is_paused = false;
    instance.paused_at = None;
    instance.resumed_at = Some(now);
    instance.updated_at = now.to_rfc3339();
}

/// Pause a validated, running instance; `paused_at` starts the pause stretch
/// that resume (or stop) folds into `paused_duration`.
pub fn pause_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    pause_instance_at(instance, now, now);
}

/// Pause a running instance as of an earlier moment (idle detection backdates
/// the pause to when input stopped, so the away time isn't counted). Callers
/// keep `paused_at` at or after the run's start.
pub fn pause_instance_at(
    instance: &mut TimerInstance,
    paused_at: DateTime<Utc>,
    now: DateTime<Utc>,
) {
    instance.is_running = false;
    instance.is_paused = true;
    instance.paused_at = Some(paused_at);
    instance.updated_at = now.to_rfc3339();
}

/// Resume a paused instance *without* folding the pause into
/// `paused_duration`, so the paused stretch counts as tracked time ("keep the
/// away time" after an idle pause).
pub fn keep_idle_time(instance: &mut TimerInstance, now: DateTime<Utc>) {
    instance.is_running = true;
    instance.is_paused = false;
    instance.paused_at = None;
    instance.resumed_at = Some(now);
    instance.updated_at = now.to_rfc3339();
}

/// Finalize one running or paused instance with the same math as
/// `stop_timer_instance`: clear the state flags, stamp `end_time`, and store
/// the net duration. A live pause stretch is folded into `paused_duration`,
/// preserving the invariant duration = endTime - startTime - pausedDuration
/// that the frontend's edit math inverts.
pub fn finalize_instance(instance: &mut TimerInstance, now: DateTime<Utc>) {
    let was_paused = instance.is_paused;
    let paused_at = instance.paused_at;

    instance.is_running = false;
    instance.is_paused = false;
    instance.resumed_at = None;
    instance.paused_at = None;
    instance.end_time = Some(now);

    let (duration, total_paused) = compute_final_duration(
        instance.start_time,
        instance.paused_duration.unwrap_or(0),
        if was_paused { paused_at } else { None },
        now,
    );
    instance.duration = Some(duration);
    instance.paused_duration = Some(total_paused);
    instance.updated_at = now.to_rfc3339();
}

/// Deactivating a session must not leave a running timer accruing time where
/// no UI surface can reach it (every control operates on the active session
/// only), nor a paused timer stranded (resume is rejected in inactive
/// sessions, so its tracked time would never be recorded). Finalize both, a
/// paused instance freezing at its pause point. Returns the finalized
/// instance ids so the host can emit `timer-instance-stopped` after the
/// lock is released.
pub fn stop_active_instances(session: &mut TaskSession, now: DateTime<Utc>) -> Vec<String> {
    let mut stopped = Vec::new();
    for instance in session.timer_instances.iter_mut() {
        if instance.is_running || instance.is_paused {
            finalize_instance(instance, now);
            stopped.push(instance.id.clone());
        }
    }
    if !stopped.is_empty() {
        session.updated_at = now.to_rfc3339();
        recalculate_total_duration(session);
    }
    stopped
}

/// Startup repair for data written by older builds, which left paused timers
/// stranded in deactivated sessions (unreachable and unresumable there).
/// Finalizes running/paused instances in every inactive session. Idempotent:
/// a second run finds nothing to repair. Returns the number of instances
/// finalized.
pub fn finalize_stranded_instances(sessions: &mut [TaskSession], now: DateTime<Utc>) -> usize {
    let mut finalized = 0;
    for session in sessions.iter_mut() {
        if !session.is_active {
            finalized += stop_active_instances(session, now).len();
        }
    }
    finalized
}
