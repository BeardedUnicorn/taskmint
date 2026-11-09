//! Server mode's connection: which server and account (server.json, beside
//! the data files) and this computer's token (in the OS keychain, never in a
//! file or the webview). Connecting or disconnecting takes effect when the
//! app starts again (restart_app), since the webview runs on one backend for
//! its whole life.

use crate::backend::local::quiet;
use crate::backend::remote::{Connection, LinkStatus, RemoteBackend};
use crate::backend::server_api::{ApiError, ServerApi, Timeouts, API_VERSION};
use crate::backend::{Clock, DataBackend, LocalBackend, Publish};
use crate::platform::SecretStore;
use crate::state::AppState;
use crate::store::json_file::JsonMap;
use crate::store::JsonFileStore;
use serde::Serialize;
use serde_json::{json, Value};

/// The connection, beside the data files (no file: local mode).
pub const CONNECTION_FILE: &str = "server.json";
/// The token's name in the keychain.
pub const TOKEN_SECRET: &str = "server-token";
/// The server takes token names of up to this many characters.
const DEVICE_NAME_MAX: usize = 100;
const NOT_CONNECTED: &str =
    "This computer isn't connected to a TaskMint server; its data is already here.";

fn load(store: &JsonFileStore) -> Result<Option<Connection>, String> {
    store
        .load(CONNECTION_FILE)?
        .map(|file| {
            serde_json::from_value(Value::Object(file))
                .map_err(|e| format!("Failed to read {}: {}", CONNECTION_FILE, e))
        })
        .transpose()
}

fn save(store: &JsonFileStore, connection: &Connection) -> Result<(), String> {
    let file: JsonMap =
        serde_json::from_value(json!(connection)).expect("a connection is an object");
    store.save(CONNECTION_FILE, &file)
}

/// The backend this launch uses: the server server.json names, else the
/// data files. A connection file that can't be read leaves the app on the
/// files (connecting again replaces it).
pub fn open_backend(
    store: &JsonFileStore,
    clock: Clock,
    secrets: &dyn SecretStore,
    timeouts: Timeouts,
    publish: Publish,
) -> DataBackend {
    let connection = load(store).unwrap_or_else(|e| {
        log::error!("{}; using the data on this computer", e);
        None
    });
    let Some(connection) = connection else {
        return DataBackend::Local(Box::new(LocalBackend::open(store.clone(), clock, publish)));
    };
    log::info!("Server mode: {} as {}", connection.url, connection.username);
    let token = secrets.get(TOKEN_SECRET).unwrap_or_else(|e| {
        log::error!("Server mode: no token: {}", e);
        None
    });
    // The zone new sessions are dated in; without one, the account's
    let zone = iana_time_zone::get_timezone().ok();
    DataBackend::Remote(RemoteBackend::open(
        connection, token, zone, timeouts, publish,
    ))
}

/// The shell, as get_capabilities names it: Android and iOS builds are
/// "mobile", where the webview leaves out what only a desktop has (the
/// tray, folder backups, idle detection, server mode, updates).
pub const RUNTIME: &str = if cfg!(mobile) { "mobile" } else { "desktop" };

/// get_capabilities: what the webview runs on.
pub fn capabilities(state: &AppState) -> Value {
    let data_location = match state.backend.remote() {
        Some(_) => "server",
        None => "local",
    };
    json!({ "runtime": RUNTIME, "dataLocation": data_location })
}

/// get_server_connection's reply: the server this launch uses, and the
/// link to it.
#[derive(Debug, Serialize)]
pub struct ServerConnection {
    #[serde(flatten)]
    pub connection: Connection,
    #[serde(flatten)]
    pub link: LinkStatus,
}

/// get_server_connection: None in local mode.
pub fn connection(state: &AppState) -> Option<ServerConnection> {
    state.backend.remote().map(|remote| ServerConnection {
        connection: remote.connection().clone(),
        link: remote.status(),
    })
}

