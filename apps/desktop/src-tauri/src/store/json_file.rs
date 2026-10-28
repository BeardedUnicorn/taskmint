//! A folder of JSON files, each one object. It replaces tauri-plugin-store
//! and keeps its file format (pretty-printed JSON), so files from earlier
//! versions load and an earlier version can still open what this writes;
//! tests/fixtures/plugin-store pins that both ways. Unlike the plugin it
//! writes atomically and keeps no cache that could go stale.

use super::DATA_FILES;
use chrono::{DateTime, Utc};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

pub type JsonMap = serde_json::Map<String, serde_json::Value>;

/// How many `.bak-*` copies of each file are kept. Imports and restores
/// write one each, so older ones are deleted when a new copy is written.
pub const BACKUPS_KEPT: usize = 10;

#[derive(Clone)]
pub struct JsonFileStore {
    dir: PathBuf,
}

impl JsonFileStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn path(&self, file: &str) -> PathBuf {
        self.dir.join(file)
    }

    /// The file's object, or None when there's no file yet (a fresh install,
    /// or nothing saved so far). A file that can't be read or isn't a JSON
    /// object is an error.
    pub fn load(&self, file: &str) -> Result<Option<JsonMap>, String> {
        let bytes = match fs::read(self.path(file)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("Failed to read {}: {}", file, e)),
        };
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| format!("Failed to read {}: {}", file, e))
    }

    /// Replaces the file. The new contents are written beside it, flushed to
    /// disk and then renamed over it, so a crash leaves the old file or the
    /// new one, never half of one.
    pub fn save(&self, file: &str, contents: &JsonMap) -> Result<(), String> {
        let bytes = pretty(contents);
        let temp = self.path(&format!("{}.tmp", file));
        fs::create_dir_all(&self.dir)
            .and_then(|()| fs::File::create(&temp))
            .and_then(|mut out| out.write_all(&bytes).and_then(|()| out.sync_all()))
            .and_then(|()| fs::rename(&temp, self.path(file)))
            .map_err(|e| format!("Failed to save {}: {}", file, e))?;
        // The rename itself is durable once the folder is flushed. Not every
        // platform can open a folder for that, so it's best effort.
        let _ = fs::File::open(&self.dir).and_then(|dir| dir.sync_all());
        Ok(())
    }

    /// Deletes the file; one that isn't there is already gone.
    pub fn remove(&self, file: &str) -> Result<(), String> {
        match fs::remove_file(self.path(file)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("Failed to delete {}: {}", file, e))
            }
            _ => Ok(()),
        }
    }

    /// Copies the file aside as `<file>.bak-<stamp>` before something could
    /// overwrite data that's hard to get back, and deletes the oldest copies
    /// beyond BACKUPS_KEPT. None when there's no file yet.
    pub fn back_up(&self, file: &str, at: DateTime<Utc>) -> Result<Option<PathBuf>, String> {
        let source = self.path(file);
        if !source.exists() {
            return Ok(None);
        }
        let copy = self.copy_path(file, at);
        fs::copy(&source, &copy).map_err(|e| format!("Failed to back up {}: {}", file, e))?;
        self.prune(file);
        Ok(Some(copy))
    }

    /// Writes `contents` as a `<file>.bak-<stamp>` copy, in the file's own
    /// shape: data kept aside that the file itself won't hold as it was.
    pub fn write_copy(
        &self,
        file: &str,
        contents: &JsonMap,
        at: DateTime<Utc>,
    ) -> Result<PathBuf, String> {
        let copy = self.copy_path(file, at);
        fs::create_dir_all(&self.dir)
            .and_then(|()| fs::write(&copy, pretty(contents)))
            .map_err(|e| format!("Failed to save a copy beside {}: {}", file, e))?;
        self.prune(file);
        Ok(copy)
    }

    fn copy_path(&self, file: &str, at: DateTime<Utc>) -> PathBuf {
        self.path(&format!("{}.bak-{}", file, at.format("%Y%m%d%H%M%S")))
    }

    fn names(&self) -> std::io::Result<Vec<String>> {
        Ok(fs::read_dir(&self.dir)?
            .flatten()
            .filter_map(|e| e.file_name().to_str().map(String::from))
            .collect())
    }

    /// Best effort: a copy that can't be deleted stays. (It runs just after
    /// a copy was written to the folder, so the folder can be listed.)
    fn prune(&self, file: &str) {
        let names = self.names().unwrap_or_default();
        for name in backups_to_prune(&names, file, BACKUPS_KEPT) {
            if let Err(e) = fs::remove_file(self.path(&name)) {
                log::warn!("Couldn't delete old copy {}: {}", name, e);
            }
        }
    }

    /// Deletes every `.bak-*` copy of the data files (they hold the same
    /// data, so a full reset removes them too). Returns how many.
    pub fn delete_backups(&self) -> Result<usize, String> {
        let names = match self.names() {
            Ok(names) => names,
            // No folder yet means there's nothing to delete.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
            Err(e) => return Err(format!("Failed to read the data folder: {}", e)),
        };
        let mut deleted = 0;
        for name in names.iter().filter(|name| is_backup_name(name)) {
            fs::remove_file(self.path(name))
                .map_err(|e| format!("Failed to delete backup {}: {}", name, e))?;
            deleted += 1;
        }
        Ok(deleted)
    }
}

