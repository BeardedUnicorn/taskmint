//! Local mode: the data lives in JSON files in the app data folder, and
//! commands run in this process. One mutex guards the whole workspace (so
//! there's no lock order to keep). A write runs on a copy of it, the parts
//! it changed are saved, and only then does the copy replace the live data:
//! a failed save leaves memory as it was on disk.

use crate::store::json_file::JsonMap;
use crate::store::{JsonFileStore, RECORDS_FILE, SESSIONS_FILE, WORK_LOGS_FILE};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use taskmint_core::command::{execute, Backup, Command, Ctx, Event, ResetSummary};
use taskmint_core::load::{parse_project_mappings, parse_sessions, parse_work_log_entries};
use taskmint_core::records::is_app_record_key;
use taskmint_core::restore::SectionParser;
use taskmint_core::workspace::{Parts, Workspace};
use taskmint_core::DayZone;

const SESSIONS_KEY: &str = "sessions";
const ENTRIES_KEY: &str = "entries";
const MAPPINGS_KEY: &str = "mappings";

/// The time: `Utc::now` in the app, a fixed one in tests.
pub type Clock = Arc<dyn Fn() -> DateTime<Utc> + Send + Sync>;

/// What a command changed, once it's saved: its events for the frontend,
/// and the parts that changed (the tray follows the sessions and tasks).
pub struct Published<'a> {
    pub events: &'a [Event],
    pub changed: Parts,
}

pub type Publish = Box<dyn Fn(&Published) + Send + Sync>;

/// Publishes nothing: for a backend opened only to read the files (server
/// mode uploading them).
pub fn quiet() -> Publish {
    Box::new(|_| {})
}

pub struct LocalBackend {
    store: JsonFileStore,
    workspace: Mutex<Workspace>,
    clock: Clock,
    publish: Publish,
}

/// The sentence a load warning ends with: where the copy went, or why there
/// isn't one.
/// (Only a file that exists is copied, and these files do.)
fn backup_note(result: Result<Option<PathBuf>, String>) -> String {
    match result {
        Ok(path) => path
            .map(|path| format!(" A backup was saved to {}.", path.display()))
            .unwrap_or_default(),
        Err(e) => format!(" Backing up the previous data also failed: {}.", e),
    }
}

/// The value at `key` of a loaded file, or null.
fn take(file: &mut JsonMap, key: &str) -> Value {
    file.remove(key).unwrap_or(Value::Null)
}

/// A list stored under `key`; a file without the key has an empty one.
fn list_at<T>(
    file: &mut JsonMap,
    key: &str,
    parse: SectionParser<T>,
) -> Result<(Vec<T>, usize), String> {
    match take(file, key) {
        Value::Null => Ok((Vec::new(), 0)),
        value => parse(&value),
    }
}

/// The saved parts, in the order they're written. The capture waiting for
/// the frontend is kept in memory only.
const FILES: [(Parts, &str); 3] = [
    (Parts::SESSIONS, SESSIONS_FILE),
    (Parts::WORK_LOGS, WORK_LOGS_FILE),
    (Parts::RECORDS, RECORDS_FILE),
];

fn files_in(parts: Parts) -> impl Iterator<Item = (Parts, &'static str)> {
    FILES
        .into_iter()
        .filter(move |(part, _)| parts.contains(*part))
}

/// A part in its file's shape.
fn file_contents(workspace: &Workspace, part: Parts) -> JsonMap {
    let mut file = JsonMap::new();
    if part == Parts::SESSIONS {
        file.insert(SESSIONS_KEY.into(), to_value(&workspace.sessions));
    } else if part == Parts::WORK_LOGS {
        file.insert(ENTRIES_KEY.into(), to_value(&workspace.work_log_entries));
        file.insert(MAPPINGS_KEY.into(), to_value(&workspace.work_log_mappings));
    } else {
        file = workspace.records.clone();
    }
    file
}

/// Sessions, entries and mappings are plain data, so this can't fail.
fn to_value(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("stored data is plain data")
}

