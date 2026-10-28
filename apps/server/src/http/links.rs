//! The one-time links an admin hands out: invites (which create an account)
//! and password resets. Both sign the person in when accepted.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::extract::{user_agent, ClientIp, JsonBody, Path};
use super::NewSession;
use crate::accounts::{self, Role, User};
use crate::error::ApiError;
use crate::secrets;
use crate::state::AppState;

fn invite_gone() -> ApiError {
    ApiError::not_found("this invite link is invalid, used, or expired")
}

fn reset_gone() -> ApiError {
    ApiError::not_found("this password-reset link is invalid, used, or expired")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteInfo {
    role: Role,
    expires_at: DateTime<Utc>,
}

pub async fn invite(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(token): Path<String>,
) -> Result<Json<InviteInfo>, ApiError> {
    state.limits.check_ip(ip)?;
    sqlx::query_as!(
        InviteInfo,
        r#"
        SELECT role AS "role: Role", expires_at FROM invites
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        "#,
        secrets::hash(&token),
    )
    .fetch_optional(&state.db)
    .await?
    .map(Json)
    .ok_or_else(invite_gone)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInvite {
    username: String,
    password: String,
    #[serde(default)]
    display_name: String,
}

/// Creates the account with the invite's role and signs it in.
pub async fn accept_invite(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
    Path(token): Path<String>,
    JsonBody(body): JsonBody<AcceptInvite>,
) -> Result<impl IntoResponse, ApiError> {
    state.limits.check_ip(ip)?;
    let username = accounts::username(&body.username).map_err(ApiError::invalid)?;
    accounts::password(&body.password).map_err(ApiError::invalid)?;
    let display_name = accounts::display_name(&body.display_name).map_err(ApiError::invalid)?;
    let password_hash = state.passwords.hash(body.password).await;
    let session = NewSession::new(&state.settings);
    // One statement, so the invite is used up only if the account and its
    // session are created too.
    let user = sqlx::query_as!(
        User,
        r#"
        WITH invite AS (
            UPDATE invites SET used_at = now(), used_by = $4
            WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
            RETURNING id, role
        ), new_user AS (
            INSERT INTO users (id, username, display_name, password_hash, role)
            SELECT $4, $2, $3, $5, role FROM invite
            RETURNING id, username, display_name, role, time_zone
        ), session AS (
            INSERT INTO auth_sessions (token_hash, csrf_token, user_id, expires_at, user_agent, ip)
            SELECT $6, $7, id, $8, $9, $10 FROM new_user
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT new_user.id, 'invite.accept', new_user.id,
                   jsonb_build_object('inviteId', invite.id), $10
            FROM new_user, invite
        )
        SELECT id AS "id!", username AS "username!", display_name AS "display_name!",
               role AS "role!: Role", time_zone AS "time_zone!"
        FROM new_user
        "#,
        secrets::hash(&token),
        username,
        display_name,
        Uuid::new_v4(),
        password_hash,
        session.token_hash,
        session.csrf_token,
        session.expires_at,
        user_agent(&headers),
        ip.to_string(),
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|error| {
        ApiError::unique_or_internal(error, "username_taken", "that username is taken")
    })?
    .ok_or_else(invite_gone)?;
    Ok(session.respond(&state.settings, user))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordResetInfo {
    username: String,
    expires_at: DateTime<Utc>,
}

pub async fn password_reset(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(token): Path<String>,
) -> Result<Json<PasswordResetInfo>, ApiError> {
    state.limits.check_ip(ip)?;
    sqlx::query_as!(
        PasswordResetInfo,
        r#"
        SELECT u.username, r.expires_at
        FROM password_resets r JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()
          AND u.disabled_at IS NULL
        "#,
        secrets::hash(&token),
    )
    .fetch_optional(&state.db)
    .await?
    .map(Json)
    .ok_or_else(reset_gone)
}

#[derive(Deserialize)]
pub struct AcceptPasswordReset {
    password: String,
}

/// Sets the new password, signs out every session and every desktop app
/// signed in with the old one (closing their event streams), and signs
/// this one in.
pub async fn accept_password_reset(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
    Path(token): Path<String>,
    JsonBody(body): JsonBody<AcceptPasswordReset>,
) -> Result<impl IntoResponse, ApiError> {
    state.limits.check_ip(ip)?;
    accounts::password(&body.password).map_err(ApiError::invalid)?;
    let password_hash = state.passwords.hash(body.password).await;
    let session = NewSession::new(&state.settings);
    let user = sqlx::query_as!(
        User,
        r#"
        WITH reset AS (
            UPDATE password_resets r SET used_at = now()
            FROM users u
            WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()
              AND u.id = r.user_id AND u.disabled_at IS NULL
            RETURNING r.id, r.user_id
        ), updated AS (
            UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now()
            WHERE id = (SELECT user_id FROM reset)
            RETURNING id, username, display_name, role, time_zone
        ), signed_out AS (
            DELETE FROM auth_sessions WHERE user_id = (SELECT id FROM updated)
        ), devices AS (
            UPDATE api_tokens SET revoked_at = now()
            WHERE user_id = (SELECT id FROM updated) AND kind = 'device' AND revoked_at IS NULL
        ), session AS (
            INSERT INTO auth_sessions (token_hash, csrf_token, user_id, expires_at, user_agent, ip)
            SELECT $3, $4, id, $5, $6, $7 FROM updated
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT updated.id, 'password_reset.accept', updated.id,
                   jsonb_build_object('resetId', reset.id), $7
            FROM updated, reset
        )
        SELECT id AS "id!", username AS "username!", display_name AS "display_name!",
               role AS "role!: Role", time_zone AS "time_zone!"
        FROM updated
        "#,
        secrets::hash(&token),
        password_hash,
        session.token_hash,
        session.csrf_token,
        session.expires_at,
        user_agent(&headers),
        ip.to_string(),
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(reset_gone)?;
    state.events.disconnect(user.id);
    Ok(session.respond(&state.settings, user))
}
