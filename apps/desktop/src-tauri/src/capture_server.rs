// Browser-extension capture channels: a localhost HTTP server (primary — the
// extension gets a real delivery confirmation) and taskmint:// deep links
// (fired when the app is closed; the OS launches the bundled app and the URL
// carries the gzip-compressed payload).
//
// Both channels feed accept_capture_payload: the backend keeps the raw
// payload (latest wins) and a `work-log-payload-captured` event tells the
// frontend to fetch it via take_pending_work_log_capture. The event carries
// only the timestamp so a payload arriving before the frontend mounts shares
// the same take-on-mount code path.
//
// The server runs sync tiny_http on a thread of its own; this codebase uses no
// async runtime for background work.

use std::io::Read;
use std::net::SocketAddr;
use std::sync::Arc;
use std::thread::JoinHandle;

use base64::Engine;
use serde_json::json;
use tiny_http::{Header, Method, Request, Response, Server};

use crate::state::AppState;
use taskmint_core::capture::{is_extension_origin, origin_allowed};
use taskmint_core::contract::{
    CAPTURE_HEADER, CAPTURE_PATH, CAPTURE_SERVER_PORT, DEEP_LINK_CAPTURE_PENDING,
    DEEP_LINK_IMPORT_WORKLOGS, DEEP_LINK_PAYLOAD_PARAM, DEEP_LINK_SCHEME,
    ERR_UNEXPECTED_PAYLOAD_SHAPE, HEALTH_PATH, MAX_CAPTURE_BODY_BYTES as MAX_BODY_BYTES,
    MAX_ENCODED_LINK_BYTES,
};
use taskmint_core::model::CaptureSource;

// ============================================================================
// PURE PARSING (unit-tested; the origin and shape checks are in
// taskmint_core::capture)
// ============================================================================

/// tiny_http's request.url() is path + query; route on the path only.
pub fn split_path(url: &str) -> &str {
    url.split('?').next().unwrap_or(url)
}

/// Decode a deep-link payload: base64url (padding tolerated) → gzip → UTF-8,
/// with size caps at both layers.
pub fn decode_protocol_payload(encoded: &str) -> Result<String, String> {
    let encoded = encoded.trim().trim_end_matches('=');
    if encoded.len() > MAX_ENCODED_LINK_BYTES {
        return Err("encoded payload too large".to_string());
    }
    let compressed = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|e| format!("invalid base64url payload: {}", e))?;

    let mut text = String::new();
    flate2::read::GzDecoder::new(&compressed[..])
        .take((MAX_BODY_BYTES + 1) as u64)
        .read_to_string(&mut text)
        .map_err(|e| format!("invalid gzip payload: {}", e))?;
    if text.len() > MAX_BODY_BYTES {
        return Err("decompressed payload too large".to_string());
    }
    Ok(text)
}

/// Recognized taskmint:// links.
#[derive(Debug, Clone, PartialEq)]
pub enum DeepLinkAction {
    /// taskmint://import-worklogs?v=1&d=<base64url(gzip(json))>
    ImportPayload(String),
    /// taskmint://capture-pending — launch/focus only; the extension delivers
    /// the payload over localhost once the app is up.
    CapturePending,
}

pub fn parse_deep_link(url_str: &str) -> Option<DeepLinkAction> {
    let url = url::Url::parse(url_str).ok()?;
    if url.scheme() != DEEP_LINK_SCHEME {
        return None;
    }
    // The action may surface as the host (taskmint://import-worklogs) or the
    // first path segment (taskmint:///import-worklogs), depending on how the
    // OS normalized the URL.
    let action = url
        .host_str()
        .map(str::to_string)
        .filter(|host| !host.is_empty())
        .or_else(|| {
            url.path()
                .trim_start_matches('/')
                .split('/')
                .next()
                .filter(|segment| !segment.is_empty())
                .map(str::to_string)
        })?;

    match action.as_str() {
        DEEP_LINK_IMPORT_WORKLOGS => url
            .query_pairs()
            .find(|(key, _)| key == DEEP_LINK_PAYLOAD_PARAM)
            .map(|(_, value)| DeepLinkAction::ImportPayload(value.into_owned())),
        DEEP_LINK_CAPTURE_PENDING => Some(DeepLinkAction::CapturePending),
        _ => None,
    }
}

// ============================================================================
// SHARED ACCEPTANCE PATH (HTTP + deep links)
// ============================================================================

