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

#[tauri::command]
pub async fn export_data_to_file(
    app: tauri::AppHandle,
    data_json: String,
    suggested_filename: Option<String>,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    // Create a save dialog
    let file_path = app
        .dialog()
        .file()
        .set_title("Export Data")
        .add_filter("JSON Files", &["json"])
        .set_file_name(&suggested_filename.unwrap_or_else(|| {
            let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            format!("taskmint_export_{}.json", timestamp)
        }))
        .blocking_save_file();

    match file_path {
        Some(file_path) => {
            // Get the path as a string
            let path_str = file_path.to_string();
            let path = std::path::Path::new(&path_str);
            
            // Write the data to the selected file
            match std::fs::write(&path, data_json) {
                Ok(_) => {
                    // Open the folder containing the exported file
                    if let Some(parent_dir) = path.parent() {
                        let _ = tauri_plugin_opener::OpenerExt::opener(&app)
                            .open_path(parent_dir.to_string_lossy().to_string(), None::<String>);
                    }
                    
                    Ok(path_str)
                }
                Err(e) => Err(format!("Failed to write export file: {}", e)),
            }
        }
        None => Err("Export cancelled by user".to_string()),
    }
}
