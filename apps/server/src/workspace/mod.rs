//! The server's host for core's commands, over each user's workspace in
//! Postgres. A read is one statement over the parts it needs. A change
//! locks the user's workspace, reads the parts the command declares, runs
//! it, keeps the copies it asks for, saves what it changed and commits;
//! only then are its events published to the user's streams.

pub mod diff;
mod store;

use axum::http::StatusCode;
use serde_json::Value;
use taskmint_core::command::{execute, Command, CoreError, Ctx, ResetSummary};
use taskmint_core::DayZone;
use uuid::Uuid;

use crate::error::ApiError;
use crate::events::resync;
use crate::state::AppState;

/// A refused command, with the message core gives (the client matches some
/// word for word) and a code by kind.
pub fn refused(error: CoreError) -> ApiError {
    let (status, code) = match &error {
        CoreError::Rejected(_) => (StatusCode::BAD_REQUEST, "rejected"),
        CoreError::InvalidArgs(_) => (StatusCode::BAD_REQUEST, "invalid_args"),
        CoreError::UnknownCommand(_) => (StatusCode::NOT_FOUND, "unknown_command"),
        CoreError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
    };
    ApiError::new(status, code, error.to_string())
}

/// Runs `command` (by `name`, which labels the copies it keeps) for `user`,
/// dating sessions in `zone`. Returns its reply.
pub async fn run(
    state: &AppState,
    user: Uuid,
    name: &str,
    command: Command,
    zone: DayZone,
) -> Result<Value, ApiError> {
    let access = command.access();
    let ctx = Ctx {
        now: (state.clock)(),
        zone,
    };
    if !access.write {
        // A single statement, so a single consistent snapshot
        let mut loaded = store::load(&state.db, user, access.parts).await?;
        return execute(command, &mut loaded.workspace, &ctx)
            .map(|done| done.reply)
            .map_err(refused);
    }

    let mut tx = state.db.begin().await?;
    store::lock(&mut tx, user).await?;
    let loaded = store::load(&mut *tx, user, access.parts).await?;
    let mut after = loaded.workspace.clone();
    // A refusal rolls back (dropping the transaction), lock and all
    let mut done = execute(command, &mut after, &ctx).map_err(refused)?;
    store::keep(&mut tx, user, name, &done.backups, &loaded.workspace).await?;
    if done.purge_backups {
        let backups_deleted = store::purge(&mut tx, user).await?;
        done.reply = serde_json::to_value(ResetSummary {
            backups_deleted,
            warning: None,
        })
        .expect("a summary is plain data");
        // Every other view of the data is out of date
        done.events.push(resync());
    } else {
        store::save(&mut tx, user, &loaded, &after, done.dirty).await?;
    }
    tx.commit().await?;
    state.events.publish(user, &done.events);
    Ok(done.reply)
}
