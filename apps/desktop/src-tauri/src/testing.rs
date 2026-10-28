//! Test support: an AppState on a fresh folder with a FakePlatform, an
//! in-memory keychain and a clock the test moves, and a logger that takes
//! every level (so the arguments of every log call are evaluated, and
//! covered).

use crate::backend::server_api::Timeouts;
use crate::platform::fake::{FakePlatform, MemorySecrets};
use crate::platform::SecretStore;
use crate::server::{CONNECTION_FILE, TOKEN_SECRET};
use crate::state::AppState;
use crate::store::json_file::tests::TempDir;
use crate::store::JsonFileStore;
use chrono::{DateTime, TimeZone, Utc};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

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
    pub secrets: Arc<MemorySecrets>,
    pub dir: TempDir,
    now: Arc<Mutex<DateTime<Utc>>>,
}

impl Fixture {
    pub fn advance_ms(&self, ms: i64) {
        *self.now.lock().unwrap() += chrono::Duration::milliseconds(ms);
    }
}

pub fn fixture() -> Fixture {
    fixture_with(|_, _| {}, None)
}

/// Short waits, so tests of a server going away don't take long.
pub const TEST_TIMEOUTS: Timeouts = Timeouts {
    connect: Duration::from_secs(2),
    request: Duration::from_secs(5),
    stream_read: Duration::from_secs(5),
    retry: Duration::from_millis(20),
    retry_max: Duration::from_millis(40),
};

/// The token server-mode fixtures sign in with.
pub const TOKEN: &str = "tmk_test-token";

/// A fixture in server mode, connected to `server` as bea.
pub fn server_fixture(server: &FakeServer) -> Fixture {
    let url = server.url.clone();
    fixture_with(
        move |dir, secrets| {
            connect_files(dir, &url);
            secrets.set(TOKEN_SECRET, TOKEN).unwrap();
        },
        Some(TEST_TIMEOUTS),
    )
}

/// server.json, as connect_server writes it.
pub fn connect_files(dir: &Path, url: &str) {
    let connection = json!({ "url": url, "username": "bea", "deviceName": "TaskMint on Test" });
    std::fs::write(dir.join(CONNECTION_FILE), connection.to_string()).unwrap();
}

/// A fixture whose folder and keychain `prepare` sets up first. With
/// `timeouts`, the shell opens with them (else as the app does).
pub fn fixture_with(
    prepare: impl FnOnce(&Path, &MemorySecrets),
    timeouts: Option<Timeouts>,
) -> Fixture {
    let dir = TempDir::new("shell");
    let secrets = Arc::new(MemorySecrets::default());
    prepare(&dir.0, &secrets);
    open_fixture(dir, secrets, timeouts)
}

/// (Not generic: llvm-cov scores a generic by its best instantiation, and
/// each caller of fixture_with is one.)
fn open_fixture(dir: TempDir, secrets: Arc<MemorySecrets>, timeouts: Option<Timeouts>) -> Fixture {
    let platform = Arc::new(FakePlatform::default());
    let now = Arc::new(Mutex::new(start()));
    let clock = now.clone();
    let store = JsonFileStore::new(&dir.0);
    let clock: crate::backend::Clock = Arc::new(move || *clock.lock().unwrap());
    let state = match timeouts {
        None => AppState::open(store, clock, platform.clone(), secrets.clone()),
        Some(timeouts) => {
            AppState::open_with(store, clock, platform.clone(), secrets.clone(), timeouts)
        }
    };
    Fixture {
        state,
        platform,
        secrets,
        dir,
        now,
    }
}

/// Waits (up to 5 s) for `done`.
pub fn eventually(what: &str, done: impl Fn() -> bool) {
    wait_for(what, &done)
}