/// The address as typed, checked: http or https, without a query, a
/// fragment or a trailing slash.
fn server_url(typed: &str) -> Result<String, String> {
    let typed = typed.trim();
    let invalid = || {
        format!(
            "\"{}\" isn't a server address. It starts with http:// or https://, like http://localhost:8080.",
            typed
        )
    };
    let mut url = url::Url::parse(typed).map_err(|_| invalid())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(invalid());
    }
    // The password and the token travel over it: unencrypted only within
    // this computer
    if url.scheme() == "http" && !on_this_computer(&url) {
        return Err(format!(
            "\"{}\" would send your password and token unencrypted. Use https://, or http:// only for this computer (localhost).",
            typed
        ));
    }
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// Whether the address is this computer's own: localhost, 127.x.x.x or ::1.
fn on_this_computer(url: &url::Url) -> bool {
    url.host().is_some_and(|host| match host {
        url::Host::Domain(name) => name == "localhost",
        url::Host::Ipv4(ip) => ip.is_loopback(),
        url::Host::Ipv6(ip) => ip.is_loopback(),
    })
}

/// A version's numbers, to compare (a part that isn't one counts as 0).
fn version_numbers(version: &str) -> Vec<u64> {
    version
        .split('.')
        .map(|part| part.parse().unwrap_or(0))
        .collect()
}

/// Why connecting failed, for the Server settings.
fn connect_failed(error: ApiError, url: &str) -> String {
    match error {
        ApiError::Unreachable(detail) => {
            format!("Can't reach a TaskMint server at {}: {}", url, detail)
        }
        ApiError::Unauthorized(message) | ApiError::Refused(message) => message,
    }
}

/// The server speaks this app's API and serves this version of it.
fn check_version(api: &ServerApi, app_version: &str, url: &str) -> Result<(), String> {
    let meta = api.meta().map_err(|e| connect_failed(e, url))?;
    if meta.api_version != API_VERSION {
        return Err(format!(
            "The TaskMint server at {} speaks API version {}, and this app speaks version {}.",
            url, meta.api_version, API_VERSION
        ));
    }
    if version_numbers(app_version) < version_numbers(&meta.min_desktop_version) {
        return Err(format!(
            "The TaskMint server at {} (version {}) needs TaskMint {} or later; this is {}.",
            url, meta.version, meta.min_desktop_version, app_version
        ));
    }
    Ok(())
}

/// The token's name on the server, so the account's token list says which
/// computer it is.
fn device_name() -> String {
    format!("TaskMint on {}", whoami::devicename())
        .chars()
        .take(DEVICE_NAME_MAX)
        .collect()
}

/// Revokes `api`'s token; false when the server couldn't be told (a token
/// it already refuses counts as signed out).
fn sign_out(api: &ServerApi) -> bool {
    match api.sign_out() {
        Ok(()) | Err(ApiError::Unauthorized(_)) => true,
        Err(e) => {
            log::warn!(
                "Server mode: couldn't sign this computer out: {}",
                e.into_detail()
            );
            false
        }
    }
}

/// connect_server: checks the server can serve this app, signs this
/// computer in, and keeps the token in the keychain and the connection in
/// server.json. A connection it replaces is signed out. The webview then
/// restarts the app (restart_app) to use the server.
pub fn connect(
    state: &AppState,
    url: &str,
    username: &str,
    password: &str,
) -> Result<Connection, String> {
    let url = server_url(url)?;
    let api = ServerApi::new(&url, None, None, state.timeouts);
    check_version(&api, &state.platform.app_version(), &url)?;
    let device_name = device_name();
    let signed_in = api
        .device_token(username, password, &device_name)
        .map_err(|e| connect_failed(e, &url))?;
    let connection = Connection {
        url,
        username: signed_in.user.username,
        device_name,
    };
    let kept = state
        .secrets
        .set(TOKEN_SECRET, &signed_in.token)
        .and_then(|()| save(&state.store, &connection));
    if let Err(e) = kept {
        // The new token isn't kept anywhere, so it shouldn't stay valid
        sign_out(&ServerApi::new(
            &connection.url,
            Some(signed_in.token),
            None,
            state.timeouts,
        ));
        return Err(format!("The connection couldn't be saved: {}", e));
    }
    state.backend.remote().into_iter().for_each(|replaced| {
        sign_out(replaced.api());
    });
    log::info!(
        "Connected to {} as {}; restarting to use it",
        connection.url,
        connection.username
    );
    Ok(connection)
}