impl LocalBackend {
    /// Loads the data files. A partial or failed load never silently loses
    /// data: the file is copied aside before anything can save over it, and
    /// the user is told (get_session_load_warning, get_work_logs). Repairs
    /// older builds need are saved straight away.
    pub fn open(store: JsonFileStore, clock: Clock, publish: Publish) -> Self {
        let now = clock();
        let mut workspace = Workspace::default();
        let mut repaired = Self::load_sessions(&store, &mut workspace, now);
        Self::load_work_logs(&store, &mut workspace, now);
        repaired |= Self::load_records(&store, &mut workspace);
        // Sessions without a rate, or with a task's old name, follow the
        // task list (the frontend used to send it after every launch).
        repaired |= workspace.sync_task_links().dirty;
        // Each file on its own: a repair that can't be saved now is made
        // again at the next launch.
        for (part, file) in files_in(repaired) {
            if let Err(e) = store.save(file, &file_contents(&workspace, part)) {
                log::error!("Failed to save the repaired {}: {}", file, e);
            }
        }
        Self {
            store,
            workspace: Mutex::new(workspace),
            clock,
            publish,
        }
    }

    /// sessions.json, repairing timers older builds left stranded in
    /// inactive sessions. Returns the parts to save.
    fn load_sessions(
        store: &JsonFileStore,
        workspace: &mut Workspace,
        now: DateTime<Utc>,
    ) -> Parts {
        let loaded = store.load(SESSIONS_FILE).and_then(|file| {
            let value = file.map_or(Value::Null, |mut file| take(&mut file, SESSIONS_KEY));
            match value {
                Value::Null => Ok((Vec::new(), 0)),
                value => parse_sessions(&value).map(|loaded| (loaded.sessions, loaded.skipped)),
            }
        });
        let (mut sessions, skipped) = match loaded {
            Ok(loaded) => loaded,
            Err(e) => {
                let warning = format!(
                    "Failed to load saved sessions: {}.{}",
                    e,
                    backup_note(store.back_up(SESSIONS_FILE, now))
                );
                log::error!("{}", warning);
                workspace.notes.session_warning = Some(warning);
                return Parts::NONE;
            }
        };
        let mut backed_up = false;
        if skipped > 0 {
            backed_up = true;
            let warning = format!(
                "{} saved session record(s) could not be read and were skipped.{}",
                skipped,
                backup_note(store.back_up(SESSIONS_FILE, now))
            );
            log::warn!("{}", warning);
            workspace.notes.session_warning = Some(warning);
        }
        // Paused (or running) timers in inactive sessions can never be
        // reached or resumed, so they're finalized. Later launches find
        // nothing to repair.
        let migrated = taskmint_core::timer::finalize_stranded_instances(&mut sessions, now);
        workspace.sessions = sessions;
        if migrated == 0 {
            return Parts::NONE;
        }
        log::warn!(
            "Finalized {} stranded timer instance(s) in inactive sessions",
            migrated
        );
        if !backed_up {
            if let Err(e) = store.back_up(SESSIONS_FILE, now) {
                log::error!("Failed to back up sessions before migration: {}", e);
            }
        }
        Parts::SESSIONS
    }

    /// worklogs.json, with the same tolerance as the sessions.
    fn load_work_logs(store: &JsonFileStore, workspace: &mut Workspace, now: DateTime<Utc>) {
        let loaded = store.load(WORK_LOGS_FILE).and_then(|file| {
            let mut file = file.unwrap_or_default();
            let (entries, entries_skipped) =
                list_at(&mut file, ENTRIES_KEY, parse_work_log_entries)?;
            let (mappings, mappings_skipped) =
                list_at(&mut file, MAPPINGS_KEY, parse_project_mappings)?;
            Ok((entries, mappings, entries_skipped + mappings_skipped))
        });
        let warning = match loaded {
            Ok((entries, mappings, skipped)) => {
                workspace.work_log_entries = entries;
                workspace.work_log_mappings = mappings;
                (skipped > 0).then(|| {
                    format!(
                        "{} saved work-log record(s) could not be read and were skipped.{}",
                        skipped,
                        backup_note(store.back_up(WORK_LOGS_FILE, now))
                    )
                })
            }
            Err(e) => Some(format!(
                "Failed to load saved work logs: {}.{}",
                e,
                backup_note(store.back_up(WORK_LOGS_FILE, now))
            )),
        };
        if let Some(warning) = &warning {
            log::warn!("{}", warning);
        }
        workspace.notes.work_log_warning = warning;
    }

