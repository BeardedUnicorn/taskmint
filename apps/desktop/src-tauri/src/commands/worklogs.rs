// Work-log reconciliation commands: the imported ledger (worklogs.json) and
// the destructive per-day session rewrite it drives. The rules (upserts, and
// re-validating every rewrite group against current state) are in
// taskmint_core::worklogs.

use crate::state::AppState;
use crate::storage;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use taskmint_core::model::{ProjectTaskMapping, WorkLogEntry};
use taskmint_core::sessions::task_links::sync_session_task_names;
use taskmint_core::worklogs::{
    apply_rewrite_groups, upsert_entries, upsert_mappings, AppliedGroup, RewriteGroup, SkippedGroup,
};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogsResponse {
    pub entries: Vec<WorkLogEntry>,
    pub mappings: Vec<ProjectTaskMapping>,
    pub load_warning: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportPayload {
    #[serde(default)]
    pub entries: Vec<WorkLogEntry>,
    #[serde(default)]
    pub mappings: Vec<ProjectTaskMapping>,
    #[serde(default)]
    pub rewrite_groups: Vec<RewriteGroup>,
    /// A project moved to another task: the entries are re-pointed, not new
    /// from the site, so they keep their `updated_at` (Payouts' "Last import").
    #[serde(default)]
    pub is_remap: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkLogImportSummary {
    pub entries_added: usize,
    pub entries_updated: usize,
    pub mappings_saved: usize,
    pub groups_applied: Vec<AppliedGroup>,
    pub groups_skipped: Vec<SkippedGroup>,
}

#[tauri::command]
pub fn get_work_logs(app_state: State<'_, AppState>) -> Result<WorkLogsResponse, String> {
    let (entries, mappings) =
        app_state.with_work_logs(|wl| (wl.entries.clone(), wl.mappings.clone()))?;
    let load_warning = app_state.with_work_log_load_warning(|w| w.clone())?;
    Ok(WorkLogsResponse {
        entries,
        mappings,
        load_warning,
    })
}

#[tauri::command]
pub async fn apply_work_log_import(
    app: AppHandle,
    app_state: State<'_, AppState>,
    payload: WorkLogImportPayload,
) -> Result<WorkLogImportSummary, String> {
    let now = Utc::now();
    let now_iso = now.to_rfc3339();
    // Replacement sessions carry the name the ledger had at import time;
    // read the current task names first (the tasks lock is never nested).
    let tasks = app_state.with_tasks(|tasks| tasks.clone())?;

    // Lock order: sessions → worklogs (also upheld by reset_all_app_data);
    // any future command touching both stores must lock in the same order.
    let summary = app_state.with_task_sessions_mut(
        |sessions| -> Result<WorkLogImportSummary, String> {
            app_state.with_work_logs_mut(|work_logs| -> Result<WorkLogImportSummary, String> {
                let (entries_added, entries_updated) = upsert_entries(
                    &mut work_logs.entries,
                    payload.entries,
                    &now_iso,
                    payload.is_remap,
                );
                let mappings_saved =
                    upsert_mappings(&mut work_logs.mappings, payload.mappings, &now_iso);

                // The rewrite deletes real tracked data; keep a pre-import copy of
                // the store file. Best-effort — an import must not fail because a
                // backup could not be written.
                if !payload.rewrite_groups.is_empty() {
                    if let Err(e) = storage::backup_store_file(&app) {
                        log::error!("Failed to back up sessions before import: {}", e);
                    }
                }

                let (groups_applied, groups_skipped) =
                    apply_rewrite_groups(sessions, payload.rewrite_groups, now);

                if !groups_applied.is_empty() {
                    sync_session_task_names(sessions, &tasks);
                    storage::save_sessions(&app, sessions)?;
                }
                storage::save_work_logs(&app, &work_logs.entries, &work_logs.mappings)?;

                Ok(WorkLogImportSummary {
                    entries_added,
                    entries_updated,
                    mappings_saved,
                    groups_applied,
                    groups_skipped,
                })
            })?
        },
    )??;

    if !summary.groups_applied.is_empty() {
        // Refreshes the frontend session context (same debounced reload path
        // as the timer-instance events). Non-fatal: the import is persisted.
        crate::events::emit_quiet(
            &app,
            crate::events::WORK_LOGS_IMPORTED,
            serde_json::json!({ "groupsApplied": summary.groups_applied.len() }),
        );
    }

    Ok(summary)
}
