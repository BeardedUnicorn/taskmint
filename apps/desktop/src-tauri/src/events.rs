//! Events the backend sends the frontend. The names are in
//! taskmint_core::contract::events (generated into @taskmint/contracts).
//!
//! Core commands' events are sent once the change is saved; the shell sends
//! its own (idle, notifications, the tray's start dialog). A failed emit only
//! delays the frontend's refresh: it's logged, never turned into a command
//! error.

use crate::state::Shell;
use serde::Serialize;

// The event names (wire contract, generated for the frontend).
pub use taskmint_core::contract::events::*;

/// Send an event; a failure is logged, not returned (see the module docs).
pub fn emit_quiet(shell: &Shell, event: &str, payload: impl Serialize) {
    let payload = serde_json::to_value(payload).expect("event payloads are plain data");
    if let Err(e) = shell.platform.emit(event, &payload) {
        log::warn!("Failed to emit {}: {}", event, e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::fixture;

    #[test]
    fn a_failed_emit_is_logged_and_nothing_else() {
        let f = fixture();
        emit_quiet(&f.state, SESSIONS_CHANGED, ());
        f.platform.fail("emit");
        emit_quiet(&f.state, SESSIONS_CHANGED, ());
        assert_eq!(f.platform.event_names(), ["sessions-changed"]);
    }
}
