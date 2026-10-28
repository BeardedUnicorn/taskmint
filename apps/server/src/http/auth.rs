//! Signing in and out, the current user, password changes, and device
//! tokens for the desktop app.

use std::net::IpAddr;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};

use super::extract::{bearer, user_agent, Caller, ClientIp, CookieSession, JsonBody, Scope};
use super::tokens::{new_token, token_name, NewToken, TokenKind};
use super::{cleared_session_cookie, created, session_cookie, NewSession, SessionInfo};
use crate::accounts::{self, Role, User};
use crate::error::ApiError;
use crate::secrets;
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    username: String,
    password: String,
}

pub async fn login(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
    JsonBody(body): JsonBody<Credentials>,
) -> Result<impl IntoResponse, ApiError> {
    let user = sign_in(&state, ip, &body.username, body.password).await?;
    let session = NewSession::new(&state.settings);
    sqlx::query!(
        r#"
        WITH expired AS (
            DELETE FROM auth_sessions WHERE user_id = $3 AND expires_at <= now()
        )
        INSERT INTO auth_sessions (token_hash, csrf_token, user_id, expires_at, user_agent, ip)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        session.token_hash,
        session.csrf_token,
        user.id,
        session.expires_at,
        user_agent(&headers),
        ip.to_string(),
    )
    .execute(&state.db)
    .await?;
    Ok(session.respond(&state.settings, user))
}

/// Checks a username and password under the rate limits. Unknown and
/// disabled users get the same answer, in the same time, as a wrong password.
async fn sign_in(
    state: &AppState,
    ip: IpAddr,
    username: &str,
    password: String,
) -> Result<User, ApiError> {
    let username = username.trim().to_lowercase();
    state.limits.check_account(ip, &username)?;
    let row = sqlx::query!(
        r#"
        SELECT id, username, display_name, role AS "role: Role", time_zone, password_hash
        FROM users WHERE username = $1 AND disabled_at IS NULL
        "#,
        username,
    )
    .fetch_optional(&state.db)
    .await?;
    let hash = row.as_ref().map(|row| row.password_hash.clone());
    match (state.passwords.verify(password, hash).await, row) {
        (true, Some(row)) => Ok(User {
            id: row.id,
            username: row.username,
            display_name: row.display_name,
            role: row.role,
            time_zone: row.time_zone,
        }),
        _ => Err(ApiError::bad_credentials()),
    }
}

pub async fn logout(
    session: CookieSession,
    State(state): State<AppState>,
) -> Result<(CookieJar, StatusCode), ApiError> {
    sqlx::query!("DELETE FROM auth_sessions WHERE id = $1", session.id)
        .execute(&state.db)
        .await?;
    // This session's streams end; the user's others reconnect
    state.events.disconnect(session.user.id);
    Ok((
        CookieJar::new().add(cleared_session_cookie(&state.settings)),
        StatusCode::NO_CONTENT,
    ))
}

/// The signed-in user. For a cookie session it also returns the CSRF token
/// and re-issues the cookie, so a browser that keeps coming back stays
/// signed in (the session's own expiry slides on every request).
pub async fn me(caller: Caller, State(state): State<AppState>) -> (CookieJar, Json<SessionInfo>) {
    match caller {
        Caller::Session(session) => (
            CookieJar::new().add(session_cookie(&state.settings, session.token)),
            Json(SessionInfo {
                user: session.user,
                csrf_token: Some(session.csrf_token),
            }),
        ),
        Caller::Token(auth) => (
            CookieJar::new(),
            Json(SessionInfo {
                user: auth.user,
                csrf_token: None,
            }),
        ),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordChange {
    current_password: String,
    new_password: String,
}

/// Changes the password and signs out every other session (and every event
/// stream; this session's reconnect).
pub async fn change_password(
    session: CookieSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    JsonBody(body): JsonBody<PasswordChange>,
) -> Result<StatusCode, ApiError> {
    state.limits.check_account(ip, &session.user.username)?;
    accounts::password(&body.new_password).map_err(ApiError::invalid)?;
    if !state
        .passwords
        .verify(body.current_password, Some(session.password_hash))
        .await
    {
        return Err(ApiError::forbidden(
            "wrong_password",
            "the current password is wrong",
        ));
    }
    let hash = state.passwords.hash(body.new_password).await;
    sqlx::query!(
        r#"
        WITH changed AS (
            UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now()
            WHERE id = $1
        ), signed_out AS (
            DELETE FROM auth_sessions WHERE user_id = $1 AND id <> $3
        )
        INSERT INTO audit_events (actor_id, action, target_user_id, ip)
        VALUES ($1, 'password.change', $1, $4)
        "#,
        session.user.id,
        hash,
        session.id,
        ip.to_string(),
    )
    .execute(&state.db)
    .await?;
    state.events.disconnect(session.user.id);
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTokenRequest {
    username: String,
    password: String,
    device_name: String,
}

#[derive(Serialize)]
pub struct DeviceToken {
    #[serde(flatten)]
    token: NewToken,
    user: User,
}

/// Desktop sign-in: trades credentials for a `full` token named after the
/// device, which the desktop app keeps in the OS keychain.
pub async fn device_token(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    JsonBody(body): JsonBody<DeviceTokenRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let name = token_name(&body.device_name)?;
    let user = sign_in(&state, ip, &body.username, body.password).await?;
    let token = new_token(&state, user.id, &name, Scope::Full, TokenKind::Device, ip).await?;
    Ok(created(DeviceToken { token, user }))
}

/// Desktop sign-out: the token that calls revokes itself (the desktop app
/// has no cookie session to manage its tokens with), and its user's event
/// streams end, as when a token is revoked from the web app.
pub async fn revoke_device_token(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let token = bearer(&headers).ok_or_else(ApiError::unauthenticated)?;
    let user_id = sqlx::query_scalar!(
        r#"
        WITH token AS (
            UPDATE api_tokens SET revoked_at = now()
            WHERE token_hash = $1 AND revoked_at IS NULL
            RETURNING id, user_id
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT user_id, 'token.revoke', user_id, jsonb_build_object('tokenId', id), $2 FROM token
        )
        SELECT user_id AS "user_id!" FROM token
        "#,
        secrets::hash(token),
        ip.to_string(),
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(ApiError::unauthenticated)?;
    state.events.disconnect(user_id);
    Ok(StatusCode::NO_CONTENT)
}
