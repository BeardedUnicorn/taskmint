//! Request extractors: bodies and paths with JSON errors, the client
//! address, and the ways a caller authenticates.

use std::net::{IpAddr, SocketAddr};

use axum::body::Bytes;
use axum::extract::{ConnectInfo, FromRequest, FromRequestParts, Request};
use axum::http::header::{AUTHORIZATION, ORIGIN, USER_AGENT};
use axum::http::request::Parts;
use axum::http::HeaderMap;
use axum_extra::extract::CookieJar;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use taskmint_core::capture::origin_allowed;
use taskmint_core::contract::CAPTURE_HEADER;
use uuid::Uuid;

use crate::accounts::{Role, User};
use crate::error::ApiError;
use crate::secrets;
use crate::state::AppState;

/// `axum::Json`, rejecting bad bodies with an [`ApiError`].
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct JsonBody<T>(pub T);

/// The body as it came, for endpoints that read it themselves.
pub struct RawBody(pub Bytes);

impl<S: Send + Sync> FromRequest<S> for RawBody {
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, ApiError> {
        Ok(Self(Bytes::from_request(request, state).await?))
    }
}

/// The body as text.
pub struct TextBody(pub String);

impl<S: Send + Sync> FromRequest<S> for TextBody {
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, ApiError> {
        Ok(Self(String::from_request(request, state).await?))
    }
}

/// `axum::extract::Path`, where a segment that doesn't parse is a 404.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(ApiError))]
pub struct Path<T>(pub T);

/// The client's address: the TCP peer, or with `TASKMINT_TRUST_PROXY` the
/// last `X-Forwarded-For` hop (the one our proxy added).
pub struct ClientIp(pub IpAddr);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let ConnectInfo(peer) = ConnectInfo::<SocketAddr>::from_request_parts(parts, state)
            .await
            .expect("the server is run with connect info");
        let forwarded = if state.settings.trust_proxy {
            forwarded_for(&parts.headers)
        } else {
            None
        };
        Ok(Self(forwarded.unwrap_or(peer.ip())))
    }
}

fn forwarded_for(headers: &HeaderMap) -> Option<IpAddr> {
    let value = headers.get("x-forwarded-for")?.to_str().ok()?;
    let last = value.rsplit_once(',').map_or(value, |(_, last)| last);
    last.trim().parse().ok()
}

