//! Where the data lives: JSON files in the app data folder (local mode, the
//! default), or a TaskMint server (server mode, see crate::server). The
//! shell uses either through `DataBackend`, by the commands' names.

pub mod local;
pub mod remote;
pub mod server_api;

pub use local::{Clock, LocalBackend, Publish, Published};
pub use remote::RemoteBackend;

use serde_json::Value;
use taskmint_core::workspace::Workspace;

pub enum DataBackend {
    /// Boxed: it's the larger by far (made once per launch).
    Local(Box<LocalBackend>),
    Remote(RemoteBackend),
}

impl DataBackend {
    /// Runs a command by its name and camelCase arguments, as the webview
    /// sends them (the tray, the idle monitor and captures use the same).
    pub fn call(&self, name: &str, args: Value) -> Result<Value, String> {
        match self {
            Self::Local(local) => local.call_named(name, args),
            Self::Remote(remote) => remote.call(name, args),
        }
    }

    /// Reads the data: the live data in local mode, the copy of the
    /// server's sessions and records in server mode.
    pub fn read<R>(&self, read: impl FnOnce(&Workspace) -> R) -> R {
        match self {
            Self::Local(local) => local.read(read),
            Self::Remote(remote) => remote.read(read),
        }
    }

    pub fn remote(&self) -> Option<&RemoteBackend> {
        match self {
            Self::Local(_) => None,
            Self::Remote(remote) => Some(remote),
        }
    }
}
