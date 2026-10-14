// Backup functionality

use crate::config::{
    BACKUP_FILENAME_EXTENSION, BACKUP_FILENAME_PREFIX, BACKUP_WRITE_TEST_FILENAME,
};
use crate::types::{BackupResult, PathValidationResult};
use crate::utils::is_valid_backup_timestamp;
use chrono::Utc;
use std::fs;
use std::path::Path;

pub fn validate_backup_path(path: &str) -> Result<PathValidationResult, String> {
    let backup_path = Path::new(path);

    // Check if path is empty
    if path.trim().is_empty() {
        return Ok(PathValidationResult {
            is_valid: false,
            error: Some("Backup path cannot be empty".to_string()),
        });
    }

    // Check if path exists
    if !backup_path.exists() {
        // Try to create the directory to test if it's writable
        match fs::create_dir_all(backup_path) {
            Ok(_) => {
                return Ok(PathValidationResult {
                    is_valid: true,
                    error: None,
                });
            }
            Err(e) => {
                return Ok(PathValidationResult {
                    is_valid: false,
                    error: Some(format!("Cannot create backup directory: {}", e)),
                });
            }
        }
    }

    // Path exists, check if it's a directory
    if !backup_path.is_dir() {
        return Ok(PathValidationResult {
            is_valid: false,
            error: Some("Backup path must be a directory, not a file".to_string()),
        });
    }

    // Test write permissions by creating a temporary file
    let test_file_path = backup_path.join(BACKUP_WRITE_TEST_FILENAME);
    match fs::write(&test_file_path, "test") {
        Ok(_) => {
            // Clean up test file
            let _ = fs::remove_file(&test_file_path);
            Ok(PathValidationResult {
                is_valid: true,
                error: None,
            })
        }
        Err(e) => Ok(PathValidationResult {
            is_valid: false,
            error: Some(format!("Directory is not writable: {}", e)),
        }),
    }
}

pub fn perform_automatic_backup(
    backup_path: &str,
    current_data_json: &str,
    max_backups: u32,
) -> Result<BackupResult, String> {
    let timestamp = Utc::now();
    // Keeping zero would prune the backup just written along with the rest
    if max_backups == 0 {
        return Ok(BackupResult {
            success: false,
            file_path: None,
            error: Some("Keep at least one backup (the limit is set to 0)".to_string()),
            timestamp: timestamp.to_rfc3339(),
            file_size: None,
        });
    }
    let timestamp_str = timestamp.format("%Y%m%d_%H%M%S").to_string();
    let filename = format!(
        "{}{}{}",
        BACKUP_FILENAME_PREFIX, timestamp_str, BACKUP_FILENAME_EXTENSION
    );
    let file_path = Path::new(backup_path).join(&filename);

    // Ensure backup directory exists
    if let Some(parent) = file_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Ok(BackupResult {
                success: false,
                file_path: None,
                error: Some(format!("Failed to create backup directory: {}", e)),
                timestamp: timestamp.to_rfc3339(),
                file_size: None,
            });
        }
    }

    // Write backup file
    match fs::write(&file_path, current_data_json) {
        Ok(_) => {
            // Get file size
            let file_size = fs::metadata(&file_path).map(|metadata| metadata.len()).ok();

            // Clean up old backups
            if let Err(e) = cleanup_old_backups(backup_path, max_backups) {
                log::warn!("Failed to clean up old backups: {}", e);
            }

            Ok(BackupResult {
                success: true,
                file_path: Some(file_path.to_string_lossy().to_string()),
                error: None,
                timestamp: timestamp.to_rfc3339(),
                file_size,
            })
        }
        Err(e) => Ok(BackupResult {
            success: false,
            file_path: None,
            error: Some(format!("Failed to write backup file: {}", e)),
            timestamp: timestamp.to_rfc3339(),
            file_size: None,
        }),
    }
}

