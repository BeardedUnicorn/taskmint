//! The TaskMint server: invite-only accounts over axum and PostgreSQL.
//!
//! Accounts (sessions, API tokens, invites, password resets, admin) and
//! each account's workspace: taskmint-core's commands over Postgres
//! (`/commands`), its events as a stream (`/events`), and browser captures
//! (`/capture`).

pub mod accounts;
pub mod cli;
pub mod config;
pub mod error;
pub mod events;
mod healthcheck;
pub mod http;
pub mod passwords;
pub mod ratelimit;
mod secrets;
pub mod state;
mod telemetry;
pub mod workspace;

/// The schema migrations, embedded at compile time.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();
