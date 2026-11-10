//! Test support: an AppState on a fresh folder with a FakePlatform and a
//! clock the test moves, and a logger that takes every level (so the
//! arguments of every log call are evaluated, and covered).

use crate::platform::fake::FakePlatform;
use crate::state::AppState;
use crate::store::json_file::tests::TempDir;
use crate::store::JsonFileStore;
use chrono::{DateTime, TimeZone, Utc};
use std::sync::{Arc, Mutex};

struct TestLogger;

impl log::Log for TestLogger {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, _: &log::Record) {}

    fn flush(&self) {}
}

static LOGGER: TestLogger = TestLogger;

/// Before any test runs: every log call goes through, and is dropped.
#[ctor::ctor]
fn log_everything() {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Trace);
}

/// When each test's clock starts.
pub fn start() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 3, 2, 15, 0, 0).unwrap()
}

pub struct Fixture {
    pub state: AppState,
    pub platform: Arc<FakePlatform>,
    pub dir: TempDir,
    now: Arc<Mutex<DateTime<Utc>>>,
}

impl Fixture {
    pub fn advance_ms(&self, ms: i64) {
        *self.now.lock().unwrap() += chrono::Duration::milliseconds(ms);
    }
}

pub fn fixture() -> Fixture {
    let dir = TempDir::new("shell");
    let platform = Arc::new(FakePlatform::default());
    let now = Arc::new(Mutex::new(start()));
    let clock = now.clone();
    let store = JsonFileStore::new(&dir.0);
    let clock: crate::backend::Clock = Arc::new(move || *clock.lock().unwrap());
    let state = AppState::open(store, clock, platform.clone());
    Fixture {
        state,
        platform,
        dir,
        now,
    }
}

#[test]
fn the_test_logger_takes_every_level() {
    let metadata = log::Metadata::builder().level(log::Level::Trace).build();
    assert!(log::logger().enabled(&metadata));
    log::logger().flush();
}
