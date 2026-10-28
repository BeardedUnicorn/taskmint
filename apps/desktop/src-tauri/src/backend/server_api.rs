//! The TaskMint server's HTTP API (apps/server), as server mode uses it:
//! core commands, signing this device in and out, the version check, and
//! the event stream. Each request carries the device's token and time zone.

use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::time::Duration;
use taskmint_core::contract::TIME_ZONE_HEADER;

/// The API version this app speaks (`/api/v1`, and `apiVersion` in `/meta`).
pub const API_VERSION: u64 = 1;

/// How long server mode waits on the server.
#[derive(Debug, Clone, Copy)]
pub struct Timeouts {
    pub connect: Duration,
    /// A whole request, reply included (an upload sends everything at once).
    pub request: Duration,
    /// Silence on the event stream before it counts as dropped: longer than
    /// the server's 15-second keep-alive.
    pub stream_read: Duration,
    /// The wait before connecting the stream again; it doubles after each
    /// failure, up to `retry_max`.
    pub retry: Duration,
    pub retry_max: Duration,
}

impl Timeouts {
    pub const APP: Timeouts = Timeouts {
        connect: Duration::from_secs(10),
        request: Duration::from_secs(120),
        stream_read: Duration::from_secs(45),
        retry: Duration::from_secs(1),
        retry_max: Duration::from_secs(30),
    };
}

/// Why a request didn't get its reply.
#[derive(Debug, Clone, PartialEq)]
pub enum ApiError {
    /// No answer, or one that isn't the API's: the server is down, the
    /// address is wrong, or something else answered.
    Unreachable(String),
    /// The token was refused: it was revoked, or the account was disabled.
    Unauthorized(String),
    /// The server refused the request, in its own words.
    Refused(String),
}

impl ApiError {
    pub fn into_detail(self) -> String {
        match self {
            Self::Unreachable(detail) | Self::Unauthorized(detail) | Self::Refused(detail) => {
                detail
            }
        }
    }
}

/// `GET /meta`: the server's version, and the oldest desktop app it serves.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub version: String,
    pub api_version: u64,
    pub min_desktop_version: String,
}

/// `POST /auth/device-token`'s reply: the token, and who it signs in.
#[derive(Debug, Deserialize)]
pub struct DeviceToken {
    pub token: String,
    pub user: SignedInUser,
}

#[derive(Debug, Deserialize)]
pub struct SignedInUser {
    pub username: String,
}

pub struct ServerApi {
    /// `<server>/api/v1`
    base: String,
    token: Option<String>,
    /// IANA; without one the server dates sessions in the account's zone.
    zone: Option<String>,
    agent: ureq::Agent,
    /// For the event stream: no limit on the whole response, only on silence.
    stream_agent: ureq::Agent,
}

impl ServerApi {
    /// `url` is the server's address (the web app's), with no trailing slash.
    pub fn new(url: &str, token: Option<String>, zone: Option<String>, timeouts: Timeouts) -> Self {
        Self {
            base: format!("{}/api/v1", url),
            token,
            zone,
            agent: ureq::AgentBuilder::new()
                .timeout_connect(timeouts.connect)
                .timeout(timeouts.request)
                .build(),
            stream_agent: ureq::AgentBuilder::new()
                .timeout_connect(timeouts.connect)
                .timeout_read(timeouts.stream_read)
                .build(),
        }
    }

    fn request(&self, agent: &ureq::Agent, method: &str, path: &str) -> ureq::Request {
        let mut request = agent.request(method, &format!("{}{}", self.base, path));
        if let Some(token) = &self.token {
            request = request.set("Authorization", &format!("Bearer {}", token));
        }
        if let Some(zone) = &self.zone {
            request = request.set(TIME_ZONE_HEADER, zone);
        }
        request
    }

    /// Runs a core command: its reply, or why there isn't one.
    pub fn command(&self, name: &str, args: &Value) -> Result<Value, ApiError> {
        reply(
            self.request(&self.agent, "POST", &format!("/commands/{}", name))
                .send_json(args),
        )
    }

    pub fn meta(&self) -> Result<Meta, ApiError> {
        reply(self.request(&self.agent, "GET", "/meta").call())
    }

    /// Signs this device in: a `full` token named `device_name`.
    pub fn device_token(
        &self,
        username: &str,
        password: &str,
        device_name: &str,
    ) -> Result<DeviceToken, ApiError> {
        reply(
            self.request(&self.agent, "POST", "/auth/device-token")
                .send_json(json!({
                    "username": username,
                    "password": password,
                    "deviceName": device_name,
                })),
        )
    }

    /// Signs this device out: its token is revoked.
    pub fn sign_out(&self) -> Result<(), ApiError> {
        answer(
            self.request(&self.agent, "DELETE", "/auth/device-token")
                .call(),
        )
        .map(drop)
    }

