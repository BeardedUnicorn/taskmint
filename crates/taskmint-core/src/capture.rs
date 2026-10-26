//! Checks on a browser-extension capture before it is accepted: who sent it,
//! and whether it looks like the payment site's payload. Full validation
//! happens in the frontend pipeline.

use crate::contract::CAPTURE_EXTENSION_ORIGIN;

/// A POST without an Origin header comes from a native tool (curl, scripts) —
/// allowed for local testing; such a process already has the user's access.
/// Browser requests always carry Origin, and only the TaskMint extension's is
/// accepted, not every installed extension's.
pub fn origin_allowed(origin: Option<&str>) -> bool {
    match origin {
        None => true,
        Some(origin) => origin == CAPTURE_EXTENSION_ORIGIN,
    }
}

/// Whether CORS response headers should be echoed (the TaskMint extension only).
pub fn is_extension_origin(origin: Option<&str>) -> bool {
    origin == Some(CAPTURE_EXTENSION_ORIGIN)
}

/// Light shape check. A valid capture is a JSON object with workLogs and/or
/// timedWorkEntries arrays (the site's payload shape).
pub fn payload_shape_ok(body: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(body) {
        Ok(serde_json::Value::Object(map)) => {
            map.get("workLogs").is_some_and(|v| v.is_array())
                || map.get("timedWorkEntries").is_some_and(|v| v.is_array())
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn sha256(data: &[u8]) -> Vec<u8> {
        use sha2::{Digest, Sha256};
        Sha256::digest(data).to_vec()
    }

    #[test]
    fn origin_allowed_permits_native_callers_and_only_the_taskmint_extension() {
        assert!(origin_allowed(None));
        assert!(origin_allowed(Some(CAPTURE_EXTENSION_ORIGIN)));
        // Any other installed extension is refused.
        assert!(!origin_allowed(Some("chrome-extension://abcdefghijklmnop")));
        assert!(!origin_allowed(Some(&format!(
            "{}x",
            CAPTURE_EXTENSION_ORIGIN
        ))));
        assert!(!origin_allowed(Some("https://evil.example")));
        assert!(!origin_allowed(Some("http://127.0.0.1:1420")));
        assert!(!origin_allowed(Some("")));
        assert!(!origin_allowed(Some("null")));
    }

    #[test]
    fn cors_is_echoed_only_for_the_taskmint_extension() {
        assert!(!is_extension_origin(None));
        assert!(is_extension_origin(Some(CAPTURE_EXTENSION_ORIGIN)));
        assert!(!is_extension_origin(Some("chrome-extension://abc")));
        assert!(!is_extension_origin(Some(
            "https://app.dataannotation.tech"
        )));
    }

    #[test]
    fn pinned_origin_matches_the_manifest_key() {
        // The extension ID is the first 32 hex chars of SHA-256(public key DER),
        // mapped 0-f to a-p. Recompute it from the manifest so the two can't drift.
        let manifest: serde_json::Value =
            serde_json::from_str(include_str!("../../../apps/extension/manifest.json")).unwrap();
        let key = manifest["key"].as_str().expect("manifest key");
        let der = base64::engine::general_purpose::STANDARD
            .decode(key)
            .unwrap();
        let digest = sha256(&der);
        let id: String = digest
            .iter()
            .take(16)
            .flat_map(|byte| [byte >> 4, byte & 0x0f])
            .map(|nibble| (b'a' + nibble) as char)
            .collect();
        assert_eq!(
            format!("chrome-extension://{}", id),
            CAPTURE_EXTENSION_ORIGIN
        );
    }

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
}
