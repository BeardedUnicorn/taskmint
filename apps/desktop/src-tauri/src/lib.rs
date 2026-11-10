// TaskMint's desktop shell: the Tauri app around taskmint-core.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
pub mod backend;
pub mod backup;
pub mod capabilities;
pub mod capture_server;
pub mod config;
mod dispatch;
pub mod events;
pub mod files;
pub mod idle;
pub mod legacy_identifier;
pub mod notifications;
pub mod platform;
pub mod state;
pub mod store;
pub mod ticker;
pub mod tray;
pub mod updates;
pub mod utils;

#[cfg(test)]
mod testing;

pub use app::run;
pub use state::AppState;
