// Restoring a TaskMint export file into the Rust-owned stores (sessions.json
// and worklogs.json). The frontend restores its own records itself and
// reloads the app afterwards. The merge and replace rules are in
// taskmint_core::restore.

use crate::state::AppState;
use crate::storage;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use taskmint_core::load::{parse_project_mappings, parse_work_log_entries};
use taskmint_core::restore::{
    finalize_time, parse_section, parse_sessions_section, restore_project_mappings,
    restore_sessions, restore_work_log_entries, RestoreMode,
};
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePayload {
    pub mode: RestoreMode,
    #[serde(default)]
    pub sessions: serde_json::Value,
    #[serde(default)]
    pub work_log_entries: serde_json::Value,
    #[serde(default)]
    pub work_log_mappings: serde_json::Value,
    /// The export's own timestamp; timers that were live when it was taken
    /// are finalized at this moment (see finalize_time).
    #[serde(default)]
    pub exported_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSummary {
    pub sessions_restored: usize,
    pub sessions_already_present: usize,
    pub work_log_entries_restored: usize,
    pub work_log_mappings_restored: usize,
    /// Records in the file that could not be read and were skipped.
    pub records_skipped: usize,
}

#[tauri::command]
pub async fn restore_backup_data(
    app: AppHandle,
    app_state: State<'_, AppState>,
    payload: RestorePayload,
) -> Result<RestoreSummary, String> {
    let now = Utc::now();
    let finalize_at = finalize_time(payload.exported_at.as_deref(), now);

    // Parse everything before touching state: a malformed section aborts the
    // restore with nothing changed.
    let (sessions, sessions_skipped) = parse_section(&payload.sessions, parse_sessions_section)?;
    let (entries, entries_skipped) =
        parse_section(&payload.work_log_entries, parse_work_log_entries)?;
    let (mappings, mappings_skipped) =
        parse_section(&payload.work_log_mappings, parse_project_mappings)?;

    // Lock order: sessions → worklogs (same as apply_work_log_import and
    // reset_all_app_data).
    let summary =
        app_state.with_task_sessions_mut(|store| -> Result<RestoreSummary, String> {
            app_state.with_work_logs_mut(|work_logs| -> Result<RestoreSummary, String> {
                // Never restore without a safety copy of what is being changed.
                storage::backup_store_file(&app)
                    .map_err(|e| format!("Restore cancelled: {}", e))?;
                storage::backup_store_file_named(&app, storage::WORKLOG_STORE_FILENAME)
                    .map_err(|e| format!("Restore cancelled: {}", e))?;

                let mut summary = RestoreSummary::default();
                if let Some(sessions) = sessions {
                    let (restored, already_present) =
                        restore_sessions(store, sessions, payload.mode, finalize_at);
                    summary.sessions_restored = restored;
                    summary.sessions_already_present = already_present;
                    storage::save_sessions(&app, store)?;
                }
                if entries.is_some() || mappings.is_some() {
                    if let Some(entries) = entries {
                        summary.work_log_entries_restored =
                            restore_work_log_entries(&mut work_logs.entries, entries, payload.mode);
                    }
                    if let Some(mappings) = mappings {
                        summary.work_log_mappings_restored = restore_project_mappings(
                            &mut work_logs.mappings,
                            mappings,
                            payload.mode,
                        );
                    }
                    storage::save_work_logs(&app, &work_logs.entries, &work_logs.mappings)?;
                }
                summary.records_skipped = sessions_skipped + entries_skipped + mappings_skipped;

                Ok(summary)
            })?
        })??;

    Ok(summary)
}
