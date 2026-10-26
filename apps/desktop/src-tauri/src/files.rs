//! Files the user picks: exports through a save dialog, an import through
//! an open dialog, the backup folder, and showing a file in the file manager.
//! The webview asks for these through dispatch; it has no file access itself.

use crate::config::DEFAULT_BACKUP_FOLDER_NAME;
use std::path::PathBuf;
use taskmint_core::contract::{EXPORT_CANCELLED, IMPORT_CANCELLED, INVALID_JSON_FILE};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

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
    app: &AppHandle,
    title: &str,
    filter_name: &str,
    extension: &str,
    file_name: String,
    contents: String,
) -> Result<PathBuf, String> {
    let file_path = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter_name, &[extension])
        .set_file_name(file_name)
        .blocking_save_file()
        .ok_or_else(|| EXPORT_CANCELLED.to_string())?;
    let path = PathBuf::from(file_path.to_string());
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write export file: {}", e))?;
    Ok(path)
}

/// Saves a TaskMint export where the user picks, then opens its folder.
pub fn export_data_to_file(
    app: &AppHandle,
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
        app,
        "Export Data",
        "JSON Files",
        "json",
        file_name,
        data_json,
    )?;

    // Open the folder containing the exported file
    if let Some(parent_dir) = path.parent() {
        let _ = app
            .opener()
            .open_path(parent_dir.to_string_lossy().to_string(), None::<String>);
    }
    Ok(path.to_string_lossy().to_string())
}

/// Saves a CSV the frontend built (Reports / Time Entries export).
pub fn export_csv_file(
    app: &AppHandle,
    csv: String,
    suggested_filename: &str,
) -> Result<String, String> {
    let file_name = export_file_name(suggested_filename, "taskmint-time-entries", "csv");
    let path = save_with_dialog(app, "Export CSV", "CSV Files", "csv", file_name, csv)?;
    Ok(path.to_string_lossy().to_string())
}

/// The text of a JSON file the user picks, or IMPORT_CANCELLED.
pub fn import_data_from_file(app: &AppHandle) -> Result<String, String> {
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
                        Err(e) => Err(format!("{}: {}", INVALID_JSON_FILE, e)),
                    }
                }
                Err(e) => Err(format!("Failed to read import file: {}", e)),
            }
        }
        None => Err(IMPORT_CANCELLED.to_string()),
    }
}

/// A folder the user picks for automatic backups; None when dismissed.
pub fn pick_backup_dir(app: &AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Select Backup Directory")
        .blocking_pick_folder()
        .map(|folder| folder.to_string())
}

/// Where automatic backups go until the user picks a folder.
pub fn default_backup_dir(app: &AppHandle) -> Result<String, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|e| format!("Failed to find the Documents folder: {}", e))?;
    Ok(documents
        .join(DEFAULT_BACKUP_FOLDER_NAME)
        .to_string_lossy()
        .to_string())
}

/// Shows a file (a just-written export or backup) in the file manager.
pub fn reveal_path(app: &AppHandle, path: &str) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(PathBuf::from(path))
        .map_err(|e| format!("Failed to show {}: {}", path, e))
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
