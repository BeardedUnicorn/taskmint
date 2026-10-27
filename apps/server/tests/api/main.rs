//! HTTP and command-line tests against a real Postgres. Each
//! `#[sqlx::test]` gets its own fresh, migrated database; set DATABASE_URL
//! to a server where the user may create databases (the compose `db`).

mod admin;
mod auth;
mod capture;
mod cli;
mod commands;
mod common;
mod conformance;
mod health;
mod isolation;
mod links;
mod stream;
mod tokens;
