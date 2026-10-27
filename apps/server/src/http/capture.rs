//! Browser captures for a server account. The TaskMint extension posts the
//! payment site's payload here, as it does to the desktop app's capture
//! server, and the web app takes it (`work-log-payload-captured`, then
//! take_pending_work_log_capture). Only bearer tokens reach these, so
//! they're outside the CSRF checks.

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use taskmint_core::command::{AcceptCaptureArgs, Command};
use taskmint_core::model::CaptureSource;

use super::commands::account_zone;
use super::extract::{CaptureCaller, TextBody};
use crate::error::ApiError;
use crate::state::AppState;
use crate::workspace;

pub async fn capture(
    CaptureCaller(user): CaptureCaller,
    State(state): State<AppState>,
    TextBody(payload): TextBody,
) -> Result<Json<Value>, ApiError> {
    let command = Command::AcceptCapture(AcceptCaptureArgs {
        payload,
        source: CaptureSource::Extension,
    });
    workspace::run(
        &state,
        user.id,
        "accept_capture",
        command,
        account_zone(&user),
    )
    .await?;
    Ok(Json(json!({ "status": "accepted" })))
}

/// The extension's "Test" button: the server answers, and the token works.
pub async fn ping(CaptureCaller(user): CaptureCaller) -> Json<Value> {
    Json(json!({
        "app": "TaskMint",
        "version": env!("CARGO_PKG_VERSION"),
        "username": user.username,
    }))
}