fn cleanup_old_backups(backup_path: &str, max_backups: u32) -> Result<(), String> {
    if max_backups == 0 {
        return Err("Refusing to delete every backup (max_backups is 0)".to_string());
    }
    let backup_dir = Path::new(backup_path);

    if !backup_dir.exists() {
        return Ok(());
    }

    let entries = match fs::read_dir(backup_dir) {
        Ok(e) => e,
        Err(err) => return Err(format!("Failed to read backup directory: {}", err)),
    };

    let mut backup_files: Vec<String> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
            if filename.starts_with(BACKUP_FILENAME_PREFIX)
                && filename.ends_with(BACKUP_FILENAME_EXTENSION)
            {
                if let Some(timestamp_part) = filename
                    .strip_prefix(BACKUP_FILENAME_PREFIX)
                    .and_then(|s| s.strip_suffix(BACKUP_FILENAME_EXTENSION))
                {
                    if is_valid_backup_timestamp(timestamp_part) {
                        backup_files.push(path.to_string_lossy().to_string());
                    } else {
                        log::debug!("Skipping file with invalid timestamp format: {}", filename);
                    }
                } else {
                    log::debug!("Skipping file with unexpected name format: {}", filename);
                }
            }
        }
    }

    // Sort by filename descending (newest first)
    backup_files.sort_by(|a, b| b.cmp(a));

    if backup_files.len() > max_backups as usize {
        let files_to_remove = backup_files.iter().skip(max_backups as usize);

        for path_str in files_to_remove {
            if let Err(e) = fs::remove_file(path_str) {
                log::warn!("Failed to remove old backup file {}: {}", path_str, e);
            } else {
                log::info!("Removed old backup file: {}", path_str);
            }
        }
    } else {
        log::debug!(
            "No cleanup needed: {} backup files found (max: {})",
            backup_files.len(),
            max_backups
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_backup_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("taskmint-backup-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_backup(dir: &Path, stamp: &str) {
        let name = format!(
            "{}{}{}",
            BACKUP_FILENAME_PREFIX, stamp, BACKUP_FILENAME_EXTENSION
        );
        fs::write(dir.join(name), "{}").unwrap();
    }

    fn backup_count(dir: &Path) -> usize {
        fs::read_dir(dir).unwrap().count()
    }

    #[test]
    fn a_limit_of_zero_writes_nothing_and_deletes_nothing() {
        let dir = temp_backup_dir();
        write_backup(&dir, "20260101_120000");

        let result = perform_automatic_backup(dir.to_str().unwrap(), "{}", 0).unwrap();

        assert!(!result.success);
        assert!(result.error.unwrap().contains("at least one backup"));
        assert_eq!(backup_count(&dir), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn keeps_the_newest_backups_up_to_the_limit() {
        let dir = temp_backup_dir();
        write_backup(&dir, "20260101_120000");
        write_backup(&dir, "20260102_120000");

        let result = perform_automatic_backup(dir.to_str().unwrap(), "{}", 2).unwrap();

        assert!(result.success);
        assert_eq!(backup_count(&dir), 2);
        assert!(!dir
            .join(format!(
                "{}20260101_120000{}",
                BACKUP_FILENAME_PREFIX, BACKUP_FILENAME_EXTENSION
            ))
            .exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_new_folder_validates_and_reaches_the_frontend_as_is_valid() {
        let dir = temp_backup_dir().join("New Backups");
        let result = validate_backup_path(dir.to_str().unwrap()).unwrap();

        assert!(result.is_valid);
        assert!(dir.is_dir());
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["isValid"], true);
        assert!(json.get("is_valid").is_none());
        fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_backup_result_uses_the_frontends_names() {
        let dir = temp_backup_dir();
        let result = perform_automatic_backup(dir.to_str().unwrap(), "{}", 5).unwrap();

        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["success"], true);
        assert!(json["filePath"]
            .as_str()
            .unwrap()
            .contains(BACKUP_FILENAME_PREFIX));
        assert!(json["fileSize"].as_u64().is_some());
        assert!(json.get("file_path").is_none());
        fs::remove_dir_all(&dir).unwrap();
    }
}
