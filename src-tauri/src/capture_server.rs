// Browser-extension capture channels: a localhost HTTP server (primary — the
// extension gets a real delivery confirmation) and taskmint:// deep links
// (fired when the app is closed; the OS launches the bundled app and the URL
// carries the gzip-compressed payload).
//
// Both channels feed accept_capture_payload: the raw payload is stored in
// AppState (latest wins) and a `work-log-payload-captured` event tells the
// frontend to fetch it via take_pending_work_log_capture. The event carries
// only the timestamp so a payload arriving before the frontend mounts shares
// the same take-on-mount code path.
//
// The server runs sync tiny_http on a dedicated thread, like the tray update
// timer (tray::start_tray_update_timer) — this codebase does not use an async
// runtime for background work.

use std::io::Read;

use base64::Engine;
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::state::AppState;
use crate::types::PendingCapture;

pub const CAPTURE_SERVER_PORT: u16 = 43117;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
// Deep-link payloads ride in a URL, bounded by Windows' ~32K command-line
// limit; the extension enforces the same ceiling before firing the link.
const MAX_ENCODED_LINK_BYTES: usize = 64 * 1024;

// ============================================================================
// PURE VALIDATION (unit-tested)
// ============================================================================

/// A POST without an Origin header comes from a native tool (curl, scripts) —
/// allowed for local testing. Browser requests always carry Origin, and only
/// extension origins are accepted.
pub fn origin_allowed(origin: Option<&str>) -> bool {
    match origin {
        None => true,
        Some(origin) => origin.starts_with("chrome-extension://"),
    }
}

/// Whether CORS response headers should be echoed (extension callers only).
pub fn is_extension_origin(origin: Option<&str>) -> bool {
    origin.is_some_and(|o| o.starts_with("chrome-extension://"))
}

/// Light shape check — full validation happens in the frontend pipeline. A
/// valid capture is a JSON object with workLogs and/or timedWorkEntries
/// arrays (the site's payload shape).
pub fn payload_shape_ok(body: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(body) {
        Ok(serde_json::Value::Object(map)) => {
            map.get("workLogs").is_some_and(|v| v.is_array())
                || map.get("timedWorkEntries").is_some_and(|v| v.is_array())
        }
        _ => false,
    }
}

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
    if url.scheme() != "taskmint" {
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
        "import-worklogs" => url
            .query_pairs()
            .find(|(key, _)| key == "d")
            .map(|(_, value)| DeepLinkAction::ImportPayload(value.into_owned())),
        "capture-pending" => Some(DeepLinkAction::CapturePending),
        _ => None,
    }
}

// ============================================================================
// SHARED ACCEPTANCE PATH (HTTP + deep links)
// ============================================================================

