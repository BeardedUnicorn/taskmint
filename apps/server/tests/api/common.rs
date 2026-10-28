use std::net::SocketAddr;
use std::num::NonZeroU32;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::connect_info::MockConnectInfo;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::Router;
use chrono::{DateTime, Utc};
use governor::Quota;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use taskmint_core::testkit::start_time;
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
    pub state: AppState,
    /// The time commands run at; tests move it on.
    pub now: Arc<Mutex<DateTime<Utc>>>,
    router: Router,
}

impl App {
    pub fn new(db: PgPool) -> Self {
        Self::with(db, settings(), generous_limits())
    }

    pub fn with(db: PgPool, settings: Settings, limits: RateLimits) -> Self {
        let now = Arc::new(Mutex::new(start_time()));
        let clock = now.clone();
        let state = AppState::new(
            db.clone(),
            settings,
            passwords(),
            limits,
            Arc::new(move || *clock.lock().unwrap()),
        );
        let peer: SocketAddr = PEER.parse().unwrap();
        let router = taskmint_server::http::router(state.clone()).layer(MockConnectInfo(peer));
        Self {
            db,
            state,
            now,
            router,
        }
    }

    pub fn advance_ms(&self, ms: i64) {
        *self.now.lock().unwrap() += chrono::Duration::milliseconds(ms);
    }

    /// Runs a command for a signed-in browser; the reply, or the error.
    pub async fn call(&self, session: &Session, command: &str, args: Value) -> Res {
        self.post(&format!("/api/v1/commands/{command}"))
            .session(session)
            .json(args)
            .send()
            .await
    }

    /// Runs a command that must succeed; its reply.
    #[track_caller]
    pub fn ok(res: Res) -> Value {
        assert_eq!(res.status, StatusCode::OK, "{}", res.body);
        res.body
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

    /// A new API token of `scope` for the session's user; its secret.
    pub async fn token(&self, session: &Session, scope: &str) -> String {
        let res = self
            .post("/api/v1/tokens")
            .session(session)
            .json(json!({"name": scope, "scope": scope}))
            .send()
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.body);
        res.body["token"].as_str().unwrap().to_owned()
    }

    /// A desktop app's token for `username`, signed in with [`PASSWORD`].
    pub async fn device_token(&self, username: &str) -> String {
        let res = self
            .post("/api/v1/auth/device-token")
            .json(json!({"username": username, "password": PASSWORD, "deviceName": "Mac"}))
            .send()
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.body);
        res.body["token"].as_str().unwrap().to_owned()
    }

    /// Undoes [`App::fail_on`].
    pub async fn heal(&self, event: &str, table: &str) {
        sqlx::raw_sql(&format!("DROP TRIGGER fail_{event}_{table} ON {table}"))
            .execute(&self.db)
            .await
            .unwrap();
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

    /// Undoes [`App::break_table`].
    pub async fn mend_table(&self, table: &str) {
        sqlx::raw_sql(&format!("ALTER TABLE {table}_broken RENAME TO {table}"))
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

    /// Sends it and returns the response as it streams.
    pub async fn open(self) -> Stream {
        let request = self.request.body(self.body).unwrap();
        let response = self.app.router.clone().oneshot(request).await.unwrap();
        Stream {
            status: response.status(),
            headers: response.headers().clone(),
            body: response.into_body(),
            text: String::new(),
        }
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

/// A response read as it arrives: an event stream.
pub struct Stream {
    pub status: StatusCode,
    pub headers: HeaderMap,
    body: Body,
    text: String,
}

/// How long a test waits for a stream to say something.
const STREAM_WAIT: std::time::Duration = std::time::Duration::from_secs(5);

impl Stream {
    /// The next server-sent event: its name and its data. None when the
    /// stream ends.
    pub async fn next_event(&mut self) -> Option<(String, Value)> {
        loop {
            if let Some(end) = self.text.find("\n\n") {
                let block: String = self.text.drain(..end + 2).collect();
                let field = |name: &str| {
                    block
                        .lines()
                        .find_map(|line| line.strip_prefix(name))
                        .map(str::to_owned)
                };
                let (Some(event), Some(data)) = (field("event: "), field("data: ")) else {
                    continue;
                };
                return Some((event, serde_json::from_str(&data).unwrap()));
            }
            let frame = tokio::time::timeout(STREAM_WAIT, self.body.frame())
                .await
                .expect("the stream said nothing");
            let bytes = frame?.unwrap().into_data().unwrap();
            self.text.push_str(std::str::from_utf8(&bytes).unwrap());
        }
    }

    /// The next event's name.
    pub async fn next_name(&mut self) -> Option<String> {
        self.next_event().await.map(|(name, _)| name)
    }
}
