//! Core's commands over HTTP: `POST /api/v1/commands/{name}`, with the
//! command's arguments as the JSON body (none for a command without any).
//! The names, the camelCase arguments, the replies and the error messages
//! are the desktop app's, so the web app's client is the same.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde_json::Value;
use taskmint_core::command::Command;
use taskmint_core::contract::TIME_ZONE_HEADER;
use taskmint_core::DayZone;

use super::extract::{Caller, Path, RawBody};
use crate::accounts::User;
use crate::error::ApiError;
use crate::state::AppState;
use crate::workspace::{self, refused};

pub async fn run(
    caller: Caller,
    State(state): State<AppState>,
    Path(name): Path<String>,
    headers: HeaderMap,
    RawBody(body): RawBody,
) -> Result<Json<Value>, ApiError> {
    let user = caller.user();
    let zone = request_zone(&headers, user)?;
    let args = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).map_err(|error| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_body",
                format!("the arguments aren't JSON: {error}"),
            )
        })?
    };
    let command = Command::parse(&name, args).map_err(refused)?;
    workspace::run(&state, user.id, &name, command, zone)
        .await
        .map(Json)
}

/// The zone a request's sessions are dated in: the one the client names in
/// X-TaskMint-TZ, else the account's.
fn request_zone(headers: &HeaderMap, user: &User) -> Result<DayZone, ApiError> {
    let Some(named) = headers.get(TIME_ZONE_HEADER) else {
        return Ok(account_zone(user));
    };
    named
        .to_str()
        .ok()
        .and_then(DayZone::named)
        .ok_or_else(ApiError::invalid_time_zone)
}

/// The account's zone, or UTC if what's stored isn't one.
pub fn account_zone(user: &User) -> DayZone {
    DayZone::named(&user.time_zone).unwrap_or_else(|| {
        tracing::warn!(user = %user.id, zone = user.time_zone, "not a time zone; using UTC");
        DayZone::UTC
    })
}