/// The `User-Agent`, shortened, for the sessions list.
pub fn user_agent(headers: &HeaderMap) -> String {
    headers
        .get(USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .chars()
        .take(200)
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum Scope {
    /// Only for submitting captures (the browser extension).
    Capture,
    /// Everything the owner can do, except managing tokens.
    Full,
}

/// A browser session from the session cookie. On unsafe methods it also
/// requires the session's CSRF token in `X-CSRF-Token`. Every use slides
/// the session's expiry forward.
pub struct CookieSession {
    pub id: Uuid,
    /// The cookie value, so `auth/me` can re-issue the cookie.
    pub token: String,
    pub csrf_token: String,
    pub user: User,
    pub password_hash: String,
}

impl FromRequestParts<AppState> for CookieSession {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar
            .get(state.settings.cookie_name())
            .ok_or_else(ApiError::unauthenticated)?
            .value()
            .to_owned();
        let row = sqlx::query!(
            r#"
            UPDATE auth_sessions s SET last_seen_at = now(), expires_at = $2
            FROM users u
            WHERE s.token_hash = $1 AND s.expires_at > now()
              AND u.id = s.user_id AND u.disabled_at IS NULL
            RETURNING s.id, s.csrf_token, u.id AS user_id, u.username, u.display_name,
                      u.role AS "role: Role", u.time_zone, u.password_hash
            "#,
            secrets::hash(&token),
            Utc::now() + state.settings.session_ttl,
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(ApiError::unauthenticated)?;
        if !parts.method.is_safe() && !csrf_matches(&parts.headers, &row.csrf_token) {
            return Err(ApiError::forbidden(
                "csrf",
                "send the session's CSRF token in X-CSRF-Token",
            ));
        }
        Ok(Self {
            id: row.id,
            token,
            csrf_token: row.csrf_token,
            user: User {
                id: row.user_id,
                username: row.username,
                display_name: row.display_name,
                role: row.role,
                time_zone: row.time_zone,
            },
            password_hash: row.password_hash,
        })
    }
}

fn csrf_matches(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get("x-csrf-token")
        .is_some_and(|sent| sent.as_bytes().ct_eq(expected.as_bytes()).into())
}

/// A cookie session whose user is an admin.
pub struct AdminSession(pub CookieSession);

impl FromRequestParts<AppState> for AdminSession {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let session = CookieSession::from_request_parts(parts, state).await?;
        if session.user.role == Role::Admin {
            Ok(Self(session))
        } else {
            Err(ApiError::forbidden(
                "admin_only",
                "only an admin can do this",
            ))
        }
    }
}

/// A bearer API token (`Authorization: Bearer tmk_…`).
pub struct TokenAuth {
    pub scope: Scope,
    pub user: User,
}

impl TokenAuth {
    async fn authenticate(state: &AppState, token: &str) -> Result<Self, ApiError> {
        sqlx::query!(
            r#"
            UPDATE api_tokens t SET last_used_at = now()
            FROM users u
            WHERE t.token_hash = $1 AND t.revoked_at IS NULL
              AND u.id = t.user_id AND u.disabled_at IS NULL
            RETURNING t.scope AS "scope: Scope", u.id AS user_id, u.username,
                      u.display_name, u.role AS "role: Role", u.time_zone
            "#,
            secrets::hash(token),
        )
        .fetch_optional(&state.db)
        .await?
        .map(|row| Self {
            scope: row.scope,
            user: User {
                id: row.user_id,
                username: row.username,
                display_name: row.display_name,
                role: row.role,
                time_zone: row.time_zone,
            },
        })
        .ok_or_else(ApiError::unauthenticated)
    }
}

pub fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

/// A cookie session, or a bearer token with the `full` scope.
pub enum Caller {
    Session(CookieSession),
    Token(TokenAuth),
}

impl FromRequestParts<AppState> for Caller {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        match bearer(&parts.headers) {
            Some(token) => {
                let auth = TokenAuth::authenticate(state, token).await?;
                if auth.scope == Scope::Full {
                    Ok(Self::Token(auth))
                } else {
                    Err(ApiError::forbidden(
                        "insufficient_scope",
                        "this token's scope doesn't allow this",
                    ))
                }
            }
            None => CookieSession::from_request_parts(parts, state)
                .await
                .map(Self::Session),
        }
    }
}

impl Caller {
    pub fn user(&self) -> &User {
        match self {
            Self::Session(session) => &session.user,
            Self::Token(auth) => &auth.user,
        }
    }
}

/// The browser extension sending a capture: a bearer token of either scope,
/// with `X-TaskMint-Capture`, from no Origin (a script) or the TaskMint
/// extension's. A web page can't add that header without a preflight, which
/// fails here (there's no CORS).
pub struct CaptureCaller(pub User);

impl FromRequestParts<AppState> for CaptureCaller {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        // An Origin that isn't text matches none allowed
        let origin = parts
            .headers
            .get(ORIGIN)
            .map(|value| value.to_str().unwrap_or_default());
        if !origin_allowed(origin) {
            return Err(ApiError::forbidden(
                "forbidden_origin",
                "only the TaskMint extension can send captures",
            ));
        }
        if !parts.headers.contains_key(CAPTURE_HEADER) {
            return Err(ApiError::forbidden(
                "missing_capture_header",
                "a capture needs the X-TaskMint-Capture header",
            ));
        }
        let token = bearer(&parts.headers).ok_or_else(ApiError::unauthenticated)?;
        Ok(Self(TokenAuth::authenticate(state, token).await?.user))
    }
}
