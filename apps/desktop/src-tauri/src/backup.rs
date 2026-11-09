//! Automatic backups into a folder the user picks, and the list of them to
//! restore from. Every outcome, failures included, is reported in the result
//! the frontend shows.

use crate::config::{
    BACKUP_FILENAME_EXTENSION, BACKUP_FILENAME_PREFIX, BACKUP_WRITE_TEST_FILENAME,
};
use crate::utils::is_valid_backup_timestamp;
use chrono::{DateTime, NaiveDateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use taskmint_core::model::{BackupResult, PathValidationResult};

/// One of TaskMint's backups in the backup folder (list_backups). camelCase
/// like every type the frontend reads (BackupFileInfo in
/// packages/client/src/types/backup.ts).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    /// When it was written, from its name (RFC 3339, UTC).
    pub taken_at: String,
    /// In bytes.
    pub size: u64,
    /// Whether it reads as a TaskMint export; `problem` says why not.
    pub valid: bool,
    pub problem: Option<String>,
    /// The time the export in it records.
    pub exported_at: Option<String>,
}

fn valid() -> PathValidationResult {
    PathValidationResult {
        is_valid: true,
        error: None,
    }
}

fn invalid(error: String) -> PathValidationResult {
    PathValidationResult {
        is_valid: false,
        error: Some(error),
    }
}

/// Whether backups can go in `path`: a folder that exists (it's made if it
/// doesn't) and can be written to.
pub fn validate_backup_path(path: &str) -> PathValidationResult {
    if path.trim().is_empty() {
        return invalid("Backup path cannot be empty".to_string());
    }
    let folder = Path::new(path);
    if !folder.exists() {
        // Making it shows it can be written to
        return match fs::create_dir_all(folder) {
            Ok(()) => valid(),
            Err(e) => invalid(format!("Cannot create backup directory: {}", e)),
        };
    }
    if !folder.is_dir() {
        return invalid("Backup path must be a directory, not a file".to_string());
    }
    let test_file = folder.join(BACKUP_WRITE_TEST_FILENAME);
    match fs::write(&test_file, "test") {
        Ok(()) => {
            let _ = fs::remove_file(&test_file);
            valid()
        }
        Err(e) => invalid(format!("Directory is not writable: {}", e)),
    }
}

fn failed(error: String, at: DateTime<Utc>) -> BackupResult {
    BackupResult {
        success: false,
        file_path: None,
        error: Some(error),
        timestamp: at.to_rfc3339(),
        file_size: None,
    }
}

/// Writes `<prefix><stamp>.json` into `backup_path` and keeps the newest
/// `max_backups` of them.
pub fn perform_automatic_backup(
    backup_path: &str,
    current_data_json: &str,
    max_backups: u32,
    at: DateTime<Utc>,
) -> BackupResult {
    // Keeping zero would delete the backup just written with the rest
    if max_backups == 0 {
        return failed(
            "Keep at least one backup (the limit is set to 0)".to_string(),
            at,
        );
    }
    let folder = Path::new(backup_path);
    if let Err(e) = fs::create_dir_all(folder) {
        return failed(format!("Failed to create backup directory: {}", e), at);
    }
    let file_name = format!(
        "{}{}{}",
        BACKUP_FILENAME_PREFIX,
        at.format("%Y%m%d_%H%M%S"),
        BACKUP_FILENAME_EXTENSION
    );
    let file_path = folder.join(file_name);
    if let Err(e) = fs::write(&file_path, current_data_json) {
        return failed(format!("Failed to write backup file: {}", e), at);
    }
    remove_old_backups(folder, max_backups as usize);
    BackupResult {
        success: true,
        file_path: Some(file_path.to_string_lossy().to_string()),
        error: None,
        timestamp: at.to_rfc3339(),
        file_size: fs::metadata(&file_path).ok().map(|metadata| metadata.len()),
    }
}