/// Keep a captured payload for the frontend (latest wins); the backend
/// announces it with `work-log-payload-captured`, and the frontend also
/// takes a pending capture when it mounts.
pub fn accept_capture_payload(
    state: &AppState,
    body: String,
    source: CaptureSource,
) -> Result<(), String> {
    state
        .backend
        .call(
            "accept_capture",
            json!({ "payload": body, "source": source }),
        )
        .map(|_| ())
}

/// Process taskmint:// URLs from a cold start (get_current) or a runtime open
/// (on_open_url / forwarded argv).
pub fn handle_deep_link_urls(state: &AppState, urls: &[String]) {
    let mut recognized = false;
    for url in urls {
        match parse_deep_link(url) {
            Some(DeepLinkAction::ImportPayload(encoded)) => {
                recognized = true;
                let result = decode_protocol_payload(&encoded)
                    .and_then(|body| accept_capture_payload(state, body, CaptureSource::Link));
                if let Err(e) = result {
                    log::warn!("Ignoring taskmint:// import link: {}", e);
                }
            }
            Some(DeepLinkAction::CapturePending) => recognized = true,
            None => {}
        }
    }
    if recognized {
        state.platform.show_main_window();
    }
}

// ============================================================================
// LOCALHOST HTTP SERVER
// ============================================================================

/// The capture server, answering on its own thread until dropped.
pub struct CaptureServer {
    server: Arc<Server>,
    thread: Option<JoinHandle<()>>,
}

impl CaptureServer {
    /// Starts it on `address` (127.0.0.1:CAPTURE_SERVER_PORT in the app). On
    /// failure the status says why, for the Payouts page; the app runs on
    /// without it.
    pub fn start(state: &AppState, address: SocketAddr) -> Option<CaptureServer> {
        let server = match Server::http(address) {
            Ok(server) => Arc::new(server),
            Err(e) => {
                let warning = format!(
                    "Browser capture server could not start on {}: {}. \
                     Another TaskMint instance may already be running; browser \
                     captures will be delivered to that instance instead.",
                    address, e
                );
                log::warn!("{}", warning);
                state.with_capture_server_status_mut(|status| {
                    status.running = false;
                    status.warning = Some(warning);
                });
                return None;
            }
        };
        state.with_capture_server_status_mut(|status| {
            status.running = true;
            status.warning = None;
        });
        let serving = server.clone();
        let state = state.clone();
        let thread = std::thread::spawn(move || {
            for request in serving.incoming_requests() {
                handle_request(&state, request);
            }
        });
        Some(CaptureServer {
            server,
            thread: Some(thread),
        })
    }

    pub fn port(&self) -> u16 {
        self.server
            .server_addr()
            .to_ip()
            .map(|address| address.port())
            .unwrap_or_default()
    }
}

impl Drop for CaptureServer {
    fn drop(&mut self) {
        self.server.unblock();
        let _ = self.thread.take().map(JoinHandle::join);
    }
}

/// The address the app's capture server listens on.
pub fn default_address() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], CAPTURE_SERVER_PORT))
}

fn header(field: &str, value: &str) -> Header {
    Header::from_bytes(field.as_bytes(), value.as_bytes())
        .expect("header names and values are ASCII")
}

/// Respond with a JSON body, echoing the CORS allow-origin for extension
/// callers. tiny_http's respond consumes the request.
fn respond_json(request: Request, status: u16, body: serde_json::Value, cors_origin: Option<&str>) {
    let mut response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json"));
    if let Some(origin) = cors_origin {
        response = response.with_header(header("Access-Control-Allow-Origin", origin));
    }
    let _ = request.respond(response);
}

fn respond_preflight(request: Request, origin: &str) {
    let response = Response::empty(204)
        .with_header(header("Access-Control-Allow-Origin", origin))
        .with_header(header("Access-Control-Allow-Methods", "POST, OPTIONS"))
        .with_header(header(
            "Access-Control-Allow-Headers",
            "content-type, x-taskmint-capture",
        ))
        .with_header(header("Access-Control-Max-Age", "600"));
    let _ = request.respond(response);
}

/// A capture POST's body, or the status and error it gets instead.
fn read_body(request: &mut Request) -> Result<String, (u16, &'static str)> {
    if request
        .body_length()
        .is_some_and(|len| len > MAX_BODY_BYTES)
    {
        return Err((413, "payload too large"));
    }
    let mut body = String::new();
    request
        .as_reader()
        .take((MAX_BODY_BYTES + 1) as u64)
        .read_to_string(&mut body)
        .map_err(|_| (400, "unreadable body"))?;
    if body.len() > MAX_BODY_BYTES {
        return Err((413, "payload too large"));
    }
    Ok(body)
}

