// Backup functionality

use crate::config::get_config;
use crate::types::{BackupResult, PathValidationResult};
use crate::utils::is_valid_backup_timestamp;
use chrono::Utc;
use std::fs;
use std::path::Path;

pub fn validate_backup_path(path: &str) -> Result<PathValidationResult, String> {
    let config = get_config();
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
    let test_file_path = backup_path.join(&config.backup_write_test_filename);
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
    let config = get_config();
    let timestamp = Utc::now();
    let timestamp_str = timestamp.format("%Y%m%d_%H%M%S").to_string();
    let filename = format!(
        "{}{}{}",
        config.backup_filename_prefix, timestamp_str, config.backup_filename_extension
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
    let config = get_config();
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
            if filename.starts_with(&config.backup_filename_prefix)
                && filename.ends_with(&config.backup_filename_extension)
            {
                if let Some(timestamp_part) = filename
                    .strip_prefix(&config.backup_filename_prefix)
                    .and_then(|s| s.strip_suffix(&config.backup_filename_extension))
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