/// The `YYYYMMDD_HHMMSS` stamp in a backup's name, if it's one of TaskMint's
/// own backups: only those are ever listed, read or deleted.
fn backup_stamp(name: &str) -> Option<&str> {
    name.strip_prefix(BACKUP_FILENAME_PREFIX)
        .and_then(|rest| rest.strip_suffix(BACKUP_FILENAME_EXTENSION))
        .filter(|stamp| is_valid_backup_timestamp(stamp))
}

fn is_backup_name(name: &str) -> bool {
    backup_stamp(name).is_some()
}

/// The export time in a backup's contents, or why they aren't an export.
fn read_export(bytes: &[u8]) -> Result<Option<String>, String> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| "It isn't valid JSON".to_string())?;
    if !value.get("data").is_some_and(Value::is_object) {
        return Err("It isn't a TaskMint export".to_string());
    }
    Ok(value
        .get("exportDate")
        .and_then(Value::as_str)
        .map(str::to_string))
}

fn describe_backup(folder: &Path, name: String, stamp: &str) -> BackupFile {
    let taken_at = NaiveDateTime::parse_from_str(stamp, "%Y%m%d_%H%M%S")
        .expect("a backup's stamp is a time")
        .and_utc()
        .to_rfc3339();
    let read = fs::read(folder.join(&name));
    let size = read.as_ref().map_or(0, |bytes| bytes.len() as u64);
    let (valid, problem, exported_at) = match read
        .map_err(|e| format!("It can't be read: {}", e))
        .and_then(|bytes| read_export(&bytes))
    {
        Ok(exported_at) => (true, None, exported_at),
        Err(problem) => (false, Some(problem), None),
    };
    BackupFile {
        name,
        taken_at,
        size,
        valid,
        problem,
        exported_at,
    }
}

/// TaskMint's backups in `folder`, newest first, each checked to read as an
/// export. A folder that isn't there has none.
pub fn list_backups(folder: &str) -> Result<Vec<BackupFile>, String> {
    let folder = Path::new(folder);
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Can't read the backup folder: {}", e)),
    };
    let mut backups: Vec<(String, String)> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter_map(|name| {
            let stamp = backup_stamp(&name)?.to_string();
            Some((stamp, name))
        })
        .collect();
    // Their stamps sort by age: newest first
    backups.sort_by(|a, b| b.cmp(a));
    Ok(backups
        .into_iter()
        .map(|(stamp, name)| describe_backup(folder, name, &stamp))
        .collect())
}

/// One of the backups list_backups found, to restore from. Only TaskMint's
/// own backups, by name, in the folder given.
pub fn read_backup(folder: &str, name: &str) -> Result<String, String> {
    if !is_backup_name(name) {
        return Err("That isn't one of TaskMint's backups".to_string());
    }
    fs::read_to_string(Path::new(folder).join(name))
        .map_err(|e| format!("Can't read the backup: {}", e))
}