/// Store a captured payload (latest wins) and notify the frontend.
pub fn accept_capture_payload(
    app: &AppHandle,
    state: &AppState,
    body: String,
) -> Result<(), String> {
    if !payload_shape_ok(&body) {
        return Err("unexpected payload shape".to_string());
    }
    let received_at = chrono::Utc::now().to_rfc3339();
    state.with_pending_work_log_capture_mut(|slot| {
        *slot = Some(PendingCapture {
            payload: body,
            received_at: received_at.clone(),
        });
    })?;
    // Non-fatal, like the other backend emits: the frontend also takes the
    // pending capture on mount.
    let _ = app.emit(
        "work-log-payload-captured",
        serde_json::json!({ "receivedAt": received_at }),
    );
    Ok(())
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Process taskmint:// URLs from a cold start (get_current) or a runtime open
/// (on_open_url / forwarded argv).
pub fn handle_deep_link_urls(app: &AppHandle, state: &AppState, urls: &[String]) {
    let mut recognized = false;
    for url in urls {
        match parse_deep_link(url) {
            Some(DeepLinkAction::ImportPayload(encoded)) => {
                recognized = true;
                let result = decode_protocol_payload(&encoded)
                    .and_then(|body| accept_capture_payload(app, state, body));
                if let Err(e) = result {
                    log::warn!("Ignoring taskmint:// import link: {}", e);
                }
            }
            Some(DeepLinkAction::CapturePending) => {
                recognized = true;
            }
            None => {}
        }
    }
    if recognized {
        focus_main_window(app);
    }
}

// ============================================================================
// LOCALHOST HTTP SERVER
// ============================================================================

pub fn start_capture_server(app: &AppHandle, state: &AppState) {
    let app = app.clone();
    let state = state.clone();
    std::thread::spawn(move || {
        let server = match Server::http(("127.0.0.1", CAPTURE_SERVER_PORT)) {
            Ok(server) => server,
            Err(e) => {
                let warning = format!(
                    "Browser capture server could not start on 127.0.0.1:{}: {}. \
                     Another TaskMint instance may already be running; browser \
                     captures will be delivered to that instance instead.",
                    CAPTURE_SERVER_PORT, e
                );
                log::warn!("{}", warning);
                let _ = state.with_capture_server_status_mut(|status| {
                    status.running = false;
                    status.warning = Some(warning);
                });
                return; // never crash the app over the capture server
            }
        };

        let _ = state.with_capture_server_status_mut(|status| {
            status.running = true;
            status.warning = None;
        });

        for request in server.incoming_requests() {
            handle_request(&app, &state, request);
        }
    });
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
        .expect("static content-type header is valid")
}

/// Respond with a JSON body, echoing the CORS allow-origin for extension
/// callers. tiny_http's respond consumes the request.
fn respond_json(request: Request, status: u16, body: &str, cors_origin: Option<&str>) {
    let mut response = Response::from_string(body)
        .with_status_code(status)
        .with_header(json_header());
    if let Some(origin) = cors_origin {
        if let Ok(header) =
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], origin.as_bytes())
        {
            response = response.with_header(header);
        }
    }
    let _ = request.respond(response);
}