    /// appdata.json. It holds the record keys only; anything else (an
    /// `initialized` marker an early build wrote) is dropped. A file that
    /// can't be read keeps the record commands refusing, so nothing saves
    /// over it. Returns the parts to save.
    fn load_records(store: &JsonFileStore, workspace: &mut Workspace) -> Parts {
        match store.load(RECORDS_FILE) {
            Ok(file) => {
                let (records, stray): (JsonMap, JsonMap) = file
                    .unwrap_or_default()
                    .into_iter()
                    .partition(|(key, _)| is_app_record_key(key));
                workspace.records = records;
                if stray.is_empty() {
                    return Parts::NONE;
                }
                let keys: Vec<&str> = stray.keys().map(String::as_str).collect();
                log::info!("Removed stray keys from appdata.json: {}", keys.join(", "));
                Parts::RECORDS
            }
            Err(e) => {
                log::error!("{}", e);
                workspace.notes.records_error = Some(e);
                Parts::NONE
            }
        }
    }

    /// Runs a command by name, as the webview sends it.
    pub fn call_named(&self, name: &str, args: Value) -> Result<Value, String> {
        let command = Command::parse(name, args).map_err(|e| e.to_string())?;
        self.call(command)
    }

    /// The live data. A command that panicked while holding the lock did so
    /// on its copy, so the live data is whole and the lock stays usable.
    fn live(&self) -> MutexGuard<'_, Workspace> {
        self.workspace
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    pub fn call(&self, command: Command) -> Result<Value, String> {
        let access = command.access();
        let mut live = self.live();
        let now = (self.clock)();
        let ctx = Ctx {
            now,
            zone: DayZone::Local,
        };
        if !access.write {
            return execute(command, &mut live, &ctx)
                .map(|done| done.reply)
                .map_err(|e| e.to_string());
        }

        let mut draft = live.clone();
        let mut done = execute(command, &mut draft, &ctx).map_err(|e| e.to_string())?;
        self.keep(&done.backups, now)?;
        self.save(&draft, &live, done.dirty)?;
        *live = draft;
        if done.purge_backups {
            done.reply = to_value(self.purge());
        }
        drop(live);

        if !done.events.is_empty() || !done.dirty.is_empty() {
            (self.publish)(&Published {
                events: &done.events,
                changed: done.dirty,
            });
        }
        Ok(done.reply)
    }

    /// Reads the live data.
    pub fn read<R>(&self, read: impl FnOnce(&Workspace) -> R) -> R {
        read(&self.live())
    }

    /// Keeps the copies a command asks for before it saves.
    fn keep(&self, backups: &[Backup], now: DateTime<Utc>) -> Result<(), String> {
        for backup in backups {
            match backup {
                Backup::Saved {
                    parts,
                    failure,
                    required,
                } => {
                    for (_, file) in files_in(*parts) {
                        match self.store.back_up(file, now) {
                            Ok(copy) => {
                                if let Some(copy) = copy {
                                    log::info!("Saved a copy of {} at {}", file, copy.display());
                                }
                            }
                            Err(e) if *required => return Err(format!("{}: {}", failure, e)),
                            Err(e) => log::error!("{}: {}", failure, e),
                        }
                    }
                }
                Backup::Incoming { records, failure } => {
                    let copy = self
                        .store
                        .write_copy(RECORDS_FILE, records, now)
                        .map_err(|e| format!("{}: {}", failure, e))?;
                    log::info!(
                        "Moving {} record(s) in; a copy is at {}",
                        records.len(),
                        copy.display()
                    );
                }
            }
        }
        Ok(())
    }

    /// Saves the `dirty` parts of `next`. If one fails, the files saved
    /// before it are put back as `previous` had them, so the files and the
    /// live data still agree.
    fn save(&self, next: &Workspace, previous: &Workspace, dirty: Parts) -> Result<(), String> {
        let mut saved = Vec::new();
        for (part, file) in files_in(dirty) {
            if let Err(e) = self.store.save(file, &file_contents(next, part)) {
                for (part, file) in saved {
                    if let Err(undo) = self.put_back(file, &file_contents(previous, part)) {
                        log::error!("Couldn't put {} back after a failed save: {}", file, undo);
                    }
                }
                return Err(e);
            }
            saved.push((part, file));
        }
        Ok(())
    }

