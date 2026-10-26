//! The TaskMint server: invite-only accounts over axum and PostgreSQL.
//!
//! This crate is the auth foundation (phase P8 of `docs/web-support-plan.md`):
//! sessions, API tokens, invites, password resets, and admin. The workspace
//! API (`/commands`, SSE, capture) builds on it in P9.

pub mod accounts;
pub mod cli;
pub mod config;
pub mod error;
mod healthcheck;
pub mod http;
pub mod passwords;
pub mod ratelimit;
mod secrets;
pub mod state;
mod telemetry;

/// The schema migrations, embedded at compile time.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();
