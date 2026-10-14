//! Loading the saved data at launch. A partial or failed load must not
//! silently discard the user's data: the store file is backed up before any
//! later save can overwrite it, and a warning is recorded for the frontend
//! (sessions via get_session_load_warning, work logs via get_work_logs).

use crate::commands;
use crate::state::AppState;
use crate::storage;
use std::path::PathBuf;
use tauri::AppHandle;

/// The sentence a load warning ends with: where the backup went, or why it
/// couldn't be made.
fn backup_note(result: Result<Option<PathBuf>, String>) -> String {
    match result {
        Ok(Some(path)) => format!(" A backup was saved to {}.", path.display()),
        Ok(None) => String::new(),
        Err(e) => format!(" Backing up the previous data also failed: {}.", e),
    }
}

fn set_warning(slot: Result<(), String>) {
    if let Err(e) = slot {
        log::error!("Failed to record a load warning: {}", e);
    }
}

/// Load sessions.json into the state, repairing timers older builds left
/// stranded in inactive sessions.
pub fn load_sessions(app: &AppHandle, state: &AppState) {
    let loaded = match storage::load_sessions(app) {
        Ok(loaded) => loaded,
        Err(e) => {
            log::error!("Failed to load sessions: {}", e);
            let warning = format!(
                "Failed to load saved sessions: {}.{}",
                e,
                backup_note(storage::backup_store_file(app))
            );
            set_warning(state.with_session_load_warning_mut(|slot| *slot = Some(warning)));
            return;
        }
    };

    let mut backed_up = false;
    let warning = (loaded.skipped > 0).then(|| {
        backed_up = true;
        format!(
            "{} saved session record(s) could not be read and were skipped.{}",
            loaded.skipped,
            backup_note(storage::backup_store_file(app))
        )
    });

    // Paused (or running) timers left in inactive sessions can never be
    // reached or resumed there, so finalize them. Idempotent: later launches
    // find nothing to repair.
    let mut sessions = loaded.sessions;
    let migrated =
        commands::sessions::finalize_stranded_instances(&mut sessions, chrono::Utc::now());
    if migrated > 0 {
        log::warn!(
            "Finalized {} stranded timer instance(s) in inactive sessions",
            migrated
        );
        // A pre-migration copy, unless the skipped-record path made one
        if !backed_up {
            if let Err(e) = storage::backup_store_file(app) {
                log::error!("Failed to back up sessions before migration: {}", e);
            }
        }
    }

    let stored = state.with_task_sessions_mut(|slot| {
        *slot = sessions;
        if migrated > 0 {
            if let Err(e) = storage::save_sessions(app, slot) {
                log::error!("Failed to persist migrated sessions: {}", e);
            }
        }
    });
    if let Err(e) = stored {
        log::error!("Failed to store the loaded sessions: {}", e);
    }
    if let Some(warning) = warning {
        log::warn!("{}", warning);
        set_warning(state.with_session_load_warning_mut(|slot| *slot = Some(warning)));
    }
}

/// Load worklogs.json (the imported ledger and project mappings) into the
/// state, with the same tolerance as sessions.
pub fn load_work_logs(app: &AppHandle, state: &AppState) {
    let backup = || storage::backup_store_file_named(app, storage::WORKLOG_STORE_FILENAME);
    let loaded = match storage::load_work_logs(app) {
        Ok(loaded) => loaded,
        Err(e) => {
            log::error!("Failed to load work logs: {}", e);
            let warning = format!(
                "Failed to load saved work logs: {}.{}",
                e,
                backup_note(backup())
            );
            set_warning(state.with_work_log_load_warning_mut(|slot| *slot = Some(warning)));
            return;
        }
    };

    if loaded.skipped > 0 {
        let warning = format!(
            "{} saved work-log record(s) could not be read and were skipped.{}",
            loaded.skipped,
            backup_note(backup())
        );
        log::warn!("{}", warning);
        set_warning(state.with_work_log_load_warning_mut(|slot| *slot = Some(warning)));
    }
    let stored = state.with_work_logs_mut(|work_logs| {
        work_logs.entries = loaded.entries;
        work_logs.mappings = loaded.mappings;
    });
    if let Err(e) = stored {
        log::error!("Failed to store the loaded work logs: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_note_says_where_the_copy_went_or_why_not() {
        assert_eq!(
            backup_note(Ok(Some(PathBuf::from("/data/sessions.json.bak")))),
            " A backup was saved to /data/sessions.json.bak."
        );
        assert_eq!(backup_note(Ok(None)), "");
        assert_eq!(
            backup_note(Err("disk full".to_string())),
            " Backing up the previous data also failed: disk full."
        );
    }
}
