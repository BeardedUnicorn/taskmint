use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

use crate::state::AppState;

/// The oldest desktop app that can use this server (desktop server mode
/// arrives in a later release; until then every desktop version qualifies).
const MIN_DESKTOP_VERSION: &str = "1.0.0";
/// Bumped on breaking changes to `/api/v1`.
const API_VERSION: u32 = 1;

/// Liveness: the process answers.
pub async fn healthz() -> &'static str {
    "ok"
}

/// Readiness: the database answers too.
pub async fn readyz(State(state): State<AppState>) -> (StatusCode, &'static str) {
    match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => (StatusCode::OK, "ready"),
        Err(error) => {
            tracing::warn!(%error, "readiness check: database unreachable");
            (StatusCode::SERVICE_UNAVAILABLE, "database unavailable")
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    version: &'static str,
    api_version: u32,
    min_desktop_version: &'static str,
}

pub async fn meta() -> Json<Meta> {
    Json(Meta {
        version: env!("CARGO_PKG_VERSION"),
        api_version: API_VERSION,
        min_desktop_version: MIN_DESKTOP_VERSION,
    })
}
