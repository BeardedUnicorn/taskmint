//! Events the backend sends the frontend. The names are in
//! taskmint_core::contract::events, mirrored in
//! packages/client/src/constants/events.ts (a frontend test checks the two
//! lists agree).
//!
//! Every event is sent after its change is saved, so a failed emit only
//! delays the frontend's refresh: it's logged, never turned into a command
//! error.

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

// The event names (wire contract, mirrored by the frontend).
pub use taskmint_core::contract::events::*;

/// Send an event; a failure is logged, not returned (see the module docs).
pub fn emit_quiet<P: Serialize + Clone>(app: &AppHandle, event: &str, payload: P) {
    if let Err(e) = app.emit(event, payload) {
        log::warn!("Failed to emit {}: {}", event, e);
    }
}

/// A timer-instance event: `{ instanceId, <time_key>: at }`.
pub fn emit_instance_event(
    app: &AppHandle,
    event: &str,
    instance_id: &str,
    time_key: &str,
    at: DateTime<Utc>,
) {
    let mut payload = serde_json::Map::new();
    payload.insert("instanceId".to_string(), instance_id.into());
    payload.insert(time_key.to_string(), at.to_rfc3339().into());
    emit_quiet(app, event, serde_json::Value::Object(payload));
}

/// `timer-instance-stopped` for each of `instance_ids` (stopped as a side
/// effect: a deactivation, a hand-off, a tray stop).
pub fn emit_stopped(app: &AppHandle, instance_ids: &[String], at: DateTime<Utc>) {
    for instance_id in instance_ids {
        emit_instance_event(app, TIMER_INSTANCE_STOPPED, instance_id, "endTime", at);
    }
}
