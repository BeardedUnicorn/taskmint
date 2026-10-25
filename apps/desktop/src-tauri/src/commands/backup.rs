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

/// The error a cancelled save dialog returns; the frontend matches it to stay
/// quiet on cancel.
pub const EXPORT_CANCELLED: &str = "Export cancelled by user";

/// A file name for the save dialog: no directory parts, and ending in
/// `.{extension}` (added when missing).
pub fn export_file_name(suggested: &str, fallback: &str, extension: &str) -> String {
    let base = suggested.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let name = if base.is_empty() { fallback } else { base };
    let suffix = format!(".{}", extension);
    if name.to_lowercase().ends_with(&suffix) {
        name.to_string()
    } else {
        format!("{}{}", name, suffix)
    }
}

/// Asks where to save, then writes `contents` there. Returns the path, or
/// `EXPORT_CANCELLED` if the dialog was dismissed.
fn save_with_dialog(
    app: &tauri::AppHandle,
    title: &str,
    filter_name: &str,
    extension: &str,
    file_name: String,
    contents: String,
) -> Result<std::path::PathBuf, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter_name, &[extension])
        .set_file_name(file_name)
        .blocking_save_file()
        .ok_or_else(|| EXPORT_CANCELLED.to_string())?;
    let path = std::path::PathBuf::from(file_path.to_string());
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write export file: {}", e))?;
    Ok(path)
}

#[tauri::command]
pub async fn export_data_to_file(
    app: tauri::AppHandle,
    data_json: String,
    suggested_filename: Option<String>,
) -> Result<String, String> {
    let fallback = format!(
        "taskmint_export_{}",
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let file_name = export_file_name(
        suggested_filename.as_deref().unwrap_or(""),
        &fallback,
        "json",
    );
    let path = save_with_dialog(
        &app,
        "Export Data",
        "JSON Files",
        "json",
        file_name,
        data_json,
    )?;

    // Open the folder containing the exported file
    if let Some(parent_dir) = path.parent() {
        let _ = tauri_plugin_opener::OpenerExt::opener(&app)
            .open_path(parent_dir.to_string_lossy().to_string(), None::<String>);
    }
    Ok(path.to_string_lossy().to_string())
}

/// Saves a CSV the frontend built (Reports / Time Entries export).
#[tauri::command]
pub async fn export_csv_file(
    app: tauri::AppHandle,
    csv: String,
    suggested_filename: String,
) -> Result<String, String> {
    let file_name = export_file_name(&suggested_filename, "taskmint-time-entries", "csv");
    let path = save_with_dialog(&app, "Export CSV", "CSV Files", "csv", file_name, csv)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_data_from_file(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    // Create an open dialog
    let file_path = app
        .dialog()
        .file()
        .set_title("Import Data")
        .add_filter("JSON Files", &["json"])
        .blocking_pick_file();

    match file_path {
        Some(file_path) => {
            // Get the path as a string
            let path_str = file_path.to_string();
            let path = std::path::Path::new(&path_str);

            // Read the data from the selected file
            match std::fs::read_to_string(path) {
                Ok(file_contents) => {
                    // Validate that it's valid JSON
                    match serde_json::from_str::<serde_json::Value>(&file_contents) {
                        Ok(_) => Ok(file_contents),
                        Err(e) => Err(format!("Invalid JSON file: {}", e)),
                    }
                }
                Err(e) => Err(format!("Failed to read import file: {}", e)),
            }
        }
        None => Err("Import cancelled by user".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_names_keep_a_single_extension() {
        assert_eq!(export_file_name("report.csv", "x", "csv"), "report.csv");
        assert_eq!(export_file_name("Report.CSV", "x", "csv"), "Report.CSV");
        assert_eq!(export_file_name("report", "x", "csv"), "report.csv");
        assert_eq!(export_file_name("backup", "x", "json"), "backup.json");
    }

    #[test]
    fn export_names_drop_directories_and_fall_back_when_blank() {
        assert_eq!(
            export_file_name("../../etc/report.csv", "x", "csv"),
            "report.csv"
        );
        assert_eq!(
            export_file_name("C:\\Users\\me\\r.csv", "x", "csv"),
            "r.csv"
        );
        assert_eq!(export_file_name("  ", "fallback", "csv"), "fallback.csv");
        assert_eq!(export_file_name("dir/", "fallback", "csv"), "fallback.csv");
    }
}
