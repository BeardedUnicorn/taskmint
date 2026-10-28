//! Server mode against a real TaskMint server, so it's ignored unless asked
//! for. scripts/verify.sh runs it on the throwaway stack it smoke-tests; by
//! hand, use a stack whose admin's data doesn't matter:
//!
//!   TASKMINT_SERVER_URL=http://localhost:18080 ADMIN_USERNAME=… ADMIN_PASSWORD=… \
//!     cargo test -p taskmint --test server_mode -- --ignored
//!
//! The desktop connects as the admin, restarts in server mode, uploads its
//! files and tracks time there, while a second device follows the server's
//! events as the web app does. Then it disconnects, and its token stops
//! working.

use chrono::Utc;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use taskmint_lib::backend::remote::Link;
use taskmint_lib::backend::server_api::{ApiError, EventStream, ServerApi, Timeouts};
use taskmint_lib::platform::{Platform, SaveDialog, SecretStore};
use taskmint_lib::server::{self, TOKEN_SECRET};
use taskmint_lib::store::JsonFileStore;
use taskmint_lib::tray::model::{TrayMenu, TrayStatus};
use taskmint_lib::AppState;

/// The webview, as far as this test is concerned: the events it gets.
#[derive(Default)]
struct Webview {
    events: Mutex<Vec<String>>,
}

impl Platform for Webview {
    fn emit(&self, event: &str, _: &Value) -> Result<(), String> {
        self.events.lock().unwrap().push(event.to_string());
        Ok(())
    }
    fn notify(&self, _: &str, _: &str, _: bool) -> Result<(), String> {
        Ok(())
    }
    fn pick_save_file(&self, _: &SaveDialog) -> Option<PathBuf> {
        None
    }
    fn pick_json_file(&self, _: &str) -> Option<PathBuf> {
        None
    }
    fn pick_folder(&self, _: &str) -> Option<PathBuf> {
        None
    }
    fn documents_dir(&self) -> Result<PathBuf, String> {
        Err("none".to_string())
    }
    fn reveal(&self, _: &Path) -> Result<(), String> {
        Ok(())
    }
    fn open_dir(&self, _: &Path) -> Result<(), String> {
        Ok(())
    }
    fn show_main_window(&self) {}
    fn render_tray(&self, _: &TrayMenu) -> Result<(), String> {
        Ok(())
    }
    fn set_tray_status(&self, _: &TrayStatus) -> Result<(), String> {
        Ok(())
    }
    fn has_tray(&self) -> bool {
        false
    }
    fn app_version(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
    fn restart(&self) {}
}

#[derive(Default)]
struct Keychain(Mutex<HashMap<String, String>>);

impl SecretStore for Keychain {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().get(name).cloned())
    }
    fn set(&self, name: &str, secret: &str) -> Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(name.to_string(), secret.to_string());
        Ok(())
    }
    fn delete(&self, name: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(name);
        Ok(())
    }
}

fn setting(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("set {} (see this file's docs)", name))
}

fn eventually(what: &str, done: impl Fn() -> bool) {
    let until = Instant::now() + Duration::from_secs(10);
    while !done() {
        assert!(Instant::now() < until, "timed out waiting for {}", what);
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Reads the stream until `name` arrives.
fn hear(stream: &mut EventStream, name: &str) {
    loop {
        let event = stream.next_event().unwrap().expect("the stream ended");
        if event.name == name {
            return;
        }
    }
}

#[test]
#[ignore = "needs a running TaskMint server (TASKMINT_SERVER_URL)"]
fn the_desktop_works_on_a_real_server() {
    let url = setting("TASKMINT_SERVER_URL");
    let (username, password) = (setting("ADMIN_USERNAME"), setting("ADMIN_PASSWORD"));
    let dir = std::env::temp_dir().join(format!("taskmint-server-mode-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/plugin-store");
    for file in ["sessions.json", "worklogs.json", "appdata.json"] {
        std::fs::copy(fixtures.join(file), dir.join(file)).unwrap();
    }
    let webview = Arc::new(Webview::default());
    let keychain = Arc::new(Keychain::default());
    let open = || {
        AppState::open(
            JsonFileStore::new(&dir),
            Arc::new(Utc::now),
            webview.clone(),
            keychain.clone(),
        )
    };

    // Connecting in local mode is kept for the next launch
    let local = open();
    let connection = server::connect(&local, &url, &username, &password).unwrap();
    assert!(connection.device_name.starts_with("TaskMint on "));
    drop(local);
    let desktop = open();
    assert_eq!(server::capabilities(&desktop)["dataLocation"], "server");
    eventually("the link", || {
        server::connection(&desktop).unwrap().link.status == Link::Connected
    });

    // Another device, as the web app is: its own token and event stream
    let other = ServerApi::new(&url, None, None, Timeouts::APP)
        .device_token(&username, &password, "server_mode test")
        .unwrap();
    let other = ServerApi::new(&url, Some(other.token), None, Timeouts::APP);
    let mut stream = other.events().unwrap();

    // This computer's files go up, and are on the server
    let uploaded = server::upload_local_data(&desktop).unwrap();
    let restored = &uploaded.restored;
    let sessions = restored["sessionsRestored"].as_u64().unwrap()
        + restored["sessionsAlreadyPresent"].as_u64().unwrap();
    assert_eq!(sessions, 4, "{}", restored);
    let on_server = other.command("get_sessions", &json!({})).unwrap();
    assert!(on_server
        .as_array()
        .unwrap()
        .iter()
        .any(|session| session["id"] == "session_finished"));

    // A timer started as the tray starts one: the other device hears it,
    // the webview hears it, and the tray's copy shows it running
    desktop
        .backend
        .call(
            "start_task",
            json!({ "taskId": "task_write", "taskName": "Writing" }),
        )
        .unwrap();
    hear(&mut stream, "timer-instance-started");
    eventually("the webview's event", || {
        webview
            .events
            .lock()
            .unwrap()
            .contains(&"timer-instance-started".to_string())
    });
    eventually("the running timer in the copy", || {
        desktop.backend.read(|data| {
            data.sessions
                .iter()
                .flat_map(|session| &session.timer_instances)
                .any(|instance| instance.is_running)
        })
    });
    desktop.backend.call("stop_live_timer", json!({})).unwrap();
    hear(&mut stream, "timer-instance-stopped");

    // Disconnecting revokes this computer's token
    let token = keychain.get(TOKEN_SECRET).unwrap().unwrap();
    assert!(server::disconnect(&desktop).unwrap().signed_out);
    let revoked = ServerApi::new(&url, Some(token), None, Timeouts::APP);
    assert_eq!(
        revoked.command("get_sessions", &json!({})),
        Err(ApiError::Unauthorized("sign in first".to_string()))
    );
    assert!(server::connection(&open()).is_none());

    other.sign_out().unwrap();
    std::fs::remove_dir_all(&dir).unwrap();
}
