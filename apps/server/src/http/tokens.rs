//! A user's API tokens. Managing them needs a cookie session: a token can't
//! mint or list tokens.

use std::net::IpAddr;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::created;
use super::extract::{ClientIp, CookieSession, JsonBody, Path, Scope};
use crate::accounts;
use crate::error::ApiError;
use crate::secrets;
use crate::state::AppState;

#[derive(Clone, Copy, Debug, Serialize, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum TokenKind {
    /// Made on the tokens page.
    Api,
    /// Made by a desktop app signing in.
    Device,
}

impl TokenKind {
    fn as_str(self) -> &'static str {
        match self {
            TokenKind::Api => "api",
            TokenKind::Device => "device",
        }
    }
}

impl Scope {
    fn as_str(self) -> &'static str {
        match self {
            Scope::Capture => "capture",
            Scope::Full => "full",
        }
    }
}

/// A token just made. `token` is the secret, shown this once.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewToken {
    id: Uuid,
    name: String,
    scope: Scope,
    kind: TokenKind,
    prefix: String,
    created_at: DateTime<Utc>,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenInfo {
    id: Uuid,
    name: String,
    scope: Scope,
    kind: TokenKind,
    prefix: String,
    created_at: DateTime<Utc>,
    last_used_at: Option<DateTime<Utc>>,
}

pub fn token_name(raw: &str) -> Result<String, ApiError> {
    accounts::trimmed(raw, 1, 100, "a token name is 1-100 characters").map_err(ApiError::invalid)
}

pub async fn new_token(
    state: &AppState,
    user_id: Uuid,
    name: &str,
    scope: Scope,
    kind: TokenKind,
    ip: IpAddr,
) -> Result<NewToken, ApiError> {
    let token = secrets::api_token();
    let row = sqlx::query!(
        r#"
        WITH token AS (
            INSERT INTO api_tokens (user_id, name, scope, kind, token_prefix, token_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, created_at
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT $1, 'token.create', $1,
                   jsonb_build_object('tokenId', id, 'scope', $3::text, 'kind', $4::text), $7
            FROM token
        )
        SELECT id AS "id!", created_at AS "created_at!" FROM token
        "#,
        user_id,
        name,
        scope.as_str(),
        kind.as_str(),
        token.prefix,
        token.hash,
        ip.to_string(),
    )
    .fetch_one(&state.db)
    .await?;
    Ok(NewToken {
        id: row.id,
        name: name.to_owned(),
        scope,
        kind,
        prefix: token.prefix,
        created_at: row.created_at,
        token: token.secret,
    })
}

/// The caller's live tokens, newest first.
pub async fn list(
    session: CookieSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<TokenInfo>>, ApiError> {
    sqlx::query_as!(
        TokenInfo,
        r#"
        SELECT id, name, scope AS "scope: Scope", kind AS "kind: TokenKind",
               token_prefix AS prefix, created_at, last_used_at
        FROM api_tokens
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC
        "#,
        session.user.id,
    )
    .fetch_all(&state.db)
    .await
    .map(Json)
    .map_err(ApiError::from)
}

#[derive(Deserialize)]
pub struct CreateToken {
    name: String,
    scope: Scope,
}

pub async fn create(
    session: CookieSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    JsonBody(body): JsonBody<CreateToken>,
) -> Result<impl IntoResponse, ApiError> {
    let name = token_name(&body.name)?;
    new_token(
        &state,
        session.user.id,
        &name,
        body.scope,
        TokenKind::Api,
        ip,
    )
    .await
    .map(created)
}

pub async fn revoke(
    session: CookieSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    sqlx::query_scalar!(
        r#"
        WITH token AS (
            UPDATE api_tokens SET revoked_at = now()
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
            RETURNING id
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT $2, 'token.revoke', $2, jsonb_build_object('tokenId', id), $3 FROM token
        )
        SELECT id AS "id!" FROM token
        "#,
        id,
        session.user.id,
        ip.to_string(),
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("no such token"))?;
    // A stream the token opened ends; the others reconnect
    state.events.disconnect(session.user.id);
    Ok(StatusCode::NO_CONTENT)
}