    /// Opens the event stream.
    pub fn events(&self) -> Result<EventStream, ApiError> {
        answer(
            self.request(&self.stream_agent, "GET", "/events")
                .set("Accept", "text/event-stream")
                .call(),
        )
        .map(|response| EventStream::new(Box::new(BufReader::new(response.into_reader()))))
    }
}

/// The response, or why there isn't a usable one.
fn answer(result: Result<ureq::Response, ureq::Error>) -> Result<ureq::Response, ApiError> {
    match result {
        Ok(response) => Ok(response),
        Err(ureq::Error::Status(status, response)) => {
            let message = server_message(response)
                .unwrap_or_else(|| format!("the server answered HTTP {}", status));
            Err(match status {
                401 => ApiError::Unauthorized(message),
                _ => ApiError::Refused(message),
            })
        }
        Err(ureq::Error::Transport(transport)) => Err(ApiError::Unreachable(transport.to_string())),
    }
}

/// An error reply's message: `{ "error": "…", "code": "…" }`.
fn server_message(response: ureq::Response) -> Option<String> {
    let body: Value = response.into_json().ok()?;
    body.get("error")?.as_str().map(str::to_string)
}

/// A reply's JSON, read as `T`.
fn reply<T: DeserializeOwned>(result: Result<ureq::Response, ureq::Error>) -> Result<T, ApiError> {
    answer(result)?
        .into_json()
        .map_err(|e| ApiError::Unreachable(format!("the server's reply couldn't be read: {}", e)))
}

/// Server-sent events, each a name and its JSON data.
pub struct EventStream {
    lines: Box<dyn BufRead + Send>,
}

#[derive(Debug, PartialEq)]
pub struct StreamEvent {
    pub name: String,
    pub data: String,
}

impl EventStream {
    pub fn new(lines: Box<dyn BufRead + Send>) -> Self {
        Self { lines }
    }