    /// Saves a file again as it was. Only a disk that fails between two saves
    /// can stop it, so tests make it fail with a failpoint.
    fn put_back(&self, file: &str, contents: &JsonMap) -> Result<(), String> {
        fail::fail_point!("local-backend.put-back", |_| Err("disk gone".to_string()));
        self.store.save(file, contents)
    }

    /// Deletes the safety copies after a full reset. The data is already
    /// reset by then, so a failure is reported, not returned.
    fn purge(&self) -> ResetSummary {
        match self.store.delete_backups() {
            Ok(backups_deleted) => ResetSummary {
                backups_deleted,
                warning: None,
            },
            Err(e) => {
                let warning = format!(
                    "App data was reset, but removing backup files failed: {}",
                    e
                );
                log::error!("{}", warning);
                ResetSummary {
                    backups_deleted: 0,
                    warning: Some(warning),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::json_file::tests::{fixtures, TempDir};
    use chrono::TimeZone;
    use serde_json::json;
    use std::fs;
    use std::sync::Arc;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 3, 2, 15, 0, 0).unwrap()
    }

    #[test]
    fn a_quiet_backend_publishes_nothing() {
        quiet()(&Published {
            events: &[],
            changed: Parts::ALL,
        });
    }

    /// What the backend published: event names and changed parts, per call.
    type Log = Arc<Mutex<Vec<(Vec<&'static str>, Parts)>>>;

    fn open(dir: &TempDir) -> (LocalBackend, Log) {
        let log: Log = Arc::default();
        let sink = log.clone();
        let backend = LocalBackend::open(
            JsonFileStore::new(&dir.0),
            Arc::new(now),
            Box::new(move |published: &Published| {
                let names = published.events.iter().map(|e| e.name).collect();
                sink.lock().unwrap().push((names, published.changed));
            }),
        );
        (backend, log)
    }

    fn read_file(dir: &TempDir, file: &str) -> Value {
        serde_json::from_slice(&fs::read(dir.0.join(file)).unwrap()).unwrap()
    }

    fn sessions(backend: &LocalBackend) -> Vec<taskmint_core::model::TaskSession> {
        backend.read(|w| w.sessions.clone())
    }

    fn start(backend: &LocalBackend) -> Result<Value, String> {
        backend.call_named(
            "start_task",
            json!({ "taskId": "task_write", "taskName": "Writing" }),
        )
    }

    fn copy_fixtures(dir: &TempDir) {
        for file in crate::store::DATA_FILES {
            fs::copy(fixtures().join(file), dir.0.join(file)).unwrap();
        }
    }

    #[test]
    fn files_from_earlier_versions_load_and_are_repaired() {
        let dir = TempDir::new("old-files");
        copy_fixtures(&dir);

        let (backend, log) = open(&dir);

        let workspace = backend.read(|w| w.clone());
        let ids: Vec<&str> = workspace.sessions.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "session_finished",
                "session_old_build",
                "session_live",
                "session_stranded"
            ]
        );
        // The unreadable record is skipped, and the file kept as it was
        let copy = dir.0.join("sessions.json.bak-20260302150000");
        assert_eq!(
            workspace.notes.session_warning.as_deref(),
            Some(
                format!(
                    "1 saved session record(s) could not be read and were skipped. A backup was saved to {}.",
                    copy.display()
                )
                .as_str()
            )
        );
        assert_eq!(
            fs::read(&copy).unwrap(),
            fs::read(fixtures().join("sessions.json")).unwrap()
        );
        // A paused timer stranded in an inactive session is finalized
        let stranded = &workspace.sessions[3].timer_instances[0];
        assert!(!stranded.is_paused && !stranded.is_running);
        assert_eq!(stranded.duration, Some(20 * 60_000));
        // Sessions without a rate get their task's
        let rates: Vec<Option<f64>> = workspace.sessions.iter().map(|s| s.hourly_rate).collect();
        assert_eq!(rates, [Some(75.0), Some(40.5), Some(75.0), Some(40.5)]);

        assert_eq!(workspace.work_log_entries.len(), 2);
        assert_eq!(workspace.work_log_mappings.len(), 1);
        assert!(workspace
            .notes
            .work_log_warning
            .as_deref()
            .unwrap()
            .starts_with(
            "2 saved work-log record(s) could not be read and were skipped. A backup was saved to "
        ));

        // appdata.json keeps the records, not the early build's marker
        let mut keys: Vec<&String> = workspace.records.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "dailyGoal",
                "dailyGoalAchievements",
                "noteTemplates",
                "predefinedTasks",
                "taskNotes"
            ]
        );
        assert!(read_file(&dir, "appdata.json").get("initialized").is_none());
        let tasks: Vec<String> = workspace.tasks().into_iter().map(|t| t.id).collect();
        assert_eq!(tasks, ["task_write", "task_review"]);

