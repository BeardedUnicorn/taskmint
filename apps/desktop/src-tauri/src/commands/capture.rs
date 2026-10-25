// Browser-capture commands: the frontend fetches payloads delivered by the
// extension (localhost or taskmint:// deep link) and the capture server's
// status.

use tauri::State;

use crate::state::AppState;
use crate::types::{CaptureServerStatus, PendingCapture};

/// Returns and clears the pending capture — a payload is processed at most
/// once. The frontend calls this on mount and on every
/// `work-log-payload-captured` event.
#[tauri::command]
pub fn take_pending_work_log_capture(
    app_state: State<'_, AppState>,
) -> Result<Option<PendingCapture>, String> {
    app_state.with_pending_work_log_capture_mut(|slot| slot.take())
}

#[tauri::command]
pub fn get_capture_server_status(
    app_state: State<'_, AppState>,
) -> Result<CaptureServerStatus, String> {
    app_state.with_capture_server_status(|status| status.clone())
}