fn respond_preflight(request: Request, origin: &str) {
    let mut response = Response::empty(204);
    for (field, value) in [
        ("Access-Control-Allow-Origin", origin),
        ("Access-Control-Allow-Methods", "POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "content-type, x-taskmint-capture"),
        ("Access-Control-Max-Age", "600"),
    ] {
        if let Ok(header) = Header::from_bytes(field.as_bytes(), value.as_bytes()) {
            response = response.with_header(header);
        }
    }
    let _ = request.respond(response);
}

fn handle_request(app: &AppHandle, state: &AppState, mut request: Request) {
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
        .any(|h| h.field.equiv("X-TaskMint-Capture"));
    let origin_ref = origin.as_deref();
    let cors = if is_extension_origin(origin_ref) {
        origin.clone()
    } else {
        None
    };

    match (method, path.as_str()) {
        (Method::Options, "/api/work-log-payload") => {
            match &cors {
                // Only extension preflights succeed; a cross-origin web
                // page's JSON POST dies here.
                Some(origin) => respond_preflight(request, origin),
                None => respond_json(request, 403, r#"{"error":"forbidden origin"}"#, None),
            }
        }
        (Method::Post, "/api/work-log-payload") => {
            if !origin_allowed(origin_ref) {
                respond_json(request, 403, r#"{"error":"forbidden origin"}"#, None);
                return;
            }
            // Browsers cannot attach this header without a preflight we
            // refuse for non-extension origins — blocks forged no-cors POSTs.
            if !has_capture_marker {
                respond_json(
                    request,
                    403,
                    r#"{"error":"missing capture header"}"#,
                    cors.as_deref(),
                );
                return;
            }
            if request.body_length().is_some_and(|len| len > MAX_BODY_BYTES) {
                respond_json(request, 413, r#"{"error":"payload too large"}"#, cors.as_deref());
                return;
            }
            let mut body = String::new();
            let read_ok = request
                .as_reader()
                .take((MAX_BODY_BYTES + 1) as u64)
                .read_to_string(&mut body)
                .is_ok();
            if !read_ok {
                respond_json(request, 400, r#"{"error":"unreadable body"}"#, cors.as_deref());
                return;
            }
            if body.len() > MAX_BODY_BYTES {
                respond_json(request, 413, r#"{"error":"payload too large"}"#, cors.as_deref());
                return;
            }
            match accept_capture_payload(app, state, body) {
                Ok(()) => respond_json(request, 200, r#"{"status":"accepted"}"#, cors.as_deref()),
                Err(e) if e == "unexpected payload shape" => {
                    respond_json(
                        request,
                        400,
                        r#"{"error":"unexpected payload shape"}"#,
                        cors.as_deref(),
                    );
                }
                Err(_) => {
                    respond_json(request, 500, r#"{"error":"state unavailable"}"#, cors.as_deref());
                }
            }
        }
        (Method::Get, "/api/health") => {
            let body = format!(
                r#"{{"app":"TaskMint","version":"{}"}}"#,
                app.package_info().version
            );
            respond_json(request, 200, &body, None);
        }
        _ => respond_json(request, 404, r#"{"error":"not found"}"#, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn gzip_base64url(text: &str) -> String {
        let mut encoder =
            flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(text.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(compressed)
    }

    // ---- origin checks -----------------------------------------------------

    #[test]
    fn origin_allowed_permits_native_and_extension_callers_only() {
        assert!(origin_allowed(None));
        assert!(origin_allowed(Some("chrome-extension://abcdefghijklmnop")));
        assert!(!origin_allowed(Some("https://evil.example")));
        assert!(!origin_allowed(Some("http://127.0.0.1:1420")));
        assert!(!origin_allowed(Some("")));
        assert!(!origin_allowed(Some("null")));
    }

    #[test]
    fn is_extension_origin_requires_a_present_extension_origin() {
        assert!(!is_extension_origin(None));
        assert!(is_extension_origin(Some("chrome-extension://abc")));
        assert!(!is_extension_origin(Some("https://app.dataannotation.tech")));
    }

    // ---- shape + path ------------------------------------------------------

    #[test]
    fn payload_shape_requires_an_object_with_a_known_array() {
        assert!(payload_shape_ok(r#"{"workLogs":[]}"#));
        assert!(payload_shape_ok(r#"{"timedWorkEntries":[{"id":"x"}]}"#));
        assert!(payload_shape_ok(r#"{"workLogs":[],"timedWorkEntries":[]}"#));
        assert!(!payload_shape_ok(r#"{"workLogs":{}}"#));
        assert!(!payload_shape_ok(r#"{}"#));
        assert!(!payload_shape_ok(r#"[]"#));
        assert!(!payload_shape_ok(r#""text""#));
        assert!(!payload_shape_ok("not json"));
    }

    #[test]
    fn split_path_drops_the_query() {
        assert_eq!(split_path("/api/work-log-payload?a=1&b=2"), "/api/work-log-payload");
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
        let mut encoder =
            flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
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
    }

    // ---- pending-capture take semantics (plain state, no Tauri harness) ----

    #[test]
    fn pending_capture_is_taken_once_and_latest_wins() {
        let state = AppState::new();

        state
            .with_pending_work_log_capture_mut(|slot| {
                *slot = Some(PendingCapture {
                    payload: "first".to_string(),
                    received_at: "T1".to_string(),
                });
            })
            .unwrap();
        state
            .with_pending_work_log_capture_mut(|slot| {
                *slot = Some(PendingCapture {
                    payload: "second".to_string(),
                    received_at: "T2".to_string(),
                });
            })
            .unwrap();

        let taken = state
            .with_pending_work_log_capture_mut(|slot| slot.take())
            .unwrap();
        assert_eq!(taken.map(|c| c.payload), Some("second".to_string()));

        let second_take = state
            .with_pending_work_log_capture_mut(|slot| slot.take())
            .unwrap();
        assert!(second_take.is_none());
    }
}