/// disconnect_server's reply.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disconnected {
    /// False when the server couldn't be told: its token for this computer
    /// stays listed under API tokens until it's revoked there.
    pub signed_out: bool,
}

/// disconnect_server: signs this computer out of its server, and forgets
/// the token and the connection. The webview then restarts the app on the
/// data on this computer.
pub fn disconnect(state: &AppState) -> Result<Disconnected, String> {
    let signed_out = state
        .backend
        .remote()
        .is_some_and(|remote| sign_out(remote.api()));
    state.secrets.delete(TOKEN_SECRET)?;
    state.store.remove(CONNECTION_FILE)?;
    log::info!("Disconnected from the server; restarting on the data on this computer");
    Ok(Disconnected { signed_out })
}

/// upload_local_data's reply.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Uploaded {
    /// The records sent (tasks, notes, templates, the goal), merged item by item.
    pub records: usize,
    /// restore_backup_data's summary of the sessions and work logs.
    pub restored: Value,
    /// Data on this computer that couldn't be read, and so wasn't sent.
    pub warnings: Vec<String>,
}

/// upload_local_data: adds the data on this computer to the server's. The
/// records merge item by item, and sessions and work logs the server
/// doesn't have are added, as a merge restore adds them. Timers still live
/// here are finalized as of now, as in a restored export.
pub fn upload_local_data(state: &AppState) -> Result<Uploaded, String> {
    let remote = state.backend.remote().ok_or(NOT_CONNECTED.to_string())?;
    let local = LocalBackend::open(state.store.clone(), state.clock.clone(), quiet());
    let now = (state.clock)();
    let (records, payload, warnings): (JsonMap, Value, Vec<String>) = local.read(|data| {
        let notes = &data.notes;
        (
            data.records.clone(),
            json!({
                "mode": "merge",
                "sessions": data.sessions,
                "workLogEntries": data.work_log_entries,
                "workLogMappings": data.work_log_mappings,
                "exportedAt": now.to_rfc3339(),
            }),
            [
                &notes.session_warning,
                &notes.work_log_warning,
                &notes.records_error,
            ]
            .into_iter()
            .flatten()
            .cloned()
            .collect(),
        )
    });
    let count = records.len();
    remote.call("import_app_records", json!({ "records": records }))?;
    let restored = remote.call("restore_backup_data", json!({ "payload": payload }))?;
    log::info!("Uploaded this computer's data: {} record(s)", count);
    Ok(Uploaded {
        records: count,
        restored,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::remote::Link;
    use crate::store::json_file::tests::fixtures;
    use crate::testing::{
        connect_files, eventually, fixture, fixture_with, server_fixture, FakeServer, Fixture,
        TEST_TIMEOUTS, TOKEN,
    };

    /// The server signs bea in with tmk_new, and lets a token sign out.
    fn signs_in(server: &FakeServer) {
        server.reply(
            "POST",
            "/api/v1/auth/device-token",
            201,
            json!({ "id": "t1", "token": "tmk_new", "user": { "id": "u1", "username": "bea" } }),
        );
        server.reply("DELETE", "/api/v1/auth/device-token", 204, json!(null));
    }

    /// The tokens that signed out, in order.
    fn signed_out(server: &FakeServer) -> Vec<String> {
        server
            .seen_at("/api/v1/auth/device-token")
            .into_iter()
            .filter(|seen| seen.method == "DELETE")
            .map(|seen| seen.headers["authorization"].clone())
            .collect()
    }

    fn kept(f: &Fixture) -> (Option<String>, Option<Connection>) {
        (
            f.secrets.get(TOKEN_SECRET).unwrap(),
            load(&f.state.store).unwrap(),
        )
    }

    fn nowhere() -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        format!("http://{}", listener.local_addr().unwrap())
    }

    #[test]
    fn without_a_connection_the_app_uses_its_files() {
        let f = fixture();
        assert!(f.state.backend.remote().is_none());
        assert_eq!(
            capabilities(&f.state),
            json!({ "runtime": "desktop", "dataLocation": "local" })
        );
        assert!(connection(&f.state).is_none());
    }

    #[test]
    fn a_connection_file_that_cant_be_read_leaves_the_app_on_its_files() {
        for contents in [r#"{ "url": 1 }"#, "not JSON"] {
            let f = fixture_with(
                |dir, _| std::fs::write(dir.join(CONNECTION_FILE), contents).unwrap(),
                None,
            );
            assert!(f.state.backend.remote().is_none());
        }
    }

    #[test]
    fn a_connection_opens_the_server_with_the_keychains_token() {
        let server = FakeServer::start();
        let f = server_fixture(&server);
        server.wait_for_streams(1);
        assert_eq!(capabilities(&f.state)["dataLocation"], "server");
        let stream = server.seen_at("/api/v1/events").remove(0);
        assert_eq!(stream.headers["authorization"], format!("Bearer {}", TOKEN));
        eventually("connected", || {
            connection(&f.state).unwrap().link.status == Link::Connected
        });
        assert_eq!(
            json!(connection(&f.state).unwrap()),
            json!({
                "url": server.url,
                "username": "bea",
                "deviceName": "TaskMint on Test",
                "status": "connected",
                "detail": null,
            })
        );
    }

    #[test]
    fn a_keychain_that_cant_be_read_leaves_the_server_signed_out() {
        let server = FakeServer::start();
        let url = server.url.clone();
        let f = fixture_with(
            move |dir, secrets| {
                connect_files(dir, &url);
                secrets.fail();
            },
            Some(TEST_TIMEOUTS),
        );
        let remote = f.state.backend.remote().unwrap();
        assert_eq!(remote.status().status, Link::SignedOut);
        assert!(server.seen_at("/api/v1/events").is_empty());
    }

    #[test]
    fn addresses_are_checked() {
        assert_eq!(
            server_url("  http://localhost:8080/  "),
            Ok("http://localhost:8080".to_string())
        );
        assert_eq!(
            server_url("https://time.example.com/taskmint/?tab=1#top"),
            Ok("https://time.example.com/taskmint".to_string())
        );
        for typed in [
            "localhost:8080",
            "ftp://files.example.com",
            "not an address",
        ] {
            let error = server_url(typed).unwrap_err();
            assert!(error.contains("isn't a server address"), "{}", error);
        }
        // Plain http only to this computer
        for local in [
            "http://127.0.0.1:8080",
            "http://127.8.0.1",
            "http://[::1]:8080",
        ] {
            assert_eq!(server_url(local), Ok(local.to_string()));
        }
        for typed in [
            "http://time.example.com",
            "http://192.168.1.5:8080",
            "http://localhost.example.com",
            "http://[2001:db8::1]",
        ] {
            let error = server_url(typed).unwrap_err();
            assert!(error.contains("unencrypted"), "{}", error);
        }
    }

    #[test]
    fn versions_compare_by_their_numbers() {
        assert!(version_numbers("1.10.0") > version_numbers("1.9.3"));
        assert!(version_numbers("1.0") < version_numbers("1.0.1"));
        assert_eq!(version_numbers("2.x"), [2, 0]);
    }

    #[test]
    fn connecting_signs_in_and_keeps_the_connection() {
        let server = FakeServer::start();
        signs_in(&server);
        let f = fixture();
        let connection = connect(&f.state, &format!("{}/", server.url), "Bea", "secret").unwrap();
        assert_eq!(
            (connection.url.as_str(), connection.username.as_str()),
            (server.url.as_str(), "bea")
        );
        assert!(connection.device_name.starts_with("TaskMint on "));
        let request = server.seen_at("/api/v1/auth/device-token").remove(0).json();
        assert_eq!(
            (
                &request["username"],
                &request["password"],
                &request["deviceName"]
            ),
            (
                &json!("Bea"),
                &json!("secret"),
                &json!(connection.device_name)
            )
        );
        assert_eq!(kept(&f), (Some("tmk_new".to_string()), Some(connection)));
        // It takes effect at the restart
        assert!(f.state.backend.remote().is_none());
    }

    #[test]
    fn connecting_checks_the_server_first() {
        let f = fixture();
        let server = FakeServer::start();
        let meta = |api: u64, min: &str| {
            server.reply(
                "GET",
                "/api/v1/meta",
                200,
                json!({ "version": "9.0.0", "apiVersion": api, "minDesktopVersion": min }),
            )
        };
        let connect = |url: &str| connect(&f.state, url, "bea", "secret").unwrap_err();

        meta(2, "1.0.0");
        assert!(
            connect(&server.url).contains("speaks API version 2, and this app speaks version 1")
        );
        meta(1, "2.0.0");
        assert!(connect(&server.url).contains("needs TaskMint 2.0.0 or later; this is 1.2.3"));
        let nowhere = nowhere();
        assert!(connect(&nowhere)
            .starts_with(&format!("Can't reach a TaskMint server at {}: ", nowhere)));
        assert!(server.seen_at("/api/v1/auth/device-token").is_empty());

        meta(1, "1.0.0");
        server.reply(
            "POST",
            "/api/v1/auth/device-token",
            401,
            json!({ "error": "wrong username or password", "code": "bad_credentials" }),
        );
        assert_eq!(connect(&server.url), "wrong username or password");
        server.reply(
            "POST",
            "/api/v1/auth/device-token",
            429,
            json!({ "error": "too many sign-in attempts; try again in 60 s", "code": "rate_limited" }),
        );
        assert_eq!(
            connect(&server.url),
            "too many sign-in attempts; try again in 60 s"
        );
        assert!(connect("localhost:8080").contains("isn't a server address"));
        assert_eq!(kept(&f), (None, None));
    }

    #[test]
    fn a_connection_that_cant_be_kept_is_signed_out_again() {
        let server = FakeServer::start();
        signs_in(&server);
        let f = fixture();
        f.secrets.fail();
        assert_eq!(
            connect(&f.state, &server.url, "bea", "secret"),
            Err("The connection couldn't be saved: the keychain is locked".to_string())
        );
        assert_eq!(signed_out(&server), ["Bearer tmk_new"]);

        // server.json can't be written (and the server can't be told)
        let f = fixture();
        std::fs::create_dir(f.dir.0.join(CONNECTION_FILE)).unwrap();
        server.reply(
            "DELETE",
            "/api/v1/auth/device-token",
            500,
            json!({ "error": "down" }),
        );
        let error = connect(&f.state, &server.url, "bea", "secret").unwrap_err();
        assert!(
            error.starts_with("The connection couldn't be saved: Failed to save server.json"),
            "{}",
            error
        );
        assert_eq!(signed_out(&server).len(), 2);
    }

    #[test]
    fn connecting_again_signs_the_old_connection_out() {
        let server = FakeServer::start();
        signs_in(&server);
        let f = server_fixture(&server);
        connect(&f.state, &server.url, "bea", "secret").unwrap();
        assert_eq!(signed_out(&server), [format!("Bearer {}", TOKEN)]);
        assert_eq!(kept(&f).0, Some("tmk_new".to_string()));
    }

    #[test]
    fn disconnecting_signs_out_and_forgets_the_server() {
        let server = FakeServer::start();
        signs_in(&server);
        let f = server_fixture(&server);
        let done = json!(disconnect(&f.state).unwrap());
        assert_eq!(done, json!({ "signedOut": true }));
        assert_eq!(signed_out(&server), [format!("Bearer {}", TOKEN)]);
        assert_eq!(kept(&f), (None, None));

        // A token the server already refuses is signed out
        server.reply(
            "DELETE",
            "/api/v1/auth/device-token",
            401,
            json!({ "error": "sign in first" }),
        );
        assert!(
            disconnect(&server_fixture(&server).state)
                .unwrap()
                .signed_out
        );
        // A server that can't be told keeps the token listed
        server.reply(
            "DELETE",
            "/api/v1/auth/device-token",
            503,
            json!({ "error": "down" }),
        );
        assert!(
            !disconnect(&server_fixture(&server).state)
                .unwrap()
                .signed_out
        );
        // In local mode there's nothing to sign out
        assert!(!disconnect(&fixture().state).unwrap().signed_out);
    }

    #[test]
    fn disconnecting_says_what_it_couldnt_forget() {
        let f = fixture();
        f.secrets.fail();
        assert_eq!(disconnect(&f.state).unwrap_err(), "the keychain is locked");

        let f = fixture();
        std::fs::create_dir(f.dir.0.join(CONNECTION_FILE)).unwrap();
        assert!(disconnect(&f.state)
            .unwrap_err()
            .starts_with("Failed to delete server.json"));
    }

    #[test]
    fn uploading_adds_this_computers_data_to_the_servers() {
        let server = FakeServer::start();
        server.reply(
            "POST",
            "/api/v1/commands/import_app_records",
            200,
            json!({ "records": {}, "revisions": {} }),
        );
        let summary = json!({ "sessionsRestored": 4, "sessionsAlreadyPresent": 0 });
        server.reply(
            "POST",
            "/api/v1/commands/restore_backup_data",
            200,
            summary.clone(),
        );
        let url = server.url.clone();
        let f = fixture_with(
            move |dir, secrets| {
                for file in ["sessions.json", "worklogs.json", "appdata.json"] {
                    std::fs::copy(fixtures().join(file), dir.join(file)).unwrap();
                }
                connect_files(dir, &url);
                secrets.set(TOKEN_SECRET, TOKEN).unwrap();
            },
            Some(TEST_TIMEOUTS),
        );

        let uploaded = upload_local_data(&f.state).unwrap();
        assert_eq!(uploaded.restored, summary);
        let records = server
            .seen_at("/api/v1/commands/import_app_records")
            .remove(0)
            .json();
        let keys: Vec<&String> = records["records"].as_object().unwrap().keys().collect();
        assert_eq!(uploaded.records, keys.len());
        assert!(keys.contains(&&"predefinedTasks".to_string()));
        let restore = server
            .seen_at("/api/v1/commands/restore_backup_data")
            .remove(0)
            .json();
        let payload = &restore["payload"];
        assert_eq!(payload["mode"], "merge");
        assert_eq!(payload["exportedAt"], crate::testing::start().to_rfc3339());
        assert_eq!(payload["sessions"].as_array().unwrap().len(), 4);
        assert!(payload["workLogEntries"].is_array());
        // The fixture's unreadable records weren't sent
        assert_eq!(uploaded.warnings.len(), 2, "{:?}", uploaded.warnings);
        assert!(uploaded.warnings[0].starts_with("1 saved session record(s) could not be read"));
        assert!(uploaded.warnings[1].contains("work-log record(s) could not be read"));
    }

    #[test]
    fn uploading_needs_a_server_that_takes_it() {
        assert_eq!(
            upload_local_data(&fixture().state).unwrap_err(),
            NOT_CONNECTED
        );
        let server = FakeServer::start();
        server.reply(
            "POST",
            "/api/v1/commands/import_app_records",
            413,
            json!({ "error": "the request is too large" }),
        );
        let f = server_fixture(&server);
        assert_eq!(
            upload_local_data(&f.state).unwrap_err(),
            "the request is too large"
        );
        assert!(server
            .seen_at("/api/v1/commands/restore_backup_data")
            .is_empty());

        server.reply(
            "POST",
            "/api/v1/commands/import_app_records",
            200,
            json!({ "records": {}, "revisions": {} }),
        );
        server.reply(
            "POST",
            "/api/v1/commands/restore_backup_data",
            400,
            json!({ "error": "Invalid backup data" }),
        );
        assert_eq!(
            upload_local_data(&f.state).unwrap_err(),
            "Invalid backup data"
        );
    }
}
