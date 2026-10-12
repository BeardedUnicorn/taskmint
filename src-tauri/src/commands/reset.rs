// Full app-data reset (Settings → Data Management → Danger Zone).
//
// Wipes both persisted stores (sessions.json, worklogs.json) and their
// timestamped .bak-* safety copies, and clears every piece of in-memory state
// derived from them. The frontend clears localStorage (tasks, notes,
// templates, goals, settings) and reloads the webview after this returns, so
// no events are emitted here.

use crate::state::AppState;
use crate::storage;
use crate::types::TimerState;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetSummary {
    pub backups_deleted: usize,
    /// Set when the stores were reset but a best-effort cleanup step failed.
    pub warning: Option<String>,
}

#[tauri::command]
pub async fn reset_all_app_data(
    app: AppHandle,
    app_state: State<'_, AppState>,
) -> Result<ResetSummary, String> {
    // Lock order: sessions → worklogs, same as apply_work_log_import. Both
    // stores are cleared under the locks so no concurrent command can save a
    // snapshot of the old data in between. A failure here aborts the reset
    // (the frontend keeps its data too); a retry is idempotent.
    app_state.with_task_sessions_mut(|sessions| -> Result<(), String> {
        app_state.with_work_logs_mut(|work_logs| -> Result<(), String> {
            sessions.clear();
            work_logs.entries.clear();
            work_logs.mappings.clear();
            storage::clear_sessions_store(&app)?;
            storage::clear_work_logs_store(&app)
        })?
    })??;

    // Remaining in-memory state: the tasks mirror (its source of truth is
    // frontend localStorage, cleared by the caller), the tray timer state,
    // an unconsumed browser capture, and the startup load warnings (stale
    // after a wipe).
    app_state.with_tasks_mut(|tasks| tasks.clear())?;
    app_state.with_timer_state_mut(|timer| *timer = TimerState::default())?;
    app_state.with_pending_work_log_capture_mut(|capture| *capture = None)?;
    app_state.with_session_load_warning_mut(|warning| *warning = None)?;
    app_state.with_work_log_load_warning_mut(|warning| *warning = None)?;

    // Best-effort from here: the stores are already reset, so a cleanup
    // failure must not fail the command and strand the frontend un-reset.
    let (backups_deleted, warning) = match storage::delete_store_backups(&app) {
        Ok(deleted) => (deleted, None),
        Err(e) => {
            let warning = format!(
                "App data was reset, but removing backup files failed: {}",
                e
            );
            eprintln!("{}", warning);
            (0, Some(warning))
        }
    };

    if let Err(e) = crate::tray::update_tray_menu(&app, &*app_state) {
        eprintln!("Failed to update tray menu after data reset: {:?}", e);
    }
    if let Err(e) = crate::tray::update_tray_tooltip_only(&*app_state) {
        eprintln!("Failed to update tray tooltip after data reset: {:?}", e);
    }

    Ok(ResetSummary {
        backups_deleted,
        warning,
    })
}