/// The plugin's format. A JSON object always serializes.
fn pretty(contents: &JsonMap) -> Vec<u8> {
    serde_json::to_vec_pretty(contents).expect("a JSON object serializes")
}

/// True for the safety copies of the data files, such as
/// `sessions.json.bak-20260831120000`.
pub fn is_backup_name(name: &str) -> bool {
    DATA_FILES.iter().any(|file| {
        name.strip_prefix(file)
            .is_some_and(|rest| rest.starts_with(".bak-"))
    })
}

/// The copies of `file` to delete so the newest `keep` remain. Their names
/// end in a sortable UTC stamp, so name order is age order.
pub fn backups_to_prune(names: &[String], file: &str, keep: usize) -> Vec<String> {
    let prefix = format!("{}.bak-", file);
    let mut copies: Vec<&String> = names.iter().filter(|n| n.starts_with(&prefix)).collect();
    copies.sort();
    let excess = copies.len().saturating_sub(keep);
    copies.into_iter().take(excess).cloned().collect()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::store::{RECORDS_FILE, SESSIONS_FILE, WORK_LOGS_FILE};
    use chrono::TimeZone;
    use serde_json::json;
    use std::path::Path;

    /// A fresh folder under the system temp dir, removed when dropped.
    pub(crate) struct TempDir(pub PathBuf);

    impl TempDir {
        pub(crate) fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("taskmint-{}-{}", name, uuid::Uuid::new_v4()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    pub(crate) fn fixtures() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/plugin-store")
    }

    fn at(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .plugin(tauri_plugin_store::Builder::default().build())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    /// What tauri-plugin-store reads from `path`.
    fn plugin_read(app: &tauri::App<tauri::test::MockRuntime>, path: &Path) -> JsonMap {
        let store = tauri_plugin_store::StoreBuilder::new(app.handle(), path)
            .build()
            .unwrap();
        store.reload().unwrap();
        let map = store.entries().into_iter().collect();
        store.close_resource();
        map
    }

    #[test]
    fn reads_the_files_the_store_plugin_wrote() {
        let app = mock_app();
        let store = JsonFileStore::new(fixtures());
        for file in DATA_FILES {
            let ours = store.load(file).unwrap().unwrap();
            assert_eq!(ours, plugin_read(&app, &fixtures().join(file)), "{}", file);
        }
    }

    #[test]
    fn the_store_plugin_reads_what_this_writes() {
        let app = mock_app();
        let dir = TempDir::new("plugin-reads");
        let store = JsonFileStore::new(&dir.0);
        for file in DATA_FILES {
            let contents = JsonFileStore::new(fixtures()).load(file).unwrap().unwrap();
            store.save(file, &contents).unwrap();
            assert_eq!(plugin_read(&app, &dir.0.join(file)), contents, "{}", file);
        }
    }

    #[test]
    fn a_one_key_file_comes_out_byte_for_byte_as_the_plugin_wrote_it() {
        // The plugin's top level is a HashMap, so only a one-key file has a
        // single possible spelling.
        let dir = TempDir::new("bytes");
        let store = JsonFileStore::new(&dir.0);
        let contents = JsonFileStore::new(fixtures())
            .load(SESSIONS_FILE)
            .unwrap()
            .unwrap();
        store.save(SESSIONS_FILE, &contents).unwrap();
        assert_eq!(
            fs::read(dir.0.join(SESSIONS_FILE)).unwrap(),
            fs::read(fixtures().join(SESSIONS_FILE)).unwrap()
        );
    }

    #[test]
    fn a_missing_file_is_none_and_an_unreadable_one_an_error() {
        let dir = TempDir::new("load");
        let store = JsonFileStore::new(&dir.0);
        assert_eq!(store.load(SESSIONS_FILE).unwrap(), None);

        fs::write(dir.0.join(SESSIONS_FILE), b"{ not json").unwrap();
        assert!(store
            .load(SESSIONS_FILE)
            .unwrap_err()
            .starts_with("Failed to read sessions.json: "));

        fs::write(dir.0.join(WORK_LOGS_FILE), b"[1, 2]").unwrap();
        assert!(store.load(WORK_LOGS_FILE).is_err());

        // A folder where the file should be: an I/O error, not "missing"
        fs::create_dir(dir.0.join(RECORDS_FILE)).unwrap();
        assert!(store.load(RECORDS_FILE).is_err());
    }

    #[test]
    fn saving_replaces_the_file_and_leaves_nothing_else_behind() {
        let dir = TempDir::new("save");
        // The data folder may not exist yet on a fresh install
        let store = JsonFileStore::new(dir.0.join("com.taskmint.app"));
        let mut contents = JsonMap::new();
        contents.insert("sessions".into(), json!([]));
        store.save(SESSIONS_FILE, &contents).unwrap();
        contents.insert("sessions".into(), json!([{ "id": "s1" }]));
        store.save(SESSIONS_FILE, &contents).unwrap();

        assert_eq!(store.load(SESSIONS_FILE).unwrap(), Some(contents));
        assert_eq!(store.names().unwrap(), vec![SESSIONS_FILE.to_string()]);
    }

    #[test]
    fn a_failed_save_keeps_the_old_file() {
        let dir = TempDir::new("save-fails");
        let store = JsonFileStore::new(&dir.0);
        let mut contents = JsonMap::new();
        contents.insert("sessions".into(), json!([{ "id": "kept" }]));
        store.save(SESSIONS_FILE, &contents).unwrap();
        // The temporary file's name is taken by a folder
        fs::create_dir(dir.0.join("sessions.json.tmp")).unwrap();

        let error = store.save(SESSIONS_FILE, &JsonMap::new()).unwrap_err();

        assert!(error.starts_with("Failed to save sessions.json: "));
        assert_eq!(store.load(SESSIONS_FILE).unwrap(), Some(contents));
    }

    #[test]
    fn saving_fails_when_the_folder_cannot_be_made() {
        let dir = TempDir::new("no-folder");
        fs::write(dir.0.join("blocked"), b"").unwrap();
        let store = JsonFileStore::new(dir.0.join("blocked"));
        assert!(store.save(SESSIONS_FILE, &JsonMap::new()).is_err());
        assert!(store
            .write_copy(RECORDS_FILE, &JsonMap::new(), at(0))
            .is_err());
    }

    #[test]
    fn a_backup_copies_the_file_and_keeps_the_newest_ten() {
        let dir = TempDir::new("backups");
        let store = JsonFileStore::new(&dir.0);
        assert_eq!(store.back_up(SESSIONS_FILE, at(0)).unwrap(), None);

        fs::write(dir.0.join(SESSIONS_FILE), b"{\"sessions\": []}").unwrap();
        for n in 0..12 {
            store.back_up(SESSIONS_FILE, at(n * 60)).unwrap();
        }
        let copy = store.back_up(SESSIONS_FILE, at(3600)).unwrap().unwrap();

        assert_eq!(
            copy.file_name().unwrap(),
            "sessions.json.bak-19700101010000"
        );
        assert_eq!(fs::read(&copy).unwrap(), b"{\"sessions\": []}");
        let mut names = store.names().unwrap();
        names.sort();
        assert_eq!(names.len(), 1 + BACKUPS_KEPT);
        assert_eq!(names[1], "sessions.json.bak-19700101000300");
    }

    #[test]
    fn an_old_copy_that_cant_be_deleted_stays() {
        let dir = TempDir::new("prune-fails");
        let store = JsonFileStore::new(&dir.0);
        fs::write(dir.0.join(SESSIONS_FILE), b"{}").unwrap();
        // The oldest "copy" is a folder, which remove_file refuses
        fs::create_dir(dir.0.join("sessions.json.bak-19690101000000")).unwrap();
        for n in 0..BACKUPS_KEPT as i64 {
            store.back_up(SESSIONS_FILE, at(n * 60)).unwrap();
        }
        assert!(dir.0.join("sessions.json.bak-19690101000000").is_dir());
    }

    #[test]
    fn a_backup_that_cannot_be_written_is_an_error() {
        let dir = TempDir::new("backup-fails");
        let store = JsonFileStore::new(&dir.0);
        fs::write(dir.0.join(SESSIONS_FILE), b"{}").unwrap();
        fs::create_dir(dir.0.join("sessions.json.bak-19700101000000")).unwrap();
        assert!(store
            .back_up(SESSIONS_FILE, at(0))
            .unwrap_err()
            .starts_with("Failed to back up sessions.json: "));
    }

    #[test]
    fn a_copy_of_new_data_is_a_backup_too() {
        let dir = TempDir::new("copy");
        let store = JsonFileStore::new(&dir.0);
        let mut records = JsonMap::new();
        records.insert("predefinedTasks".into(), json!([{ "id": "t1" }]));

        let copy = store.write_copy(RECORDS_FILE, &records, at(0)).unwrap();

        // So Reset All Data deletes it with the other copies
        assert!(is_backup_name(copy.file_name().unwrap().to_str().unwrap()));
        let saved: JsonMap = serde_json::from_slice(&fs::read(&copy).unwrap()).unwrap();
        assert_eq!(saved, records);
    }

    #[test]
    fn deleting_backups_removes_only_the_data_files_copies() {
        let dir = TempDir::new("delete");
        let store = JsonFileStore::new(&dir.0);
        assert_eq!(
            JsonFileStore::new(dir.0.join("none")).delete_backups(),
            Ok(0)
        );
        for name in [
            "sessions.json",
            "sessions.json.bak-20260831120000",
            "worklogs.json.bak-20260831120000",
            "appdata.json.bak-20261012120000",
            "sessions.json.pre-fix-backup-20260831164110",
            "notes.txt",
        ] {
            fs::write(dir.0.join(name), b"{}").unwrap();
        }

        assert_eq!(store.delete_backups(), Ok(3));

        let mut left = store.names().unwrap();
        left.sort();
        assert_eq!(
            left,
            vec![
                "notes.txt",
                "sessions.json",
                "sessions.json.pre-fix-backup-20260831164110"
            ]
        );
    }

    #[test]
    fn a_backup_that_cannot_be_deleted_is_an_error() {
        let dir = TempDir::new("delete-fails");
        fs::create_dir(dir.0.join("sessions.json.bak-20260831120000")).unwrap();
        assert!(JsonFileStore::new(&dir.0)
            .delete_backups()
            .unwrap_err()
            .starts_with("Failed to delete backup sessions.json.bak-20260831120000: "));
        // A file where the folder should be can't be listed
        fs::write(dir.0.join("file"), b"").unwrap();
        assert!(JsonFileStore::new(dir.0.join("file"))
            .delete_backups()
            .is_err());
    }

    #[test]
    fn pruning_keeps_the_newest_copies_of_one_file_only() {
        let names: Vec<String> = [
            "sessions.json.bak-20261001000000",
            "sessions.json.bak-20261003000000",
            "sessions.json.bak-20261002000000",
            "sessions.json.pre-fix-backup-20260831164110",
            "worklogs.json.bak-20260101000000",
            "sessions.json",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();

        assert_eq!(
            backups_to_prune(&names, "sessions.json", 2),
            vec!["sessions.json.bak-20261001000000".to_string()]
        );
        assert!(backups_to_prune(&names, "sessions.json", 10).is_empty());
        assert!(backups_to_prune(&names, "worklogs.json", 1).is_empty());
    }

    #[test]
    fn removing_a_file_is_done_once_it_is_gone() {
        let dir = TempDir::new("remove");
        let store = JsonFileStore::new(&dir.0);
        store.save("server.json", &JsonMap::new()).unwrap();
        store.remove("server.json").unwrap();
        assert_eq!(store.load("server.json").unwrap(), None);
        store.remove("server.json").unwrap();

        // A folder in its place can't be deleted as a file
        fs::create_dir(dir.0.join("server.json")).unwrap();
        let error = store.remove("server.json").unwrap_err();
        assert!(
            error.starts_with("Failed to delete server.json: "),
            "{}",
            error
        );
    }

    #[test]
    fn only_the_data_files_copies_are_backups() {
        assert!(is_backup_name("sessions.json.bak-20260831120000"));
        assert!(is_backup_name("worklogs.json.bak-20260831120000"));
        assert!(is_backup_name("appdata.json.bak-20261012120000"));

        // The live files and unrelated ones must never match.
        assert!(!is_backup_name("sessions.json"));
        assert!(!is_backup_name("appdata.json"));
        assert!(!is_backup_name("sessions.json.bak"));
        assert!(!is_backup_name("sessions.json.tmp"));
        assert!(!is_backup_name("other.json.bak-20260831120000"));
        assert!(!is_backup_name("mysessions.json.bak-20260831120000"));
    }
}
