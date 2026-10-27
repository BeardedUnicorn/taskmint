// Application state: the data backend, the platform, and the shell's own
// state (the tray, idle detection, notification preferences, the capture
// server).

use crate::backend::{Clock, LocalBackend, Published};
use crate::platform::Platform;
use crate::store::JsonFileStore;
use crate::tray::model::{TrayMenu, TrayStatus};
use std::ops::Deref;
use std::sync::{Arc, Mutex, PoisonError, Weak};
use taskmint_core::idle::IdleState;
use taskmint_core::model::CaptureServerStatus;
use taskmint_core::notifications::NotificationPrefs;
use taskmint_core::workspace::Parts;

/// Run `f` on the value behind `mutex`. Each value here is replaced or set
/// in one step, so a panic elsewhere can't leave one half-written: a
/// poisoned lock is still used.
fn with_lock<T, R>(mutex: &Mutex<T>, f: impl FnOnce(&mut T) -> R) -> R {
    f(&mut mutex.lock().unwrap_or_else(PoisonError::into_inner))
}

/// A read accessor and a write accessor for one shared field.
macro_rules! accessors {
    ($read:ident, $write:ident, $field:ident, $ty:ty) => {
        pub fn $read<T>(&self, f: impl FnOnce(&$ty) -> T) -> T {
            with_lock(&self.$field, |value| f(value))
        }

        pub fn $write<T>(&self, f: impl FnOnce(&mut $ty) -> T) -> T {
            with_lock(&self.$field, f)
        }
    };
}

/// What the tray last showed, so it changes only when something did.
#[derive(Debug, Default)]
pub struct TrayShown {
    /// The tray icon exists (tray::start succeeded).
    pub enabled: bool,
    pub menu: Option<TrayMenu>,
    pub status: Option<TrayStatus>,
}

pub struct Shell {
    /// Sessions, work logs, records and captures, and every command on them.
    pub backend: LocalBackend,
    pub platform: Arc<dyn Platform>,
    pub clock: Clock,
    capture_server_status: Mutex<CaptureServerStatus>,
    tray: Mutex<TrayShown>,
    // Idle-detection settings (mirrored from the app) and the pending
    // "you were away" question. In memory only.
    idle: Mutex<IdleState>,
    // Which OS notifications the user allows (mirrored from the app).
    notification_prefs: Mutex<NotificationPrefs>,
}

/// The shell, shared by the IPC command, the tray, the idle monitor and
/// the capture server.
#[derive(Clone)]
pub struct AppState(Arc<Shell>);

impl Deref for AppState {
    type Target = Shell;

    fn deref(&self) -> &Shell {
        &self.0
    }
}

impl AppState {
    /// Loads the data in `store`. Saved changes reach the webview as events,
    /// and the tray follows the sessions and tasks.
    pub fn open(store: JsonFileStore, clock: Clock, platform: Arc<dyn Platform>) -> AppState {
        AppState(Arc::new_cyclic(|shell: &Weak<Shell>| {
            let shell = shell.clone();
            // Nothing is published while the shell is built
            let publish = move |published: &Published| {
                shell
                    .upgrade()
                    .into_iter()
                    .for_each(|shell| AppState(shell).publish(published))
            };
            Shell {
                backend: LocalBackend::open(store, clock.clone(), Box::new(publish)),
                platform,
                clock,
                capture_server_status: Mutex::new(CaptureServerStatus {
                    running: false,
                    port: taskmint_core::contract::CAPTURE_SERVER_PORT,
                    warning: None,
                }),
                tray: Mutex::new(TrayShown::default()),
                idle: Mutex::new(IdleState::default()),
                notification_prefs: Mutex::new(NotificationPrefs::default()),
            }
        }))
    }

    fn publish(&self, published: &Published) {
        for event in published.events {
            crate::events::emit_quiet(self, event.name, &event.payload);
        }
        if published
            .changed
            .intersects(Parts::SESSIONS | Parts::RECORDS)
        {
            crate::tray::sync(self);
        }
    }
}

impl Shell {
    accessors!(with_idle, with_idle_mut, idle, IdleState);
    accessors!(
        with_notification_prefs,
        with_notification_prefs_mut,
        notification_prefs,
        NotificationPrefs
    );
    accessors!(with_tray, with_tray_mut, tray, TrayShown);
    accessors!(
        with_capture_server_status,
        with_capture_server_status_mut,
        capture_server_status,
        CaptureServerStatus
    );
}

#[cfg(test)]
mod tests {
    use crate::testing::fixture;

    #[test]
    fn a_lock_stays_usable_after_a_panic_while_it_was_held() {
        let f = fixture();
        let poisoner = f.state.clone();
        let _ = std::thread::spawn(move || {
            poisoner.with_idle_mut(|idle| {
                idle.settings.enabled = true;
                panic!("while holding the idle state")
            })
        })
        .join();

        assert!(f.state.with_idle(|idle| idle.settings.enabled));
    }
}
