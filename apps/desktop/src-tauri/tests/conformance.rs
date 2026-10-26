//! The conformance scenarios against the desktop's LocalBackend, on real
//! files in a temporary folder. `reload` opens the folder again, so every
//! scenario also checks what was saved.

use chrono::{DateTime, Utc};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use taskmint_core::testkit::{self, Host};
use taskmint_lib::backend::LocalBackend;
use taskmint_lib::store::JsonFileStore;

struct DesktopHost {
    dir: PathBuf,
    now: Arc<Mutex<DateTime<Utc>>>,
    events: Arc<Mutex<Vec<String>>>,
    backend: LocalBackend,
}

impl DesktopHost {
    fn new() -> Self {
        let dir =
            std::env::temp_dir().join(format!("taskmint-conformance-{}", uuid::Uuid::new_v4()));
        let now = Arc::new(Mutex::new(testkit::start_time()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let backend = Self::open(&dir, &now, &events);
        Self {
            dir,
            now,
            events,
            backend,
        }
    }

    fn open(
        dir: &PathBuf,
        now: &Arc<Mutex<DateTime<Utc>>>,
        events: &Arc<Mutex<Vec<String>>>,
    ) -> LocalBackend {
        let now = now.clone();
        let events = events.clone();
        LocalBackend::open(
            JsonFileStore::new(dir),
            Box::new(move || *now.lock().unwrap()),
            Box::new(move |published| {
                let names = published.events.iter().map(|e| e.name.to_string());
                events.lock().unwrap().extend(names);
            }),
        )
    }
}

impl Drop for DesktopHost {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

impl Host for DesktopHost {
    fn call(&mut self, command: &str, args: Value) -> Result<Value, String> {
        self.backend.call_named(command, args)
    }

    fn take_events(&mut self) -> Vec<String> {
        std::mem::take(&mut *self.events.lock().unwrap())
    }

    fn advance(&mut self, ms: i64) {
        *self.now.lock().unwrap() += chrono::Duration::milliseconds(ms);
    }

    fn reload(&mut self) {
        self.backend = Self::open(&self.dir, &self.now, &self.events);
    }
}

#[test]
fn the_desktop_passes_every_scenario() {
    testkit::run_all(&mut || Box::new(DesktopHost::new())).unwrap();
}
