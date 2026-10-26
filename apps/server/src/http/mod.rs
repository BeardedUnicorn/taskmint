//! The HTTP API. Everything but the health checks is under `/api/v1`.
//!
//! There is no CORS: browsers reach the API same-origin through the web
//! app's proxy, and other clients (desktop, scripts) aren't browsers.
//! Unsafe requests from another origin are refused by [`CsrfLayer`]
//! (`Sec-Fetch-Site` / `Origin`); cookie-authenticated ones also need the
//! session's `X-CSRF-Token`.

mod admin;
mod auth;
mod extract;
mod health;
mod links;
mod tokens;

use axum::extract::DefaultBodyLimit;
use axum::http::header::{CACHE_CONTROL, X_CONTENT_TYPE_OPTIONS};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, SameSite};
use axum_extra::extract::CookieJar;
use chrono::{DateTime, Utc};
use serde::Serialize;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::csrf::{CsrfLayer, ProtectionError};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use crate::accounts::User;
use crate::config::Settings;
use crate::error::ApiError;
use crate::secrets;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    let csrf = CsrfLayer::new()
        .add_trusted_origin(&state.settings.public_origin)
        .expect("Config checked the public origin")
        .with_rejection_response(cross_origin);
    let api = Router::new()
        .route("/meta", get(health::meta))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/me", get(auth::me))
        .route("/auth/password", post(auth::change_password))
        .route("/auth/device-token", post(auth::device_token))
        .route("/invites/{token}", get(links::invite))
        .route("/invites/{token}/accept", post(links::accept_invite))
        .route("/password-resets/{token}", get(links::password_reset))
        .route(
            "/password-resets/{token}/accept",
            post(links::accept_password_reset),
        )
        .route("/tokens", get(tokens::list).post(tokens::create))
        .route("/tokens/{id}", delete(tokens::revoke))
        .route("/admin/users", get(admin::list_users))
        .route("/admin/users/{id}", patch(admin::update_user))
        .route(
            "/admin/users/{id}/password-reset",
            post(admin::create_password_reset),
        )
        .route(
            "/admin/invites",
            get(admin::list_invites).post(admin::create_invite),
        )
        .route("/admin/invites/{id}", delete(admin::revoke_invite));
    Router::new()
        .route("/healthz", get(health::healthz))
        .route("/readyz", get(health::readyz))
        .nest("/api/v1", api)
        .fallback(not_found)
        .layer(DefaultBodyLimit::max(state.settings.max_body_bytes))
        .layer(csrf)
        .layer(SetResponseHeaderLayer::overriding(
            CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(CatchPanicLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn not_found() -> ApiError {
    ApiError::not_found("no such endpoint")
}

fn cross_origin(_: ProtectionError) -> Response {
    ApiError::forbidden("cross_origin", "cross-origin request refused").into_response()
}

/// A browser session about to be created: its cookie value, the hash it's
/// stored under, and its CSRF token.
pub struct NewSession {
    token: String,
    pub token_hash: Vec<u8>,
    pub csrf_token: String,
    pub expires_at: DateTime<Utc>,
}

/// What signing in returns, and `auth/me` (without a CSRF token for bearer
/// callers).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub user: User,
    pub csrf_token: Option<String>,
}

impl NewSession {
    pub fn new(settings: &Settings) -> Self {
        let token = secrets::token();
        Self {
            token_hash: secrets::hash(&token),
            token,
            csrf_token: secrets::token(),
            expires_at: Utc::now() + settings.session_ttl,
        }
    }

    /// The response once the session row exists: the cookie plus the user.
    pub fn respond(self, settings: &Settings, user: User) -> (CookieJar, Json<SessionInfo>) {
        (
            CookieJar::new().add(session_cookie(settings, self.token)),
            Json(SessionInfo {
                user,
                csrf_token: Some(self.csrf_token),
            }),
        )
    }
}

pub fn session_cookie(settings: &Settings, token: String) -> Cookie<'static> {
    cookie(settings, token, settings.session_ttl.num_seconds())
}

pub fn cleared_session_cookie(settings: &Settings) -> Cookie<'static> {
    cookie(settings, String::new(), 0)
}

fn cookie(settings: &Settings, value: String, max_age_secs: i64) -> Cookie<'static> {
    Cookie::build((settings.cookie_name(), value))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Strict)
        .secure(settings.cookie_secure)
        .max_age(cookie::time::Duration::seconds(max_age_secs))
        .build()
}

/// 201 with a JSON body.
fn created<T: Serialize>(body: T) -> (StatusCode, Json<T>) {
    (StatusCode::CREATED, Json(body))
}
