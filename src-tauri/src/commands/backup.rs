// Backup-related command handlers

use crate::backup;
use crate::types::{BackupResult, PathValidationResult};

#[tauri::command]
pub async fn validate_backup_path(path: String) -> Result<PathValidationResult, String> {
    backup::validate_backup_path(&path)
}

#[tauri::command]
pub async fn perform_automatic_backup(
    backup_path: String,
    current_data_json: String,
    max_backups: u32,
) -> Result<BackupResult, String> {
    backup::perform_automatic_backup(&backup_path, &current_data_json, max_backups)
}
