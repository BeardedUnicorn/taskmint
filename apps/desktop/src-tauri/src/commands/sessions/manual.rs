//! "Add time": finished timers logged after the fact.

use super::task_links::task_rate;
use super::timer::{new_task_session, new_timer_instance, recalculate_total_duration};
use crate::events::emit_stopped;
use crate::state::AppState;
use crate::storage;
use crate::types::{TaskSession, TimerInstance};
use chrono::{DateTime, Local, Utc};
use tauri::{AppHandle, State};

/// `source` of sessions created by "Add time" (must match MANUAL_SOURCE in
/// src/types/timer.ts).
pub const MANUAL_SOURCE: &str = "manual";

const MAX_MANUAL_DURATION_MS: u64 = 24 * 60 * 60 * 1000;

/// Clock skew allowed between the dialog computing "ends now" and this check.
const MANUAL_FUTURE_TOLERANCE_MS: i64 = 60_000;

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

fn local_time_label(at: DateTime<Utc>) -> String {
    at.with_timezone(&Local).format("%-I:%M %p").to_string()
}

/// Validate a manual entry and build its session: inactive, sourced "manual",
/// dated by the local day of its start (as the frontend buckets instances),
/// holding one finished timer. Time already tracked can't be overlapped, or
/// the same minutes would count twice.
pub fn build_manual_session(
    sessions: &[TaskSession],
    task_id: &str,
    task_name: &str,
    hourly_rate: Option<f64>,
    start: DateTime<Utc>,
    duration_ms: u64,
    now: DateTime<Utc>,
) -> Result<TaskSession, String> {
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
                        local_time_label(other_start),
                        local_time_label(other_end),
                        other_start.with_timezone(&Local).format("%b %-d"),
                    ));
                }
            }
        }
    }

    let mut session =
        new_task_session(task_id.to_string(), task_name.to_string(), hourly_rate, now);
    session.is_active = false;
    session.source = Some(MANUAL_SOURCE.to_string());
    session.date = start.with_timezone(&Local).format("%Y-%m-%d").to_string();

    let mut instance = new_timer_instance(&session.id, now);
    instance.start_time = start;
    instance.end_time = Some(end);
    instance.duration = Some(duration_ms);
    instance.paused_duration = Some(0);
    session.timer_instances.push(instance);
    recalculate_total_duration(&mut session);
    Ok(session)
}

/// Log time after the fact ("Add time"): a finished timer in its own session
/// on the day it started.
#[tauri::command]
pub fn add_manual_time(
    app: AppHandle,
    app_state: State<'_, AppState>,
    task_id: String,
    task_name: String,
    start_time: String,
    duration_ms: u64,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let start = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| format!("Invalid start time: {}", e))?
        .with_timezone(&Utc);
    let hourly_rate = task_rate(&app_state, task_id.trim());

    let session =
        app_state.with_task_sessions_mut(|sessions| -> Result<TaskSession, String> {
            let session = build_manual_session(
                sessions,
                task_id.trim(),
                task_name.trim(),
                hourly_rate,
                start,
                duration_ms,
                now,
            )?;
            sessions.push(session.clone());
            storage::save_sessions(&app, sessions)?;
            Ok(session)
        })??;

    // Persisted already; the event only prompts listeners to reload.
    if let Some(instance) = session.timer_instances.first() {
        emit_stopped(&app, std::slice::from_ref(&instance.id), now);
    }
    Ok(session)
}
