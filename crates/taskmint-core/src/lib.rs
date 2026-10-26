//! TaskMint's business rules, shared by the desktop app and the server.
//!
//! Core is pure: no I/O, no async, and no clock reads (clippy.toml bans the
//! clock and filesystem calls). Hosts pass the current time and the user's
//! `DayZone` in, then save and announce what changed.

pub mod capture;
pub mod contract;
pub mod idle;
pub mod load;
pub mod model;
pub mod notifications;
pub mod records;
pub mod restore;
pub mod sessions;
pub mod timer;
pub mod worklogs;
pub mod zone;

pub use zone::DayZone;