/// Best effort: a backup that can't be deleted stays, and is logged.
fn remove_old_backups(folder: &Path, keep: usize) {
    let mut backups: Vec<String> = fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_backup_name(name))
        .collect();
    // Their stamps sort by age: newest first
    backups.sort_by(|a, b| b.cmp(a));
    for name in backups.iter().skip(keep) {
        match fs::remove_file(folder.join(name)) {
            Ok(()) => log::info!("Removed old backup file: {}", name),
            Err(e) => log::warn!("Failed to remove old backup file {}: {}", name, e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::json_file::tests::TempDir;
    use chrono::TimeZone;

    fn at(day: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, day, 12, 0, 0).unwrap()
    }

    fn write_backup(dir: &Path, stamp: &str) {
        let name = format!(
            "{}{}{}",
            BACKUP_FILENAME_PREFIX, stamp, BACKUP_FILENAME_EXTENSION
        );
        fs::write(dir.join(name), "{}").unwrap();
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    fn text(dir: &Path) -> &str {
        dir.to_str().unwrap()
    }

    #[test]
    fn a_limit_of_zero_writes_nothing_and_deletes_nothing() {
        let dir = TempDir::new("backup-zero");
        write_backup(&dir.0, "20260101_120000");

        let result = perform_automatic_backup(text(&dir.0), "{}", 0, at(2));

        assert!(!result.success);
        assert!(result.error.unwrap().contains("at least one backup"));
        assert_eq!(names(&dir.0).len(), 1);
    }

    #[test]
    fn keeps_the_newest_backups_up_to_the_limit_and_only_its_own_files() {
        let dir = TempDir::new("backup-keep");
        write_backup(&dir.0, "20260101_120000");
        write_backup(&dir.0, "20260102_120000");
        write_backup(&dir.0, "not_a_stamp");
        fs::write(dir.0.join("notes.txt"), "mine").unwrap();
        // An old backup that can't be deleted stays
        fs::create_dir(
            dir.0
                .join(format!("{}20250101_120000.json", BACKUP_FILENAME_PREFIX)),
        )
        .unwrap();

        let result = perform_automatic_backup(text(&dir.0), r#"{"a":1}"#, 2, at(3));

        assert!(result.success);
        assert_eq!(result.file_size, Some(7));
        assert_eq!(
            names(&dir.0),
            [
                "notes.txt",
                "time_tracker_backup_20250101_120000.json",
                "time_tracker_backup_20260102_120000.json",
                "time_tracker_backup_20260103_120000.json",
                "time_tracker_backup_not_a_stamp.json",
            ]
        );
    }

    #[test]
    fn a_backup_result_uses_the_frontends_names() {
        let dir = TempDir::new("backup-names");
        let result = perform_automatic_backup(text(&dir.0), "{}", 5, at(1));

        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["timestamp"], "2026-01-01T12:00:00+00:00");
        assert!(json["filePath"]
            .as_str()
            .unwrap()
            .ends_with("time_tracker_backup_20260101_120000.json"));
        assert!(json.get("file_path").is_none());
    }

    #[test]
    fn a_backup_says_why_it_failed() {
        let dir = TempDir::new("backup-fails");
        fs::write(dir.0.join("file"), "").unwrap();
        let under_a_file = dir.0.join("file").join("backups");
        let result = perform_automatic_backup(text(&under_a_file), "{}", 5, at(1));
        assert!(result
            .error
            .unwrap()
            .starts_with("Failed to create backup directory: "));

        // The backup's own name is taken by a folder
        fs::create_dir(dir.0.join("time_tracker_backup_20260101_120000.json")).unwrap();
        let result = perform_automatic_backup(text(&dir.0), "{}", 5, at(1));
        assert!(!result.success);
        assert!(result
            .error
            .unwrap()
            .starts_with("Failed to write backup file: "));
    }

    #[test]
    fn the_folders_backups_are_listed_newest_first_and_checked() {
        let dir = TempDir::new("backup-list");
        let name = |stamp: &str| {
            format!(
                "{}{}{}",
                BACKUP_FILENAME_PREFIX, stamp, BACKUP_FILENAME_EXTENSION
            )
        };
        let export =
            r#"{"version":"3","exportDate":"2026-01-02T12:00:00.000Z","data":{"tasks":[]}}"#;
        fs::write(dir.0.join(name("20260102_120000")), export).unwrap();
        fs::write(dir.0.join(name("20260103_120000")), "not json").unwrap();
        fs::write(dir.0.join(name("20260104_120000")), r#"{"data":[]}"#).unwrap();
        fs::create_dir(dir.0.join(name("20260105_120000"))).unwrap();
        fs::write(dir.0.join("notes.txt"), "mine").unwrap();
        fs::write(dir.0.join(name("not_a_stamp")), export).unwrap();

        let listed = list_backups(text(&dir.0)).unwrap();

        let names: Vec<&str> = listed.iter().map(|b| b.name.as_str()).collect();
        assert_eq!(
            names,
            [
                name("20260105_120000"),
                name("20260104_120000"),
                name("20260103_120000"),
                name("20260102_120000"),
            ]
        );
        assert_eq!(
            listed[3],
            BackupFile {
                name: name("20260102_120000"),
                taken_at: "2026-01-02T12:00:00+00:00".to_string(),
                size: export.len() as u64,
                valid: true,
                problem: None,
                exported_at: Some("2026-01-02T12:00:00.000Z".to_string()),
            }
        );
        assert_eq!(listed[2].problem.as_deref(), Some("It isn't valid JSON"));
        assert_eq!(
            listed[1].problem.as_deref(),
            Some("It isn't a TaskMint export")
        );
        assert!(listed[0]
            .problem
            .as_deref()
            .unwrap()
            .starts_with("It can't be read: "));
        assert_eq!((listed[0].valid, listed[0].size), (false, 0));

        // Its JSON names are the frontend's
        let json = serde_json::to_value(&listed[3]).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "name": name("20260102_120000"),
                "takenAt": "2026-01-02T12:00:00+00:00",
                "size": export.len(),
                "valid": true,
                "problem": null,
                "exportedAt": "2026-01-02T12:00:00.000Z",
            })
        );
    }

    #[test]
    fn a_missing_folder_has_no_backups_and_an_unreadable_one_says_so() {
        let dir = TempDir::new("backup-list-missing");
        assert_eq!(list_backups(text(&dir.0.join("gone"))), Ok(Vec::new()));
        fs::write(dir.0.join("file"), "").unwrap();
        assert!(list_backups(text(&dir.0.join("file")))
            .unwrap_err()
            .starts_with("Can't read the backup folder: "));
    }

    #[test]
    fn only_taskmints_own_backups_are_read() {
        let dir = TempDir::new("backup-read");
        let name = format!(
            "{}20260102_120000{}",
            BACKUP_FILENAME_PREFIX, BACKUP_FILENAME_EXTENSION
        );
        fs::write(dir.0.join(&name), "{}").unwrap();
        assert_eq!(read_backup(text(&dir.0), &name), Ok("{}".to_string()));

        fs::write(dir.0.join("secrets.json"), "{}").unwrap();
        for other in [
            "secrets.json",
            "../secrets.json",
            "time_tracker_backup_x.json",
        ] {
            assert_eq!(
                read_backup(text(&dir.0), other),
                Err("That isn't one of TaskMint's backups".to_string())
            );
        }
        let missing = format!(
            "{}20260103_120000{}",
            BACKUP_FILENAME_PREFIX, BACKUP_FILENAME_EXTENSION
        );
        assert!(read_backup(text(&dir.0), &missing)
            .unwrap_err()
            .starts_with("Can't read the backup: "));
    }

    #[test]
    fn a_folder_is_checked_before_backups_go_there() {
        let dir = TempDir::new("backup-validate");
        let new = dir.0.join("New Backups");
        let created = validate_backup_path(text(&new));
        assert!(created.is_valid);
        assert!(new.is_dir());
        // Its JSON names are the frontend's
        let json = serde_json::to_value(&created).unwrap();
        assert_eq!(json["isValid"], true);
        assert!(json.get("is_valid").is_none());

        assert!(validate_backup_path(text(&dir.0)).is_valid);
        assert_eq!(
            validate_backup_path("  ").error.as_deref(),
            Some("Backup path cannot be empty")
        );

        fs::write(dir.0.join("file"), "").unwrap();
        assert_eq!(
            validate_backup_path(text(&dir.0.join("file")))
                .error
                .as_deref(),
            Some("Backup path must be a directory, not a file")
        );
        assert!(validate_backup_path(text(&dir.0.join("file").join("x")))
            .error
            .unwrap()
            .starts_with("Cannot create backup directory: "));

        // The write test's own file name is taken by a folder
        fs::create_dir(new.join(BACKUP_WRITE_TEST_FILENAME)).unwrap();
        assert!(validate_backup_path(text(&new))
            .error
            .unwrap()
            .starts_with("Directory is not writable: "));
    }
}
