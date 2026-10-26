//! Events the backend sends the frontend. The names are in
//! taskmint_core::contract::events, mirrored in
//! packages/client/src/constants/events.ts (a frontend test checks the two
//! lists agree).
//!
//! Core commands' events are sent by the backend once the change is saved;
//! the shell sends its own (idle, notifications, the tray's start dialog).
//! A failed emit only delays the frontend's refresh: it's logged, never
//! turned into a command error.

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
