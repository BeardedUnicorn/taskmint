//! get_capabilities: what the webview runs on, read before the client starts.

use serde_json::{json, Value};

/// The shell, as get_capabilities names it: Android and iOS builds are
/// "mobile", where the webview leaves out what only a desktop has (the
/// tray, folder backups, idle detection, updates).
pub const RUNTIME: &str = if cfg!(mobile) { "mobile" } else { "desktop" };

/// The data always lives in this device's files.
pub fn capabilities() -> Value {
    json!({ "runtime": RUNTIME, "dataLocation": "local" })
}