    /// The next event; None once the server ends the stream. Comments (the
    /// keep-alive), fields other than `event` and `data`, and events without
    /// a name are skipped.
    pub fn next_event(&mut self) -> std::io::Result<Option<StreamEvent>> {
        let mut name = String::new();
        let mut data: Vec<String> = Vec::new();
        loop {
            let mut line = String::new();
            if self.lines.read_line(&mut line)? == 0 {
                return Ok(None);
            }
            let line = line.trim_end_matches(['\r', '\n']);
            if line.is_empty() {
                if !name.is_empty() {
                    let data = data.join("\n");
                    return Ok(Some(StreamEvent { name, data }));
                }
                data.clear();
                continue;
            }
            let (field, value) = line.split_once(':').unwrap_or((line, ""));
            let value = value.strip_prefix(' ').unwrap_or(value);
            match field {
                "event" => name = value.to_string(),
                "data" => data.push(value.to_string()),
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FakeServer, TEST_TIMEOUTS};
    use std::io::Cursor;
    use std::mem::discriminant;

    fn unreachable() -> ApiError {
        ApiError::Unreachable(String::new())
    }

    fn api(server: &FakeServer, token: Option<&str>, zone: Option<&str>) -> ServerApi {
        ServerApi::new(
            &server.url,
            token.map(str::to_string),
            zone.map(str::to_string),
            TEST_TIMEOUTS,
        )
    }

    #[test]
    fn requests_carry_the_token_and_the_zone() {
        let server = FakeServer::start();
        server.reply(
            "POST",
            "/api/v1/commands/start_task",
            200,
            json!({ "outcome": "started" }),
        );
        let signed_in = api(&server, Some("tmk_1"), Some("Europe/Berlin"));
        let args = json!({ "taskId": "a", "taskName": "Writing" });
        assert_eq!(
            signed_in.command("start_task", &args),
            Ok(json!({ "outcome": "started" }))
        );
        let seen = server.seen_at("/api/v1/commands/start_task").remove(0);
        assert_eq!(seen.method, "POST");
        assert_eq!(seen.json(), args);
        assert_eq!(seen.headers["authorization"], "Bearer tmk_1");
        assert_eq!(seen.headers["x-taskmint-tz"], "Europe/Berlin");

        // Signing in has no token yet, and a zone may be unknown
        api(&server, None, None).meta().unwrap();
        let seen = server.seen_at("/api/v1/meta").remove(0);
        assert!(!seen.headers.contains_key("authorization"));
        assert!(!seen.headers.contains_key("x-taskmint-tz"));
    }

    #[test]
    fn failures_say_what_went_wrong() {
        let server = FakeServer::start();
        let api = api(&server, Some("tmk_1"), None);
        let path = "/api/v1/commands/get_sessions";
        server.reply(
            "POST",
            path,
            400,
            json!({ "error": "Session not found", "code": "rejected" }),
        );
        assert_eq!(
            api.command("get_sessions", &json!({})),
            Err(ApiError::Refused("Session not found".to_string()))
        );
        server.reply(
            "POST",
            path,
            401,
            json!({ "error": "sign in first", "code": "unauthenticated" }),
        );
        assert_eq!(
            api.command("get_sessions", &json!({})),
            Err(ApiError::Unauthorized("sign in first".to_string()))
        );
        // Something other than the API answered
        server.reply_text("POST", path, 502, "<html>Bad Gateway</html>");
        assert_eq!(
            api.command("get_sessions", &json!({})),
            Err(ApiError::Refused(
                "the server answered HTTP 502".to_string()
            ))
        );
        server.reply(
            "POST",
            path,
            500,
            json!({ "message": "not the API's shape" }),
        );
        assert_eq!(
            api.command("get_sessions", &json!({})),
            Err(ApiError::Refused(
                "the server answered HTTP 500".to_string()
            ))
        );
        server.reply_text("POST", path, 200, "<html>a captive portal</html>");
        let unreadable = api.command("get_sessions", &json!({})).unwrap_err();
        assert!(unreadable
            .into_detail()
            .starts_with("the server's reply couldn't be read: "),);

        // Nothing listening
        let closed = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap()
        };
        let nowhere = ServerApi::new(&format!("http://{}", closed), None, None, TEST_TIMEOUTS);
        assert_eq!(
            discriminant(&nowhere.meta().unwrap_err()),
            discriminant(&unreachable())
        );
        // A path the server doesn't have
        assert_eq!(
            api.command("launch", &json!({})),
            Err(ApiError::Refused("no reply set".to_string()))
        );
    }

    #[test]
    fn signing_in_and_out() {
        let server = FakeServer::start();
        server.reply(
            "POST",
            "/api/v1/auth/device-token",
            201,
            json!({ "id": "t1", "token": "tmk_new", "user": { "id": "u1", "username": "bea" } }),
        );
        server.reply("DELETE", "/api/v1/auth/device-token", 204, json!(null));
        let signed_in = api(&server, None, None)
            .device_token("Bea", "secret", "TaskMint on Test")
            .unwrap();
        assert_eq!(signed_in.token, "tmk_new");
        assert_eq!(signed_in.user.username, "bea");
        assert_eq!(
            server.seen_at("/api/v1/auth/device-token")[0].json(),
            json!({ "username": "Bea", "password": "secret", "deviceName": "TaskMint on Test" })
        );
        assert_eq!(api(&server, Some("tmk_new"), None).sign_out(), Ok(()));
        assert_eq!(
            server.seen_at("/api/v1/auth/device-token")[1].method,
            "DELETE"
        );

        let meta = api(&server, None, None).meta().unwrap();
        assert_eq!(
            (
                meta.version.as_str(),
                meta.api_version,
                meta.min_desktop_version.as_str()
            ),
            ("1.0.0", 1, "1.0.0")
        );
    }

    #[test]
    fn the_event_stream_opens_with_the_token() {
        let server = FakeServer::start();
        let mut stream = api(&server, Some("tmk_1"), None).events().unwrap();
        server.wait_for_streams(1);
        assert_eq!(
            server.seen_at("/api/v1/events")[0].headers["accept"],
            "text/event-stream"
        );
        server.send("sessions-changed", json!(null));
        assert_eq!(
            stream.next_event().unwrap(),
            Some(StreamEvent {
                name: "sessions-changed".to_string(),
                data: "null".to_string()
            })
        );
        server.end_streams();
        assert_eq!(stream.next_event().unwrap(), None);

        server.reply(
            "GET",
            "/api/v1/events",
            401,
            json!({ "error": "sign in first" }),
        );
        assert_eq!(
            api(&server, Some("tmk_revoked"), None).events().err(),
            Some(ApiError::Unauthorized("sign in first".to_string()))
        );
    }

    #[test]
    fn server_sent_events_are_read_as_the_spec_says() {
        let text = ": keep-alive\n\n\
                    event: app-records-changed\r\n\
                    data: {\"key\":\"tasks\",\r\n\
                    data:\"revision\":2}\r\n\
                    id: 7\n\
                    \n\
                    data: an event without a name\n\
                    \n\
                    event: resync\n\
                    data\n\
                    \n\
                    event: cut-off";
        let mut stream = EventStream::new(Box::new(Cursor::new(text.as_bytes().to_vec())));
        assert_eq!(
            stream.next_event().unwrap(),
            Some(StreamEvent {
                name: "app-records-changed".to_string(),
                data: "{\"key\":\"tasks\",\n\"revision\":2}".to_string()
            })
        );
        assert_eq!(
            stream.next_event().unwrap(),
            Some(StreamEvent {
                name: "resync".to_string(),
                data: String::new()
            })
        );
        assert_eq!(stream.next_event().unwrap(), None);
    }

    #[test]
    fn every_error_has_its_detail() {
        for error in [
            ApiError::Unreachable("a".to_string()),
            ApiError::Unauthorized("a".to_string()),
            ApiError::Refused("a".to_string()),
        ] {
            assert_eq!(error.into_detail(), "a");
        }
    }
}
