//! The error every endpoint returns: an HTTP status plus a JSON body of
//! `{error, code}`. `error` is for people; `code` is stable, for clients.

use std::borrow::Cow;

use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: Cow<'static, str>,
    retry_after_secs: Option<u64>,
}

#[derive(Serialize)]
struct Body<'a> {
    error: &'a str,
    code: &'a str,
}

impl ApiError {
    pub fn new(
        status: StatusCode,
        code: &'static str,
        message: impl Into<Cow<'static, str>>,
    ) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            retry_after_secs: None,
        }
    }

    /// 400 for a request that is well-formed but not acceptable.
    pub fn invalid(message: &'static str) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_request", message)
    }

    pub fn unauthenticated() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthenticated", "sign in first")
    }

    pub fn bad_credentials() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "bad_credentials",
            "wrong username or password",
        )
    }

    pub fn forbidden(code: &'static str, message: &'static str) -> Self {
        Self::new(StatusCode::FORBIDDEN, code, message)
    }

    pub fn not_found(message: &'static str) -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", message)
    }

    pub fn conflict(code: &'static str, message: &'static str) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }

    pub fn rate_limited(retry_after_secs: u64) -> Self {
        Self {
            retry_after_secs: Some(retry_after_secs),
            ..Self::new(
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                "too many attempts; try again later",
            )
        }
    }

    /// Maps a unique-constraint violation to a 409 and anything else to a 500.
    pub fn unique_or_internal(
        error: sqlx::Error,
        code: &'static str,
        message: &'static str,
    ) -> Self {
        match &error {
            sqlx::Error::Database(db) if db.is_unique_violation() => Self::conflict(code, message),
            _ => Self::from(error),
        }
    }
}

/// Database failures are logged here and reach the client only as a 500.
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!(%error, "database error");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "internal error",
        )
    }
}

impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> Self {
        Self::new(rejection.status(), "invalid_body", rejection.body_text())
    }
}

/// A path segment that doesn't parse (say, a malformed id) names nothing.
impl From<PathRejection> for ApiError {
    fn from(_: PathRejection) -> Self {
        Self::not_found("no such resource")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(Body {
            error: &self.message,
            code: self.code,
        });
        let mut response = (self.status, body).into_response();
        if let Some(secs) = self.retry_after_secs {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, secs.into());
        }
        response
    }
}
