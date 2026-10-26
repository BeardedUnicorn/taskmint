//! "Add time": finished timers logged after the fact.

use crate::contract::MANUAL_SOURCE;
use crate::model::{TaskSession, TimerInstance};
use crate::timer::{new_task_session, new_timer_instance, recalculate_total_duration};
use crate::zone::DayZone;
use chrono::{DateTime, Utc};

const MAX_MANUAL_DURATION_MS: u64 = 24 * 60 * 60 * 1000;

/// Clock skew allowed between the dialog computing "ends now" and this check.
const MANUAL_FUTURE_TOLERANCE_MS: i64 = 60_000;

/// A stretch of work logged after the fact.
#[derive(Debug, Clone, PartialEq)]
pub struct ManualEntry<'a> {
    pub task_id: &'a str,
    pub task_name: &'a str,
    /// The task's current rate, captured by the new session.
    pub hourly_rate: Option<f64>,
    pub start: DateTime<Utc>,
    pub duration_ms: u64,
}

/// The wall-clock span an instance occupies, or None for an idle (never run)
/// one. Live timers occupy up to `now`.
fn instance_span(
    instance: &TimerInstance,
    now: DateTime<Utc>,
) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    if instance.is_running || instance.is_paused {
        return Some((instance.start_time, now));
    }
    instance.end_time.map(|end| (instance.start_time, end))
}

/// Validate a manual entry and build its session: inactive, sourced "manual",
/// dated by the day (in `zone`) of its start, as the frontend buckets
/// instances, holding one finished timer. Time already tracked can't be
/// overlapped, or the same minutes would count twice.
pub fn build_manual_session(
    sessions: &[TaskSession],
    entry: &ManualEntry,
    now: DateTime<Utc>,
    zone: DayZone,
) -> Result<TaskSession, String> {
    let ManualEntry {
        task_id,
        task_name,
        hourly_rate,
        start,
        duration_ms,
    } = *entry;
    if task_id.trim().is_empty() || task_name.trim().is_empty() {
        return Err("Choose a task for the time entry".to_string());
    }
    if duration_ms == 0 {
        return Err("Duration must be greater than zero".to_string());
    }
    if duration_ms > MAX_MANUAL_DURATION_MS {
        return Err("A time entry can be at most 24 hours".to_string());
    }
    let end = start + chrono::Duration::milliseconds(duration_ms as i64);
    if end.timestamp_millis() > now.timestamp_millis() + MANUAL_FUTURE_TOLERANCE_MS {
        return Err("The time entry can't end in the future".to_string());
    }

    for session in sessions {
        for instance in &session.timer_instances {
            if let Some((other_start, other_end)) = instance_span(instance, now) {
                if start < other_end && other_start < end {
                    return Err(format!(
                        "This overlaps time already tracked for \"{}\" ({}–{} on {}). Adjust the start time or duration.",
                        session.task_name,
                        zone.time_label(other_start),
                        zone.time_label(other_end),
                        zone.date_label(other_start),
                    ));
                }
            }
        }
    }

    let mut session = new_task_session(
        task_id.to_string(),
        task_name.to_string(),
        hourly_rate,
        now,
        zone,
    );
    session.is_active = false;
    session.source = Some(MANUAL_SOURCE.to_string());
    session.date = zone.day(start);

    let mut instance = new_timer_instance(&session.id, now);
    instance.start_time = start;
    instance.end_time = Some(end);
    instance.duration = Some(duration_ms);
    instance.paused_duration = Some(0);
    session.timer_instances.push(instance);
    recalculate_total_duration(&mut session);
    Ok(session)
}
