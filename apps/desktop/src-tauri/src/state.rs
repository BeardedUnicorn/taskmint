// Application state: the data backend, and the shell's own state (the tray,
// idle detection, notification preferences, the capture server).

use crate::backend::LocalBackend;
use crate::tray::TrayKey;
use std::sync::{Arc, Mutex};
use taskmint_core::idle::IdleState;
use taskmint_core::model::CaptureServerStatus;
use taskmint_core::notifications::NotificationPrefs;

/// Run `f` on the value behind `mutex`; a poisoned lock is an error naming
/// `what`.
fn with_lock<T, R>(mutex: &Mutex<T>, what: &str, f: impl FnOnce(&mut T) -> R) -> Result<R, String> {
    let mut guard = mutex
        .lock()
        .map_err(|e| format!("Failed to lock {}: {}", what, e))?;
    Ok(f(&mut guard))
}

/// A read accessor and a write accessor for one shared field.
macro_rules! accessors {
    ($read:ident, $write:ident, $field:ident, $ty:ty, $what:literal) => {
        pub fn $read<T, F>(&self, f: F) -> Result<T, String>
        where
            F: FnOnce(&$ty) -> T,
        {
            with_lock(&self.$field, $what, |value| f(value))
        }

        pub fn $write<T, F>(&self, f: F) -> Result<T, String>
        where
            F: FnOnce(&mut $ty) -> T,
        {
            with_lock(&self.$field, $what, f)
        }
    };
}

// Main application state container
#[derive(Clone)]
pub struct AppState {
    /// Sessions, work logs, records and captures, and every command on them.
    pub backend: Arc<LocalBackend>,
    pub capture_server_status: Arc<Mutex<CaptureServerStatus>>,
    pub tray_icon: Arc<Mutex<Option<tauri::tray::TrayIcon>>>,
    // What the tray menu was last built for (None before the first build),
    // so it's rebuilt only when that changes.
    pub tray_rendered: Arc<Mutex<Option<TrayKey>>>,
    // Idle-detection settings (mirrored from the app) and the pending
    // "you were away" question. In memory only.
    pub idle: Arc<Mutex<IdleState>>,
    // Which OS notifications the user allows (mirrored from the app).
    pub notification_prefs: Arc<Mutex<NotificationPrefs>>,
}

impl AppState {
    pub fn new(backend: LocalBackend) -> Self {
        Self {
            backend: Arc::new(backend),
            capture_server_status: Arc::new(Mutex::new(CaptureServerStatus {
                running: false,
                port: taskmint_core::contract::CAPTURE_SERVER_PORT,
                warning: None,
            })),
            tray_icon: Arc::new(Mutex::new(None)),
            tray_rendered: Arc::new(Mutex::new(None)),
            idle: Arc::new(Mutex::new(IdleState::default())),
            notification_prefs: Arc::new(Mutex::new(NotificationPrefs::default())),
        }
    }

    accessors!(with_idle, with_idle_mut, idle, IdleState, "idle state");
    accessors!(
        with_notification_prefs,
        with_notification_prefs_mut,
        notification_prefs,
        NotificationPrefs,
        "notification preferences"
    );
    accessors!(
        with_tray_rendered,
        with_tray_rendered_mut,
        tray_rendered,
        Option<TrayKey>,
        "tray state"
    );
    accessors!(
        with_tray_icon,
        with_tray_icon_mut,
        tray_icon,
        Option<tauri::tray::TrayIcon>,
        "tray icon"
    );
    accessors!(
        with_capture_server_status,
        with_capture_server_status_mut,
        capture_server_status,
        CaptureServerStatus,
        "capture server status"
    );
}