fn wait_for(what: &str, done: &dyn Fn() -> bool) {
    let until = Instant::now() + Duration::from_secs(5);
    while !done() {
        assert!(Instant::now() < until, "timed out waiting for {}", what);
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// A request the fake server got.
#[derive(Debug, Clone)]
pub struct Seen {
    pub method: String,
    pub path: String,
    /// By lowercase name.
    pub headers: HashMap<String, String>,
    pub body: String,
}

impl Seen {
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap()
    }
}

#[derive(Default)]
struct FakeShared {
    /// By "METHOD /path": status and body.
    replies: Mutex<HashMap<String, (u16, String)>>,
    seen: Mutex<Vec<Seen>>,
    streams: Mutex<Vec<TcpStream>>,
    /// Event streams opened so far.
    opened: Mutex<usize>,
    stream_opened: Condvar,
    stopping: AtomicBool,
}

/// A stand-in TaskMint server on 127.0.0.1. Each request gets the reply
/// set for its method and path (404 without one) and is recorded. `GET
/// /api/v1/events`, unless it has a reply set, opens an event stream the
/// test writes to.
pub struct FakeServer {
    pub url: String,
    shared: Arc<FakeShared>,
    accepting: Option<JoinHandle<()>>,
}

impl FakeServer {
    /// With replies for the reads server mode makes on connecting: no
    /// sessions, no records, and a server of this app's version.
    pub fn start() -> FakeServer {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let shared = Arc::new(FakeShared::default());
        let serving = shared.clone();
        let accepting = std::thread::spawn(move || {
            for connection in listener.incoming() {
                if serving.stopping.load(Ordering::SeqCst) {
                    return;
                }
                serve(&serving, connection.unwrap());
            }
        });
        let server = FakeServer {
            url,
            shared,
            accepting: Some(accepting),
        };
        server.reply("POST", "/api/v1/commands/get_sessions", 200, json!([]));
        server.reply(
            "POST",
            "/api/v1/commands/get_app_records",
            200,
            json!({ "records": {}, "revisions": {} }),
        );
        server.reply(
            "GET",
            "/api/v1/meta",
            200,
            json!({ "version": "1.0.0", "apiVersion": 1, "minDesktopVersion": "1.0.0" }),
        );
        server
    }

    pub fn reply(&self, method: &str, path: &str, status: u16, body: Value) {
        self.reply_text(method, path, status, &body.to_string());
    }

    pub fn reply_text(&self, method: &str, path: &str, status: u16, body: &str) {
        self.shared
            .replies
            .lock()
            .unwrap()
            .insert(format!("{} {}", method, path), (status, body.to_string()));
    }

    pub fn seen(&self) -> Vec<Seen> {
        self.shared.seen.lock().unwrap().clone()
    }

    /// The requests to `path`, in order.
    pub fn seen_at(&self, path: &str) -> Vec<Seen> {
        self.seen()
            .into_iter()
            .filter(|seen| seen.path == path)
            .collect()
    }

    /// Waits until `count` event streams have been opened in all.
    pub fn wait_for_streams(&self, count: usize) {
        let opened = self.shared.opened.lock().unwrap();
        let (opened, timeout) = self
            .shared
            .stream_opened
            .wait_timeout_while(opened, Duration::from_secs(5), |opened| *opened < count)
            .unwrap();
        assert!(!timeout.timed_out(), "the streams weren't opened");
        drop(opened);
    }

    /// Writes `text` to every open event stream.
    pub fn write(&self, text: &str) {
        for stream in self.shared.streams.lock().unwrap().iter_mut() {
            stream.write_all(text.as_bytes()).unwrap();
            stream.flush().unwrap();
        }
    }

    /// Sends an event to every open stream.
    pub fn send(&self, event: &str, data: Value) {
        self.write(&format!("event: {}\ndata: {}\n\n", event, data));
    }

    /// Ends every open stream.
    pub fn end_streams(&self) {
        for stream in self.shared.streams.lock().unwrap().drain(..) {
            let _ = stream.shutdown(Shutdown::Both);
        }
    }
}

impl Drop for FakeServer {
    fn drop(&mut self) {
        self.shared.stopping.store(true, Ordering::SeqCst);
        self.end_streams();
        // Wakes the accept loop
        let _ = TcpStream::connect(self.url.trim_start_matches("http://"));
        self.accepting.take().unwrap().join().unwrap();
    }
}

/// One request: its head and body, then the reply (or the stream's head).
fn serve(shared: &FakeShared, mut connection: TcpStream) {
    let mut reader = BufReader::new(connection.try_clone().unwrap());
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let mut words = line.split_whitespace();
    let method = words.next().unwrap().to_string();
    let path = words.next().unwrap().to_string();
    let mut headers = HashMap::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        let Some((name, value)) = line.trim_end().split_once(": ") else {
            break;
        };
        headers.insert(name.to_lowercase(), value.to_string());
    }
    let length = headers
        .get("content-length")
        .map_or(0, |length| length.parse().unwrap());
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
    let key = format!("{} {}", method, path);
    shared.seen.lock().unwrap().push(Seen {
        method,
        path: path.clone(),
        headers,
        body: String::from_utf8(body).unwrap(),
    });

    let reply = shared.replies.lock().unwrap().get(&key).cloned();
    match reply {
        None if key == "GET /api/v1/events" => {
            connection
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n")
                .unwrap();
            shared.streams.lock().unwrap().push(connection);
            *shared.opened.lock().unwrap() += 1;
            shared.stream_opened.notify_all();
        }
        reply => {
            let (status, body) = reply.unwrap_or_else(|| {
                (
                    404,
                    json!({ "error": "no reply set", "code": "not_found" }).to_string(),
                )
            });
            let head = format!(
                "HTTP/1.1 {} Fake\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                status,
                body.len()
            );
            connection.write_all(head.as_bytes()).unwrap();
            connection.write_all(body.as_bytes()).unwrap();
        }
    }
}

#[test]
fn the_test_logger_takes_every_level() {
    let metadata = log::Metadata::builder().level(log::Level::Trace).build();
    assert!(log::logger().enabled(&metadata));
    log::logger().flush();
}
