use std::net::SocketAddr;
use std::num::NonZeroU32;

use axum::body::Body;
use axum::extract::connect_info::MockConnectInfo;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::Router;
use governor::Quota;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use taskmint_server::config::{Config, Settings};
use taskmint_server::passwords::Passwords;
use taskmint_server::ratelimit::RateLimits;
use taskmint_server::state::AppState;
use tower::ServiceExt;
use uuid::Uuid;

pub const PASSWORD: &str = "correct horse battery";
pub const ORIGIN: &str = "http://localhost:8080";
pub const PEER: &str = "198.51.100.7:50000";

pub fn passwords() -> Passwords {
    Passwords::with_params(argon2::Params::new(8, 1, 1, None).unwrap())
}

/// The defaults, over plain HTTP (so the cookie is `taskmint_session`).
pub fn settings() -> Settings {
    let mut settings = Config::from_env(&|_| None).unwrap().settings;
    settings.cookie_secure = false;
    settings
}

pub fn generous_limits() -> RateLimits {
    let lots = Quota::per_second(NonZeroU32::new(10_000).unwrap());
    RateLimits::new(lots, lots, 100_000)
}

/// One attempt per hour for each client and username.
pub fn strict_limits() -> RateLimits {
    let once = Quota::per_hour(NonZeroU32::new(1).unwrap());
    RateLimits::new(once, once, 100_000)
}

pub struct App {
    pub db: PgPool,
    router: Router,
}

impl App {
    pub fn new(db: PgPool) -> Self {
        Self::with(db, settings(), generous_limits())
    }

    pub fn with(db: PgPool, settings: Settings, limits: RateLimits) -> Self {
        let state = AppState::new(db.clone(), settings, passwords(), limits);
        let peer: SocketAddr = PEER.parse().unwrap();
        let router = taskmint_server::http::router(state).layer(MockConnectInfo(peer));
        Self { db, router }
    }

    pub fn get(&self, path: &str) -> Req<'_> {
        self.request(Method::GET, path)
    }

    pub fn post(&self, path: &str) -> Req<'_> {
        self.request(Method::POST, path)
    }

    pub fn patch(&self, path: &str) -> Req<'_> {
        self.request(Method::PATCH, path)
    }

    pub fn delete(&self, path: &str) -> Req<'_> {
        self.request(Method::DELETE, path)
    }

    fn request(&self, method: Method, path: &str) -> Req<'_> {
        Req {
            app: self,
            request: Request::builder().method(method).uri(path),
            body: Body::empty(),
        }
    }

    /// Inserts an active user whose password is [`PASSWORD`].
    pub async fn user(&self, username: &str, role: &str) -> Uuid {
        let hash = passwords().hash(PASSWORD.to_owned()).await;
        sqlx::query_scalar(
            "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
        )
        .bind(username)
        .bind(hash)
        .bind(role)
        .fetch_one(&self.db)
        .await
        .unwrap()
    }

    pub async fn login(&self, username: &str) -> Session {
        let res = self
            .post("/api/v1/auth/login")
            .json(json!({"username": username, "password": PASSWORD}))
            .send()
            .await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.body);
        Session::from(&res)
    }

    /// An admin named `root`, signed in.
    pub async fn admin(&self) -> Session {
        self.user("root", "admin").await;
        self.login("root").await
    }

    /// A user named `username`, signed in.
    pub async fn member(&self, username: &str) -> Session {
        self.user(username, "user").await;
        self.login(username).await
    }

    /// Makes every `event` (INSERT, UPDATE or DELETE) on `table` fail.
    pub async fn fail_on(&self, event: &str, table: &str) {
        sqlx::raw_sql(&format!(
            "CREATE OR REPLACE FUNCTION fail_statement() RETURNS trigger LANGUAGE plpgsql AS
                 $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
             CREATE TRIGGER fail_{event}_{table} BEFORE {event} ON {table}
                 FOR EACH STATEMENT EXECUTE FUNCTION fail_statement();"
        ))
        .execute(&self.db)
        .await
        .unwrap();
    }

    /// Makes every statement that touches `table` fail.
    pub async fn break_table(&self, table: &str) {
        sqlx::raw_sql(&format!("ALTER TABLE {table} RENAME TO {table}_broken"))
            .execute(&self.db)
            .await
            .unwrap();
    }

    pub async fn count(&self, sql: &str) -> i64 {
        sqlx::query_scalar(sql).fetch_one(&self.db).await.unwrap()
    }
}

/// A signed-in browser: its cookie and CSRF token.
pub struct Session {
    pub cookie: String,
    pub csrf: String,
    pub user_id: Uuid,
}

impl From<&Res> for Session {
    fn from(res: &Res) -> Self {
        Self {
            cookie: res.session_cookie().expect("a session cookie"),
            csrf: res.body["csrfToken"].as_str().unwrap().to_owned(),
            user_id: res.body["user"]["id"].as_str().unwrap().parse().unwrap(),
        }
    }
}

pub struct Req<'a> {
    app: &'a App,
    request: axum::http::request::Builder,
    body: Body,
}

impl Req<'_> {
    pub fn json(mut self, value: Value) -> Self {
        self.request = self.request.header(CONTENT_TYPE, "application/json");
        self.body = Body::from(value.to_string());
        self
    }

    pub fn raw(mut self, content_type: &str, body: impl Into<Body>) -> Self {
        self.request = self.request.header(CONTENT_TYPE, content_type);
        self.body = body.into();
        self
    }

    pub fn header(
        mut self,
        name: &str,
        value: impl TryInto<HeaderValue, Error: std::fmt::Debug>,
    ) -> Self {
        self.request = self.request.header(name, value.try_into().unwrap());
        self
    }

    /// The session's cookie and its CSRF token, like the web app sends.
    pub fn session(self, session: &Session) -> Self {
        self.cookie(&session.cookie)
            .header("x-csrf-token", session.csrf.as_str())
    }

    pub fn cookie(self, cookie: &str) -> Self {
        self.header(COOKIE.as_str(), cookie)
    }

    pub fn bearer(self, token: &str) -> Self {
        self.header(AUTHORIZATION.as_str(), format!("Bearer {token}").as_str())
    }

    pub async fn send(self) -> Res {
        let request = self.request.body(self.body).unwrap();
        let response = self.app.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()));
        Res {
            status,
            headers,
            body,
        }
    }
}

pub struct Res {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Value,
}

impl Res {
    pub fn code(&self) -> &str {
        self.body["code"].as_str().unwrap_or_default()
    }

    /// `name=value` of the session cookie this response sets.
    pub fn session_cookie(&self) -> Option<String> {
        self.set_cookie()
            .map(|header| header.split(';').next().unwrap().to_owned())
    }

    /// The full `Set-Cookie` header, if any.
    pub fn set_cookie(&self) -> Option<&str> {
        self.headers
            .get(SET_COOKIE)
            .map(|value| value.to_str().unwrap())
    }

    #[track_caller]
    pub fn expect(&self, status: StatusCode, code: &str) {
        assert_eq!((self.status, self.code()), (status, code), "{}", self.body);
    }
}
