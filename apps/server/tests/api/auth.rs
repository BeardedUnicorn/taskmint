use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::PgPool;

use crate::common::{generous_limits, settings, strict_limits, App, Session, PASSWORD};

fn credentials(username: &str, password: &str) -> serde_json::Value {
    json!({"username": username, "password": password})
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn login_sets_a_strict_http_only_cookie(db: PgPool) {
    let app = App::new(db);
    let id = app.user("alice", "user").await;
    let res = app
        .post("/api/v1/auth/login")
        .header("user-agent", "TestBrowser/1.0")
        .json(credentials(" Alice ", PASSWORD))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    let cookie = res.set_cookie().unwrap();
    assert!(cookie.starts_with("taskmint_session="), "{cookie}");
    for attribute in ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=2592000"] {
        assert!(cookie.contains(attribute), "{cookie} lacks {attribute}");
    }
    assert!(!cookie.contains("Secure"), "{cookie}");
    assert_eq!(res.body["user"]["id"], id.to_string());
    assert_eq!(res.body["user"]["username"], "alice");
    assert_eq!(res.body["user"]["role"], "user");
    assert_eq!(res.body["user"]["timeZone"], "UTC");
    assert!(res.body["user"].get("passwordHash").is_none());
    assert_eq!(res.body["csrfToken"].as_str().unwrap().len(), 43);
    let (agent, ip): (String, String) =
        sqlx::query_as("SELECT user_agent, ip FROM auth_sessions WHERE user_id = $1")
            .bind(id)
            .fetch_one(&app.db)
            .await
            .unwrap();
    assert_eq!(
        (agent.as_str(), ip.as_str()),
        ("TestBrowser/1.0", "198.51.100.7")
    );
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn secure_cookies_use_the_host_prefix(db: PgPool) {
    let mut settings = settings();
    settings.cookie_secure = true;
    let app = App::with(db, settings, generous_limits());
    app.user("alice", "user").await;
    let res = app
        .post("/api/v1/auth/login")
        .json(credentials("alice", PASSWORD))
        .send()
        .await;
    let cookie = res.set_cookie().unwrap();
    assert!(cookie.starts_with("__Host-taskmint_session="), "{cookie}");
    assert!(cookie.contains("Secure"), "{cookie}");
    let session = Session::from(&res);
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&session.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn wrong_unknown_and_disabled_all_look_the_same(db: PgPool) {
    let app = App::new(db);
    app.user("alice", "user").await;
    let disabled = app.user("bob", "user").await;
    sqlx::query("UPDATE users SET disabled_at = now() WHERE id = $1")
        .bind(disabled)
        .execute(&app.db)
        .await
        .unwrap();
    for (username, password) in [
        ("alice", "wrong password"),
        ("nobody", PASSWORD),
        ("bob", PASSWORD),
    ] {
        let res = app
            .post("/api/v1/auth/login")
            .json(credentials(username, password))
            .send()
            .await;
        res.expect(StatusCode::UNAUTHORIZED, "bad_credentials");
        assert!(res.set_cookie().is_none());
    }
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn login_is_rate_limited(db: PgPool) {
    let app = App::with(db, settings(), strict_limits());
    app.user("alice", "user").await;
    let attempt = || {
        app.post("/api/v1/auth/login")
            .json(credentials("alice", "wrong password"))
    };
    attempt()
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "bad_credentials");
    let res = attempt().send().await;
    res.expect(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    let retry: u64 = res.headers["retry-after"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((1..=3600).contains(&retry), "{retry}");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn the_account_limit_applies_per_username(db: PgPool) {
    use governor::Quota;
    use std::num::NonZeroU32;
    let limits = taskmint_server::ratelimit::RateLimits::new(
        Quota::per_hour(NonZeroU32::new(100).unwrap()),
        Quota::per_hour(NonZeroU32::new(1).unwrap()),
        100_000,
    );
    let app = App::with(db, settings(), limits);
    app.user("alice", "user").await;
    let attempt = |name: &str| {
        app.post("/api/v1/auth/login")
            .json(credentials(name, "wrong password"))
    };
    attempt("alice")
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "bad_credentials");
    attempt("ALICE")
        .send()
        .await
        .expect(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    attempt("carol")
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "bad_credentials");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn login_clears_the_users_expired_sessions(db: PgPool) {
    let app = App::new(db);
    let id = app.user("alice", "user").await;
    sqlx::query(
        "INSERT INTO auth_sessions (token_hash, csrf_token, user_id, expires_at)
         VALUES ('\\x00', 'x', $1, now() - interval '1 day')",
    )
    .bind(id)
    .execute(&app.db)
    .await
    .unwrap();
    app.login("alice").await;
    assert_eq!(app.count("SELECT count(*) FROM auth_sessions").await, 1);
    assert_eq!(
        app.count("SELECT count(*) FROM auth_sessions WHERE expires_at <= now()")
            .await,
        0
    );
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn login_fails_cleanly_when_the_database_does(db: PgPool) {
    let app = App::new(db);
    app.user("alice", "user").await;
    app.fail_on("INSERT", "auth_sessions").await;
    let res = app
        .post("/api/v1/auth/login")
        .json(credentials("alice", PASSWORD))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    app.break_table("users").await;
    let res = app
        .post("/api/v1/auth/login")
        .json(credentials("alice", PASSWORD))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn me_returns_the_user_and_slides_the_session(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    sqlx::query("UPDATE auth_sessions SET expires_at = now() + interval '1 hour'")
        .execute(&app.db)
        .await
        .unwrap();
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&session.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["user"]["username"], "alice");
    assert_eq!(res.body["csrfToken"], session.csrf.as_str());
    // The cookie is re-issued with a fresh Max-Age...
    assert_eq!(res.session_cookie().unwrap(), session.cookie);
    assert!(res.set_cookie().unwrap().contains("Max-Age=2592000"));
    // ...and the session row's expiry moved to 30 days out.
    let expires: DateTime<Utc> = sqlx::query_scalar("SELECT expires_at FROM auth_sessions")
        .fetch_one(&app.db)
        .await
        .unwrap();
    assert!(expires > Utc::now() + chrono::TimeDelta::days(29));
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn me_needs_a_live_session(db: PgPool) {
    let app = App::new(db);
    let unauthenticated =
        |res: crate::common::Res| res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    unauthenticated(app.get("/api/v1/auth/me").send().await);
    unauthenticated(
        app.get("/api/v1/auth/me")
            .cookie("taskmint_session=forged")
            .send()
            .await,
    );
    unauthenticated(
        app.get("/api/v1/auth/me")
            .cookie("other=cookie")
            .send()
            .await,
    );

    let session = app.member("alice").await;
    sqlx::query("UPDATE auth_sessions SET expires_at = now() - interval '1 second'")
        .execute(&app.db)
        .await
        .unwrap();
    unauthenticated(
        app.get("/api/v1/auth/me")
            .cookie(&session.cookie)
            .send()
            .await,
    );

    let session = app.login("alice").await;
    sqlx::query("UPDATE users SET disabled_at = now()")
        .execute(&app.db)
        .await
        .unwrap();
    unauthenticated(
        app.get("/api/v1/auth/me")
            .cookie(&session.cookie)
            .send()
            .await,
    );
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn session_lookup_failures_are_500s(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    app.db.close().await;
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&session.cookie)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    let res = app
        .get("/api/v1/auth/me")
        .bearer("tmk_whatever")
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn unsafe_cookie_requests_need_the_csrf_token(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let res = app
        .post("/api/v1/auth/logout")
        .cookie(&session.cookie)
        .send()
        .await;
    res.expect(StatusCode::FORBIDDEN, "csrf");
    let res = app
        .post("/api/v1/auth/logout")
        .cookie(&session.cookie)
        .header("x-csrf-token", "wrong")
        .send()
        .await;
    res.expect(StatusCode::FORBIDDEN, "csrf");
    // Still signed in.
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&session.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn logout_ends_the_session_and_clears_the_cookie(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let other = app.login("alice").await;
    let res = app
        .post("/api/v1/auth/logout")
        .session(&session)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::NO_CONTENT);
    let cookie = res.set_cookie().unwrap();
    assert!(cookie.starts_with("taskmint_session=;"), "{cookie}");
    assert!(cookie.contains("Max-Age=0"), "{cookie}");
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&session.cookie)
        .send()
        .await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    // Only this session.
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&other.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn logout_reports_database_failures(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    app.fail_on("DELETE", "auth_sessions").await;
    let res = app
        .post("/api/v1/auth/logout")
        .session(&session)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

fn password_change(current: &str, new: &str) -> serde_json::Value {
    json!({"currentPassword": current, "newPassword": new})
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn changing_the_password_signs_out_other_sessions(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let other = app.login("alice").await;
    let res = app
        .post("/api/v1/auth/password")
        .session(&session)
        .json(password_change(PASSWORD, "a brand new one"))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.body);
    assert_eq!(
        app.get("/api/v1/auth/me")
            .cookie(&session.cookie)
            .send()
            .await
            .status,
        StatusCode::OK
    );
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&other.cookie)
        .send()
        .await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let res = app
        .post("/api/v1/auth/login")
        .json(credentials("alice", "a brand new one"))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'password.change' AND ip = '198.51.100.7'")
        .await;
    assert_eq!(audited, 1);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn password_changes_are_checked(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let change = |current: &str, new: &str| {
        app.post("/api/v1/auth/password")
            .session(&session)
            .json(password_change(current, new))
    };
    change("not my password", "a brand new one")
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "wrong_password");
    change(PASSWORD, "short")
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_request");
    app.fail_on("INSERT", "audit_events").await;
    change(PASSWORD, "a brand new one")
        .send()
        .await
        .expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    // Nothing changed.
    let res = app
        .post("/api/v1/auth/login")
        .json(credentials("alice", PASSWORD))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn password_changes_are_rate_limited(db: PgPool) {
    let app = App::new(db.clone());
    app.user("alice", "user").await;
    let session = app.login("alice").await;
    let strict = App::with(db, settings(), strict_limits());
    let change = || {
        strict
            .post("/api/v1/auth/password")
            .session(&session)
            .json(password_change("not my password", "a brand new one"))
    };
    change()
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "wrong_password");
    change()
        .send()
        .await
        .expect(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
}

fn device(username: &str, password: &str, name: &str) -> serde_json::Value {
    json!({"username": username, "password": password, "deviceName": name})
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn device_tokens_sign_in_the_desktop_app(db: PgPool) {
    let app = App::new(db);
    let id = app.user("alice", "user").await;
    let res = app
        .post("/api/v1/auth/device-token")
        .json(device("alice", PASSWORD, "  Alice's MacBook  "))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.body);
    let token = res.body["token"].as_str().unwrap();
    assert!(token.starts_with("tmk_"));
    assert_eq!(res.body["name"], "Alice's MacBook");
    assert_eq!(res.body["scope"], "full");
    assert_eq!(res.body["kind"], "device");
    assert_eq!(res.body["prefix"], &token[..10]);
    assert_eq!(res.body["user"]["id"], id.to_string());
    assert!(res.set_cookie().is_none());

    let res = app.get("/api/v1/auth/me").bearer(token).send().await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["user"]["username"], "alice");
    assert!(res.body["csrfToken"].is_null());
    assert!(res.set_cookie().is_none());
    let last_used = app
        .count("SELECT count(*) FROM api_tokens WHERE last_used_at IS NOT NULL")
        .await;
    assert_eq!(last_used, 1);
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'token.create'")
        .await;
    assert_eq!(audited, 1);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn device_token_requests_are_checked(db: PgPool) {
    let app = App::new(db);
    app.user("alice", "user").await;
    let request = |body| app.post("/api/v1/auth/device-token").json(body);
    request(device("alice", PASSWORD, "   "))
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_request");
    request(device("alice", "wrong password", "Mac"))
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "bad_credentials");
    app.fail_on("INSERT", "api_tokens").await;
    request(device("alice", PASSWORD, "Mac"))
        .send()
        .await
        .expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_device_token_signs_itself_out(db: PgPool) {
    let app = App::new(db);
    app.user("alice", "user").await;
    let sign_in = || {
        app.post("/api/v1/auth/device-token")
            .json(device("alice", PASSWORD, "Mac"))
    };
    let token = sign_in().send().await.body["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let sign_out = |token: &str| app.delete("/api/v1/auth/device-token").bearer(token);

    assert_eq!(sign_out(&token).send().await.status, StatusCode::NO_CONTENT);
    app.get("/api/v1/auth/me")
        .bearer(&token)
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'token.revoke'")
        .await;
    assert_eq!(audited, 1);

    // Once only, and only with a token
    sign_out(&token)
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    app.delete("/api/v1/auth/device-token")
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");

    let token = sign_in().send().await.body["token"]
        .as_str()
        .unwrap()
        .to_owned();
    app.fail_on("UPDATE", "api_tokens").await;
    sign_out(&token)
        .send()
        .await
        .expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn bearer_tokens_need_the_full_scope_and_a_live_user(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let create = |scope: &str| {
        app.post("/api/v1/tokens")
            .session(&session)
            .json(json!({"name": "script", "scope": scope}))
    };
    let capture = create("capture").send().await.body["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let full = create("full").send().await.body["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let me = |token: &str| app.get("/api/v1/auth/me").bearer(token);
    me(&capture)
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "insufficient_scope");
    assert_eq!(me(&full).send().await.status, StatusCode::OK);
    me("tmk_forged")
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");

    // Not a bearer token: the cookie (absent here) decides.
    let res = app
        .get("/api/v1/auth/me")
        .header("authorization", "Basic YTpi")
        .send()
        .await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let res = app
        .get("/api/v1/auth/me")
        .header(
            "authorization",
            axum::http::HeaderValue::from_bytes(b"Bearer \xff").unwrap(),
        )
        .cookie(&session.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);

    sqlx::query("UPDATE users SET disabled_at = now()")
        .execute(&app.db)
        .await
        .unwrap();
    me(&full)
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn behind_a_proxy_the_client_is_the_last_forwarded_hop(db: PgPool) {
    let mut settings = settings();
    settings.trust_proxy = true;
    let app = App::with(db, settings, generous_limits());
    app.user("alice", "user").await;
    let forwarded = [
        Some(axum::http::HeaderValue::from_static("203.0.113.9")),
        Some(axum::http::HeaderValue::from_static(
            "192.0.2.1, 203.0.113.10",
        )),
        Some(axum::http::HeaderValue::from_static("not an address")),
        Some(axum::http::HeaderValue::from_bytes(b"\xff").unwrap()),
        None,
    ];
    for header in forwarded {
        let mut request = app
            .post("/api/v1/auth/login")
            .json(credentials("alice", PASSWORD));
        if let Some(value) = header {
            request = request.header("x-forwarded-for", value);
        }
        assert_eq!(request.send().await.status, StatusCode::OK);
    }
    let mut ips: Vec<String> = sqlx::query_scalar("SELECT ip FROM auth_sessions")
        .fetch_all(&app.db)
        .await
        .unwrap();
    ips.sort();
    assert_eq!(
        ips,
        [
            "198.51.100.7",
            "198.51.100.7",
            "198.51.100.7",
            "203.0.113.10",
            "203.0.113.9"
        ]
    );
}
