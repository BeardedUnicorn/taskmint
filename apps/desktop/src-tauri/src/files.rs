//! Files the user picks: exports through a save dialog, an import through
//! an open dialog, the backup folder, and showing a file in the file manager.
//! The webview asks for these through dispatch; it has no file access itself.

use crate::config::DEFAULT_BACKUP_FOLDER_NAME;
use crate::platform::SaveDialog;
use crate::state::Shell;
use std::path::{Path, PathBuf};
use taskmint_core::contract::{EXPORT_CANCELLED, IMPORT_CANCELLED, INVALID_JSON_FILE};

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
    shell: &Shell,
    dialog: SaveDialog,
    contents: String,
) -> Result<PathBuf, String> {
    let path = shell
        .platform
        .pick_save_file(&dialog)
        .ok_or_else(|| EXPORT_CANCELLED.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write export file: {}", e))?;
    Ok(path)
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

/// Saves a TaskMint export where the user picks, then opens its folder.
pub fn export_data_to_file(
    shell: &Shell,
    data_json: String,
    suggested_filename: Option<String>,
) -> Result<String, String> {
    let fallback = format!(
        "taskmint_export_{}",
        (shell.clock)().format("%Y%m%d_%H%M%S")
    );
    let dialog = SaveDialog {
        title: "Export Data",
        filter_name: "JSON Files",
        extension: "json",
        file_name: export_file_name(
            suggested_filename.as_deref().unwrap_or(""),
            &fallback,
            "json",
        ),
    };
    let path = save_with_dialog(shell, dialog, data_json)?;
    // A saved file always has a folder
    let folder = path.parent().unwrap_or(&path);
    if let Err(e) = shell.platform.open_dir(folder) {
        log::warn!("Couldn't open the export's folder: {}", e);
    }
    Ok(path_text(&path))
}

/// Saves a CSV the frontend built (Reports / Time Entries export).
pub fn export_csv_file(
    shell: &Shell,
    csv: String,
    suggested_filename: &str,
) -> Result<String, String> {
    let dialog = SaveDialog {
        title: "Export CSV",
        filter_name: "CSV Files",
        extension: "csv",
        file_name: export_file_name(suggested_filename, "taskmint-time-entries", "csv"),
    };
    save_with_dialog(shell, dialog, csv).map(|path| path_text(&path))
}

/// The text of a JSON file the user picks, or IMPORT_CANCELLED.
pub fn import_data_from_file(shell: &Shell) -> Result<String, String> {
    let path = shell
        .platform
        .pick_json_file("Import Data")
        .ok_or_else(|| IMPORT_CANCELLED.to_string())?;
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read import file: {}", e))?;
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("{}: {}", INVALID_JSON_FILE, e))?;
    Ok(contents)
}

/// A folder the user picks for automatic backups; None when dismissed.
pub fn pick_backup_dir(shell: &Shell) -> Option<String> {
    shell
        .platform
        .pick_folder("Select Backup Directory")
        .map(|folder| path_text(&folder))
}

/// Where automatic backups go until the user picks a folder.
pub fn default_backup_dir(shell: &Shell) -> Result<String, String> {
    let documents = shell
        .platform
        .documents_dir()
        .map_err(|e| format!("Failed to find the Documents folder: {}", e))?;
    Ok(path_text(&documents.join(DEFAULT_BACKUP_FOLDER_NAME)))
}

/// Shows a file (a just-written export or backup) in the file manager.
pub fn reveal_path(shell: &Shell, path: &str) -> Result<(), String> {
    shell
        .platform
        .reveal(Path::new(path))
        .map_err(|e| format!("Failed to show {}: {}", path, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::fixture;

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

    #[test]
    fn an_export_is_saved_where_the_user_picks_and_its_folder_opened() {
        let f = fixture();
        let target = f.dir.0.join("export.json");
        f.platform.answer(Some(target.clone()));

        let saved = export_data_to_file(&f.state, "{}".to_string(), None).unwrap();

        assert_eq!(saved, path_text(&target));
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "{}");
        let recorded = f.platform.recorded();
        assert_eq!(
            recorded.save_dialogs[0],
            SaveDialog {
                title: "Export Data",
                filter_name: "JSON Files",
                extension: "json",
                file_name: "taskmint_export_20260302_150000.json".to_string()
            }
        );
        assert_eq!(recorded.opened, std::slice::from_ref(&f.dir.0));
    }

    #[test]
    fn an_export_still_succeeds_when_its_folder_cant_be_opened() {
        let f = fixture();
        f.platform.fail("open_dir");
        f.platform.answer(Some(f.dir.0.join("export.json")));
        assert!(export_data_to_file(&f.state, "{}".to_string(), Some("mine".to_string())).is_ok());
        assert_eq!(f.platform.recorded().save_dialogs[0].file_name, "mine.json");
    }

    #[test]
    fn a_dismissed_or_unwritable_export_is_an_error() {
        let f = fixture();
        f.platform.answer(None);
        assert_eq!(
            export_csv_file(&f.state, "a,b".to_string(), "entries"),
            Err(EXPORT_CANCELLED.to_string())
        );
        // A folder where the file should go
        f.platform.answer(Some(f.dir.0.clone()));
        assert!(export_csv_file(&f.state, "a,b".to_string(), "entries")
            .unwrap_err()
            .starts_with("Failed to write export file: "));
    }

    #[test]
    fn a_csv_is_saved_without_opening_its_folder() {
        let f = fixture();
        let target = f.dir.0.join("entries.csv");
        f.platform.answer(Some(target.clone()));
        assert_eq!(
            export_csv_file(&f.state, "a,b".to_string(), "entries"),
            Ok(path_text(&target))
        );
        assert!(f.platform.recorded().opened.is_empty());
    }

    #[test]
    fn an_import_reads_the_picked_json_file() {
        let f = fixture();
        let good = f.dir.0.join("good.json");
        std::fs::write(&good, r#"{"version":"2"}"#).unwrap();
        let bad = f.dir.0.join("bad.json");
        std::fs::write(&bad, "not json").unwrap();

        f.platform.answer(Some(good));
        assert_eq!(
            import_data_from_file(&f.state),
            Ok(r#"{"version":"2"}"#.to_string())
        );
        f.platform.answer(Some(bad));
        assert!(import_data_from_file(&f.state)
            .unwrap_err()
            .starts_with("Invalid JSON file: "));
        f.platform.answer(Some(f.dir.0.join("missing.json")));
        assert!(import_data_from_file(&f.state)
            .unwrap_err()
            .starts_with("Failed to read import file: "));
        f.platform.answer(None);
        assert_eq!(
            import_data_from_file(&f.state),
            Err(IMPORT_CANCELLED.to_string())
        );
        assert_eq!(f.platform.recorded().open_dialogs.len(), 4);
    }

    #[test]
    fn backups_go_in_a_documents_folder_until_the_user_picks_one() {
        let f = fixture();
        f.platform.set_documents("/Users/me/Documents");
        assert_eq!(
            default_backup_dir(&f.state),
            Ok("/Users/me/Documents/TaskMint Backups".to_string())
        );
        f.platform.answer(Some(PathBuf::from("/Users/me/Backups")));
        assert_eq!(
            pick_backup_dir(&f.state),
            Some("/Users/me/Backups".to_string())
        );
        assert_eq!(pick_backup_dir(&f.state), None);

        let none = fixture();
        assert_eq!(
            default_backup_dir(&none.state),
            Err("Failed to find the Documents folder: no Documents folder".to_string())
        );
    }

    #[test]
    fn a_file_is_shown_in_the_file_manager() {
        let f = fixture();
        assert_eq!(reveal_path(&f.state, "/tmp/export.json"), Ok(()));
        assert_eq!(
            f.platform.recorded().revealed,
            [PathBuf::from("/tmp/export.json")]
        );
        f.platform.fail("reveal");
        assert_eq!(
            reveal_path(&f.state, "/tmp/export.json"),
            Err("Failed to show /tmp/export.json: reveal failed".to_string())
        );
    }
}
