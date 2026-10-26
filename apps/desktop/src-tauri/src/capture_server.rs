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
// The server runs sync tiny_http on a dedicated thread, like the tray update
// timer (tray::start_tray_update_timer) — this codebase does not use an async
// runtime for background work.

use std::io::Read;

use base64::Engine;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::state::AppState;
use taskmint_core::capture::{is_extension_origin, origin_allowed};
use taskmint_core::command::{AcceptCaptureArgs, Command};
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
        .call(Command::AcceptCapture(AcceptCaptureArgs {
            payload: body,
            source,
        }))
        .map(|_| ())
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
                    .and_then(|body| accept_capture_payload(state, body, CaptureSource::Link));
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
        (
            "Access-Control-Allow-Headers",
            "content-type, x-taskmint-capture",
        ),
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
        .any(|h| h.field.equiv(CAPTURE_HEADER));
    let origin_ref = origin.as_deref();
    let cors = if is_extension_origin(origin_ref) {
        origin.clone()
    } else {
        None
    };

    match (method, path.as_str()) {
        (Method::Options, CAPTURE_PATH) => {
            match &cors {
                // Only extension preflights succeed; a cross-origin web
                // page's JSON POST dies here.
                Some(origin) => respond_preflight(request, origin),
                None => respond_json(request, 403, r#"{"error":"forbidden origin"}"#, None),
            }
        }
        (Method::Post, CAPTURE_PATH) => {
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
            if request
                .body_length()
                .is_some_and(|len| len > MAX_BODY_BYTES)
            {
                respond_json(
                    request,
                    413,
                    r#"{"error":"payload too large"}"#,
                    cors.as_deref(),
                );
                return;
            }
            let mut body = String::new();
            let read_ok = request
                .as_reader()
                .take((MAX_BODY_BYTES + 1) as u64)
                .read_to_string(&mut body)
                .is_ok();
            if !read_ok {
                respond_json(
                    request,
                    400,
                    r#"{"error":"unreadable body"}"#,
                    cors.as_deref(),
                );
                return;
            }
            if body.len() > MAX_BODY_BYTES {
                respond_json(
                    request,
                    413,
                    r#"{"error":"payload too large"}"#,
                    cors.as_deref(),
                );
                return;
            }
            match accept_capture_payload(state, body, CaptureSource::Extension) {
                Ok(()) => respond_json(request, 200, r#"{"status":"accepted"}"#, cors.as_deref()),
                Err(e) if e == ERR_UNEXPECTED_PAYLOAD_SHAPE => {
                    respond_json(
                        request,
                        400,
                        r#"{"error":"unexpected payload shape"}"#,
                        cors.as_deref(),
                    );
                }
                Err(_) => {
                    respond_json(
                        request,
                        500,
                        r#"{"error":"state unavailable"}"#,
                        cors.as_deref(),
                    );
                }
            }
        }
        (Method::Get, HEALTH_PATH) => {
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
    }
}