fn handle_request(state: &AppState, mut request: Request) {
    let path = split_path(request.url()).to_string();
    let method = request.method().clone();
    // Copy header values out before the body read borrows the request mutably.
    let origin = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Origin"))
        .map(|h| h.value.as_str().to_string());
    let has_capture_marker = request
        .headers()
        .iter()
        .any(|h| h.field.equiv(CAPTURE_HEADER));
    let origin_ref = origin.as_deref();
    let cors = is_extension_origin(origin_ref)
        .then(|| origin.clone())
        .flatten();
    let forbidden = || json!({ "error": "forbidden origin" });

    match (method, path.as_str()) {
        (Method::Options, CAPTURE_PATH) => match &cors {
            // Only extension preflights succeed; a cross-origin web page's
            // JSON POST dies here.
            Some(origin) => respond_preflight(request, origin),
            None => respond_json(request, 403, forbidden(), None),
        },
        (Method::Post, CAPTURE_PATH) => {
            if !origin_allowed(origin_ref) {
                return respond_json(request, 403, forbidden(), None);
            }
            // Browsers cannot attach this header without a preflight we
            // refuse for non-extension origins — blocks forged no-cors POSTs.
            if !has_capture_marker {
                let error = json!({ "error": "missing capture header" });
                return respond_json(request, 403, error, cors.as_deref());
            }
            let outcome = read_body(&mut request).and_then(|body| {
                accept_capture_payload(state, body, CaptureSource::Extension)
                    .map_err(|_| (400, ERR_UNEXPECTED_PAYLOAD_SHAPE))
            });
            match outcome {
                Ok(()) => respond_json(
                    request,
                    200,
                    json!({ "status": "accepted" }),
                    cors.as_deref(),
                ),
                Err((status, error)) => {
                    respond_json(request, status, json!({ "error": error }), cors.as_deref())
                }
            }
        }
        (Method::Get, HEALTH_PATH) => {
            let health = json!({ "app": "TaskMint", "version": state.platform.app_version() });
            respond_json(request, 200, health, None);
        }
        _ => respond_json(request, 404, json!({ "error": "not found" }), None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn gzip_base64url(text: &str) -> String {
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(text.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(compressed)
    }

    // ---- path --------------------------------------------------------------

    #[test]
    fn split_path_drops_the_query() {
        assert_eq!(
            split_path("/api/work-log-payload?a=1&b=2"),
            "/api/work-log-payload"
        );
        assert_eq!(split_path("/api/health"), "/api/health");
        assert_eq!(split_path("/"), "/");
    }

    // ---- protocol payload decoding ----------------------------------------

    #[test]
    fn decode_protocol_payload_round_trips() {
        let original = r#"{"workLogs":[],"timedWorkEntries":[{"id":"e1"}]}"#;
        let encoded = gzip_base64url(original);
        assert_eq!(decode_protocol_payload(&encoded).unwrap(), original);
        // Padded base64 (an encoder that keeps '=') is tolerated.
        let padded = format!("{}==", encoded);
        assert_eq!(decode_protocol_payload(&padded).unwrap(), original);
    }

    #[test]
    fn a_link_that_unpacks_too_big_is_refused() {
        let huge = "a".repeat(MAX_BODY_BYTES + 1);
        assert_eq!(
            decode_protocol_payload(&gzip_base64url(&huge)),
            Err("decompressed payload too large".to_string())
        );
    }

    #[test]
    fn decode_protocol_payload_rejects_bad_input() {
        assert!(decode_protocol_payload("!!! not base64 !!!")
            .unwrap_err()
            .contains("base64"));
        // Valid base64url of bytes that are not gzip.
        let not_gzip = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b"hello");
        assert!(decode_protocol_payload(&not_gzip)
            .unwrap_err()
            .contains("gzip"));
        // Oversize encoded input is refused before decoding.
        let oversize = "A".repeat(MAX_ENCODED_LINK_BYTES + 1);
        assert!(decode_protocol_payload(&oversize)
            .unwrap_err()
            .contains("too large"));
        // Non-UTF-8 decompressed bytes are refused by read_to_string.
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&[0xff, 0xfe, 0xfd]).unwrap();
        let bad_utf8 =
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(encoder.finish().unwrap());
        assert!(decode_protocol_payload(&bad_utf8).is_err());
    }

    // ---- deep-link parsing -------------------------------------------------

    #[test]
    fn parse_deep_link_recognizes_import_and_pending_forms() {
        assert_eq!(
            parse_deep_link("taskmint://import-worklogs?v=1&d=abc123"),
            Some(DeepLinkAction::ImportPayload("abc123".to_string()))
        );
        assert_eq!(
            parse_deep_link("taskmint:///import-worklogs?d=xyz"),
            Some(DeepLinkAction::ImportPayload("xyz".to_string()))
        );
        assert_eq!(
            parse_deep_link("taskmint://capture-pending"),
            Some(DeepLinkAction::CapturePending)
        );
    }

    #[test]
    fn parse_deep_link_rejects_foreign_and_malformed_urls() {
        assert_eq!(parse_deep_link("https://import-worklogs?d=abc"), None);
        assert_eq!(parse_deep_link("taskmint://unknown-action"), None);
        assert_eq!(parse_deep_link("taskmint://import-worklogs"), None); // no d param
        assert_eq!(parse_deep_link("not a url"), None);
        // Neither a host nor a path names an action
        assert_eq!(parse_deep_link("taskmint:"), None);
    }

    // ---- deep links --------------------------------------------------------

    fn pending(f: &crate::testing::Fixture) -> Option<serde_json::Value> {
        let taken = f
            .state
            .backend
            .call("take_pending_work_log_capture", serde_json::Value::Null)
            .unwrap();
        (!taken.is_null()).then_some(taken)
    }

    #[test]
    fn an_import_link_is_kept_for_the_app_and_brings_it_forward() {
        let f = crate::testing::fixture();
        let link = format!(
            "taskmint://import-worklogs?v=1&d={}",
            gzip_base64url(r#"{"workLogs":[]}"#)
        );
        handle_deep_link_urls(&f.state, &[link]);

        let capture = pending(&f).unwrap();
        assert_eq!(capture["source"], "link");
        assert_eq!(capture["payload"], r#"{"workLogs":[]}"#);
        assert_eq!(f.platform.recorded().windows_shown, 1);
    }

    #[test]
    fn links_that_arent_captures_are_ignored_and_bad_ones_logged() {
        let f = crate::testing::fixture();
        handle_deep_link_urls(&f.state, &["https://example.com".to_string()]);
        assert_eq!(f.platform.recorded().windows_shown, 0);

        let unreadable = "taskmint://import-worklogs?d=!!!".to_string();
        let pending_only = "taskmint://capture-pending".to_string();
        handle_deep_link_urls(&f.state, &[unreadable, pending_only]);
        assert!(pending(&f).is_none());
        assert_eq!(f.platform.recorded().windows_shown, 1);
    }

    // ---- the localhost server ----------------------------------------------

    struct Running {
        f: crate::testing::Fixture,
        server: CaptureServer,
    }

    fn serve() -> Running {
        let f = crate::testing::fixture();
        let server = CaptureServer::start(&f.state, "127.0.0.1:0".parse().unwrap()).unwrap();
        Running { f, server }
    }

    /// Sends `request` (headers and body) and returns the status line's code,
    /// the response's headers, and its body.
    fn send(port: u16, request: &[u8]) -> (u16, String, String) {
        use std::io::Read as _;
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request).unwrap();
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        let (head, body) = response.split_once("\r\n\r\n").unwrap_or((&response, ""));
        let status = head[9..12].parse().unwrap();
        (status, head.to_string(), body.to_string())
    }

    fn post(port: u16, headers: &str, body: &str) -> (u16, String, String) {
        let request = format!(
            "POST {} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n{}Content-Length: {}\r\n\r\n{}",
            CAPTURE_PATH,
            headers,
            body.len(),
            body
        );
        send(port, request.as_bytes())
    }

    fn extension() -> String {
        format!(
            "Origin: {}\r\nX-TaskMint-Capture: 1\r\n",
            taskmint_core::contract::CAPTURE_EXTENSION_ORIGIN
        )
    }

    #[test]
    fn the_extensions_capture_is_accepted() {
        let running = serve();
        assert!(running.f.state.with_capture_server_status(|s| s.running));

        let (status, head, body) = post(running.server.port(), &extension(), r#"{"workLogs":[]}"#);

        assert_eq!((status, body.as_str()), (200, r#"{"status":"accepted"}"#));
        assert!(head.contains("Access-Control-Allow-Origin: chrome-extension://"));
        assert_eq!(pending(&running.f).unwrap()["source"], "extension");
    }

    #[test]
    fn a_native_caller_without_an_origin_is_accepted_too() {
        let running = serve();
        let (status, head, _) = post(
            running.server.port(),
            "X-TaskMint-Capture: 1\r\n",
            r#"{"workLogs":[]}"#,
        );
        assert_eq!(status, 200);
        assert!(!head.contains("Access-Control-Allow-Origin"));
    }

    #[test]
    fn web_pages_and_other_extensions_are_refused() {
        let running = serve();
        let port = running.server.port();
        let page = "Origin: https://evil.example\r\nX-TaskMint-Capture: 1\r\n";
        assert_eq!(post(port, page, "{}").2, r#"{"error":"forbidden origin"}"#);
        // Without the header a page can't send without a preflight
        let (status, _, body) = post(port, "", r#"{"workLogs":[]}"#);
        assert_eq!(
            (status, body.as_str()),
            (403, r#"{"error":"missing capture header"}"#)
        );
        assert!(pending(&running.f).is_none());
    }

    #[test]
    fn only_the_extensions_preflight_passes() {
        let running = serve();
        let port = running.server.port();
        let preflight = |origin: &str| {
            let request = format!(
                "OPTIONS {} HTTP/1.1\r\nHost: x\r\nConnection: close\r\nOrigin: {}\r\n\r\n",
                CAPTURE_PATH, origin
            );
            send(port, request.as_bytes())
        };
        let (status, head, _) = preflight(taskmint_core::contract::CAPTURE_EXTENSION_ORIGIN);
        assert_eq!(status, 204);
        assert!(head.contains("Access-Control-Allow-Headers: content-type, x-taskmint-capture"));
        assert_eq!(preflight("https://evil.example").0, 403);
    }

    #[test]
    fn bodies_that_are_too_big_unreadable_or_not_work_logs_are_refused() {
        let running = serve();
        let port = running.server.port();
        let (status, _, body) = post(port, &extension(), "[]");
        assert_eq!(
            (status, body.as_str()),
            (400, r#"{"error":"unexpected payload shape"}"#)
        );

        // Declared too big: refused before reading
        let declared = format!(
            "POST {} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n{}Content-Length: {}\r\n\r\n",
            CAPTURE_PATH,
            extension(),
            MAX_BODY_BYTES + 1
        );
        assert_eq!(send(port, declared.as_bytes()).0, 413);

        // Too big without saying so (chunked)
        let mut chunked = format!(
            "POST {} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n{}Transfer-Encoding: chunked\r\n\r\n",
            CAPTURE_PATH,
            extension()
        )
        .into_bytes();
        let chunk = vec![b'a'; MAX_BODY_BYTES + 1];
        chunked.extend(format!("{:x}\r\n", chunk.len()).into_bytes());
        chunked.extend(&chunk);
        chunked.extend(b"\r\n0\r\n\r\n");
        assert_eq!(send(port, &chunked).0, 413);

        // Not UTF-8
        let mut binary = format!(
            "POST {} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n{}Content-Length: 2\r\n\r\n",
            CAPTURE_PATH,
            extension()
        )
        .into_bytes();
        binary.extend([0xff, 0xfe]);
        assert_eq!(send(port, &binary).2, r#"{"error":"unreadable body"}"#);
    }

    #[test]
    fn it_answers_the_health_check_and_nothing_else() {
        let running = serve();
        let port = running.server.port();
        let get = |path: &str| {
            let request = format!(
                "GET {} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
                path
            );
            send(port, request.as_bytes())
        };
        assert_eq!(
            get(HEALTH_PATH).2,
            r#"{"app":"TaskMint","version":"1.2.3"}"#
        );
        assert_eq!(get("/elsewhere").0, 404);
    }

    #[test]
    fn a_port_in_use_leaves_a_warning_for_the_payouts_page() {
        let f = crate::testing::fixture();
        let taken = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = taken.local_addr().unwrap();

        assert!(CaptureServer::start(&f.state, address).is_none());

        let status = f.state.with_capture_server_status(|s| s.clone());
        assert!(!status.running);
        assert!(status
            .warning
            .unwrap()
            .contains("Another TaskMint instance may already be running"));
        assert_eq!(default_address().port(), CAPTURE_SERVER_PORT);
    }
}