        // The repairs are saved, so the next launch has nothing to do
        assert_eq!(
            read_file(&dir, "sessions.json")["sessions"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        let (again, _) = open(&dir);
        assert_eq!(again.read(|w| w.sessions.clone()), workspace.sessions);
        assert_eq!(again.read(|w| w.notes.session_warning.clone()), None);
        // Loading announces nothing
        assert!(log.lock().unwrap().is_empty());
    }

    #[test]
    fn a_fresh_install_starts_empty_and_writes_nothing_until_a_change() {
        let dir = TempDir::new("fresh");
        let (backend, _) = open(&dir);
        assert_eq!(backend.read(|w| w.clone()), Workspace::default());
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 0);

        start(&backend).unwrap();
        let mut names: Vec<String> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names, ["sessions.json"]);
    }

    #[test]
    fn unreadable_files_are_kept_and_reported() {
        let dir = TempDir::new("unreadable");
        fs::write(dir.0.join("sessions.json"), b"{ nope").unwrap();
        fs::write(dir.0.join("worklogs.json"), br#"{"entries": 3}"#).unwrap();

        let (backend, _) = open(&dir);

        let notes = backend.read(|w| w.notes.clone());
        let sessions = notes.session_warning.unwrap();
        assert!(
            sessions.starts_with("Failed to load saved sessions: Failed to read sessions.json: ")
        );
        assert!(sessions.ends_with(&format!(
            " A backup was saved to {}.",
            dir.0.join("sessions.json.bak-20260302150000").display()
        )));
        assert!(notes.work_log_warning.unwrap().starts_with(
            "Failed to load saved work logs: Stored work-log entry value is not an array. A backup was saved to "
        ));
        // Saving over it is fine now: the copy holds what couldn't be read
        start(&backend).unwrap();
        assert_eq!(
            fs::read(dir.0.join("sessions.json.bak-20260302150000")).unwrap(),
            b"{ nope"
        );
    }

    #[test]
    fn a_stranded_timer_is_finalized_with_a_copy_kept_first() {
        let dir = TempDir::new("stranded");
        let stranded = json!({ "sessions": [{
            "id": "s1", "taskId": "t1", "taskName": "A", "isActive": false, "notes": null,
            "timerInstances": [{
                "id": "i1", "sessionId": "s1", "startTime": "2026-03-01T15:00:00Z",
                "endTime": null, "duration": null, "isPaused": true,
                "pausedAt": "2026-03-01T15:20:00Z", "pausedDuration": 0,
                "resumedAt": null, "notes": null
            }]
        }]});
        fs::write(dir.0.join("sessions.json"), stranded.to_string()).unwrap();
        fs::write(
            dir.0.join("worklogs.json"),
            br#"{"entries": [], "mappings": 3}"#,
        )
        .unwrap();
        // The repair can't be saved this time
        fs::create_dir(dir.0.join("sessions.json.tmp")).unwrap();

        let (backend, _) = open(&dir);

        let workspace = backend.read(|w| w.clone());
        assert_eq!(
            workspace.sessions[0].timer_instances[0].duration,
            Some(20 * 60_000)
        );
        assert_eq!(workspace.notes.session_warning, None);
        assert_eq!(
            read_file(&dir, "sessions.json.bak-20260302150000"),
            stranded
        );
        // Still as it was, so the next launch repairs it again
        assert_eq!(read_file(&dir, "sessions.json"), stranded);
        assert!(workspace.notes.work_log_warning.unwrap().starts_with(
            "Failed to load saved work logs: Stored project mapping value is not an array."
        ));
    }

    #[test]
    fn a_repair_goes_ahead_when_its_copy_cant_be_made() {
        let dir = TempDir::new("stranded-no-copy");
        let stranded = json!({ "sessions": [{
            "id": "s1", "taskId": "t1", "taskName": "A", "isActive": false, "notes": null,
            "timerInstances": [{
                "id": "i1", "sessionId": "s1", "startTime": "2026-03-01T15:00:00Z",
                "endTime": null, "duration": null, "isPaused": true,
                "pausedAt": "2026-03-01T15:20:00Z", "pausedDuration": 0,
                "resumedAt": null, "notes": null
            }]
        }]});
        fs::write(dir.0.join("sessions.json"), stranded.to_string()).unwrap();
        fs::create_dir(dir.0.join("sessions.json.bak-20260302150000")).unwrap();

        let (backend, _) = open(&dir);

        let instance = backend.read(|w| w.sessions[0].timer_instances[0].clone());
        assert!(!instance.is_paused);
        assert_eq!(
            read_file(&dir, "sessions.json")["sessions"][0]["timerInstances"][0]["isPaused"],
            false
        );
    }

    #[test]
    fn a_warning_says_when_the_copy_could_not_be_made() {
        let dir = TempDir::new("no-copy");
        fs::write(
            dir.0.join("sessions.json"),
            br#"{"sessions": "not a list"}"#,
        )
        .unwrap();
        fs::create_dir(dir.0.join("sessions.json.bak-20260302150000")).unwrap();

        let (backend, _) = open(&dir);

        let warning = backend.read(|w| w.notes.session_warning.clone()).unwrap();
        assert!(warning.starts_with(
            "Failed to load saved sessions: Stored sessions value is not an array. Backing up the previous data also failed: Failed to back up sessions.json: "
        ));
    }

    #[test]
    fn unreadable_records_are_never_saved_over() {
        let dir = TempDir::new("records");
        fs::write(dir.0.join("appdata.json"), b"[]").unwrap();

        let (backend, _) = open(&dir);

        let error = backend
            .call_named("get_app_records", Value::Null)
            .unwrap_err();
        assert!(error.starts_with("Failed to read appdata.json: "));
        assert_eq!(
            backend.call_named("set_app_record", json!({ "key": "dailyGoal", "value": 1 })),
            Err(error)
        );
        // Time tracking still works
        start(&backend).unwrap();
        assert_eq!(fs::read(dir.0.join("appdata.json")).unwrap(), b"[]");
    }

    #[test]
    fn a_failed_save_changes_nothing_and_announces_nothing() {
        let dir = TempDir::new("save-fails");
        let (backend, log) = open(&dir);
        start(&backend).unwrap();
        let before = sessions(&backend);
        let saved = fs::read(dir.0.join("sessions.json")).unwrap();
        fs::create_dir(dir.0.join("sessions.json.tmp")).unwrap();

        let error = backend
            .call_named("stop_live_timer", Value::Null)
            .unwrap_err();

        assert!(error.starts_with("Failed to save sessions.json: "));
        assert_eq!(sessions(&backend), before);
        assert_eq!(fs::read(dir.0.join("sessions.json")).unwrap(), saved);
        assert_eq!(log.lock().unwrap().len(), 1, "only the start was announced");
    }

    #[test]
    fn when_a_later_file_fails_the_earlier_ones_are_put_back() {
        let dir = TempDir::new("put-back");
        let (backend, _) = open(&dir);
        start(&backend).unwrap();
        let saved = fs::read(dir.0.join("sessions.json")).unwrap();
        fs::create_dir(dir.0.join("worklogs.json.tmp")).unwrap();

        let restore = json!({ "payload": {
            "mode": "merge",
            "sessions": [{ "id": "s_old", "notes": null }],
            "workLogEntries": [{ "id": "e1", "kind": "workLog" }]
        }});
        let error = backend
            .call_named("restore_backup_data", restore.clone())
            .unwrap_err();

        assert!(error.starts_with("Failed to save worklogs.json: "));
        assert_eq!(fs::read(dir.0.join("sessions.json")).unwrap(), saved);
        assert_eq!(sessions(&backend).len(), 1);

        // If even that fails, it's logged: the restore still reports its own
        // failure. (One test, so nothing else saves while the failpoint is on.)
        #[cfg(feature = "failpoints")]
        {
            let scenario = fail::FailScenario::setup();
            fail::cfg("local-backend.put-back", "return").unwrap();
            let again = backend.call_named("restore_backup_data", restore.clone());
            assert!(again
                .unwrap_err()
                .starts_with("Failed to save worklogs.json: "));
            scenario.teardown();
        }
    }

    #[test]
    fn a_restore_without_its_copy_is_refused() {
        let dir = TempDir::new("restore-copy");
        let (backend, _) = open(&dir);
        start(&backend).unwrap();
        fs::create_dir(dir.0.join("sessions.json.bak-20260302150000")).unwrap();

        let error = backend
            .call_named(
                "restore_backup_data",
                json!({ "payload": { "mode": "replace", "sessions": [] } }),
            )
            .unwrap_err();

        assert!(error.starts_with("Restore cancelled: Failed to back up sessions.json: "));
        assert_eq!(sessions(&backend).len(), 1);
    }

    #[test]
    fn an_import_goes_ahead_without_its_copy() {
        let dir = TempDir::new("import-copy");
        let (backend, _) = open(&dir);
        start(&backend).unwrap();
        fs::create_dir(dir.0.join("sessions.json.bak-20260302150000")).unwrap();

        let rewrite = json!({ "payload": {
            "rewriteGroups": [{ "taskId": "task_write", "workDay": "2026-03-01" }]
        }});
        assert!(backend.call_named("apply_work_log_import", rewrite).is_ok());
    }

    #[test]
    fn records_moving_in_are_copied_beside_appdata_json_first() {
        let dir = TempDir::new("moving-in");
        let (backend, _) = open(&dir);
        let moving = json!({ "records": { "taskNotes": [{ "id": "n1" }] } });

        backend
            .call_named("import_app_records", moving.clone())
            .unwrap();

        assert_eq!(
            read_file(&dir, "appdata.json.bak-20260302150000"),
            json!({ "taskNotes": [{ "id": "n1" }] })
        );

        let dir = TempDir::new("moving-in-fails");
        let (backend, _) = open(&dir);
        fs::create_dir(dir.0.join("appdata.json.bak-20260302150000")).unwrap();
        let error = backend
            .call_named("import_app_records", moving)
            .unwrap_err();
        assert!(error.starts_with(
            "Moving the records in was cancelled: Failed to save a copy beside appdata.json: "
        ));
        assert_eq!(backend.read(|w| w.records.clone()), JsonMap::new());
    }

    #[test]
    fn a_reset_empties_the_files_and_deletes_their_copies() {
        let dir = TempDir::new("reset");
        copy_fixtures(&dir);
        let (backend, log) = open(&dir);

        let reply = backend
            .call_named("reset_all_app_data", Value::Null)
            .unwrap();

        // The two copies the load made
        assert_eq!(reply, json!({ "backupsDeleted": 2, "warning": null }));
        assert_eq!(read_file(&dir, "sessions.json"), json!({ "sessions": [] }));
        assert_eq!(
            read_file(&dir, "worklogs.json"),
            json!({ "entries": [], "mappings": [] })
        );
        assert_eq!(read_file(&dir, "appdata.json"), json!({}));
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 3);
        assert_eq!(*log.lock().unwrap(), vec![(vec![], Parts::ALL)]);
    }

    #[test]
    fn a_reset_reports_copies_it_could_not_delete() {
        let dir = TempDir::new("reset-fails");
        let (backend, _) = open(&dir);
        fs::create_dir(dir.0.join("sessions.json.bak-20260101000000")).unwrap();

        let reply = backend
            .call_named("reset_all_app_data", Value::Null)
            .unwrap();

        assert_eq!(reply["backupsDeleted"], 0);
        assert!(reply["warning"].as_str().unwrap().starts_with(
            "App data was reset, but removing backup files failed: Failed to delete backup sessions.json.bak-20260101000000: "
        ));
    }

    #[test]
    fn only_saved_changes_are_announced() {
        let dir = TempDir::new("publish");
        let (backend, log) = open(&dir);

        start(&backend).unwrap();
        // Already running: nothing changed
        start(&backend).unwrap();
        backend.call_named("get_sessions", Value::Null).unwrap();
        assert!(backend
            .call_named("stop_timer_instance", json!({}))
            .is_err());
        assert!(backend.call_named("no_such_command", Value::Null).is_err());

        assert_eq!(
            *log.lock().unwrap(),
            vec![(vec!["timer-instance-started"], Parts::SESSIONS)]
        );
    }
}
