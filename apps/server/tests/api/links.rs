use axum::http::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::common::{settings, strict_limits, App, Session, PASSWORD};

/// The token at the end of a link like `http://…/invite/<token>`.
fn token(link: &Value) -> String {
    link["url"]
        .as_str()
        .unwrap()
        .rsplit('/')
        .next()
        .unwrap()
        .to_owned()
}

async fn invite(app: &App, admin: &Session, role: &str) -> String {
    let res = app
        .post("/api/v1/admin/invites")
        .session(admin)
        .json(json!({"role": role}))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.body);
    token(&res.body)
}

async fn reset_link(app: &App, admin: &Session, user: uuid::Uuid) -> String {
    let res = app
        .post(&format!("/api/v1/admin/users/{user}/password-reset"))
        .session(admin)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.body);
    token(&res.body)
}

fn account(username: &str) -> Value {
    json!({"username": username, "password": PASSWORD, "displayName": " Alice A. "})
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn an_invite_creates_an_account_and_signs_it_in(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let token = invite(&app, &admin, "admin").await;

    let res = app.get(&format!("/api/v1/invites/{token}")).send().await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["role"], "admin");
    assert!(res.body["expiresAt"].is_string());

    let res = app
        .post(&format!("/api/v1/invites/{token}/accept"))
        .header("user-agent", "Invitee/2")
        .json(account("Alice"))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    assert_eq!(res.body["user"]["username"], "alice");
    assert_eq!(res.body["user"]["displayName"], "Alice A.");
    assert_eq!(res.body["user"]["role"], "admin");
    let session = Session::from(&res);
    let res = app
        .get("/api/v1/auth/me")
        .cookie(&session.cookie)
        .send()
        .await;
    assert_eq!(res.body["user"]["username"], "alice");

    let used_by: uuid::Uuid =
        sqlx::query_scalar("SELECT used_by FROM invites WHERE used_at IS NOT NULL")
            .fetch_one(&app.db)
            .await
            .unwrap();
    assert_eq!(used_by, session.user_id);
    let agent: String =
        sqlx::query_scalar("SELECT user_agent FROM auth_sessions WHERE user_id = $1")
            .bind(session.user_id)
            .fetch_one(&app.db)
            .await
            .unwrap();
    assert_eq!(agent, "Invitee/2");
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'invite.accept'")
        .await;
    assert_eq!(audited, 1);

    // Single use.
    let res = app.get(&format!("/api/v1/invites/{token}")).send().await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    let res = app
        .post(&format!("/api/v1/invites/{token}/accept"))
        .json(account("bob"))
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn revoked_expired_and_unknown_invites_are_gone(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let revoked = invite(&app, &admin, "user").await;
    let expired = invite(&app, &admin, "user").await;
    sqlx::query("UPDATE invites SET revoked_at = now() WHERE id = (SELECT id FROM invites ORDER BY created_at LIMIT 1)")
        .execute(&app.db)
        .await
        .unwrap();
    sqlx::query("UPDATE invites SET expires_at = now() WHERE revoked_at IS NULL")
        .execute(&app.db)
        .await
        .unwrap();
    for token in [revoked.as_str(), expired.as_str(), "unknown"] {
        let res = app.get(&format!("/api/v1/invites/{token}")).send().await;
        res.expect(StatusCode::NOT_FOUND, "not_found");
        let res = app
            .post(&format!("/api/v1/invites/{token}/accept"))
            .json(account("alice"))
            .send()
            .await;
        res.expect(StatusCode::NOT_FOUND, "not_found");
    }
    assert_eq!(app.count("SELECT count(*) FROM users").await, 1);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn accepting_checks_the_new_account(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let token = invite(&app, &admin, "user").await;
    let accept = |body: Value| {
        app.post(&format!("/api/v1/invites/{token}/accept"))
            .json(body)
    };
    for body in [
        json!({"username": "no spaces", "password": PASSWORD}),
        json!({"username": "alice", "password": "short"}),
        json!({"username": "alice", "password": PASSWORD, "displayName": "x".repeat(101)}),
    ] {
        accept(body)
            .send()
            .await
            .expect(StatusCode::BAD_REQUEST, "invalid_request");
    }
    // A taken username leaves the invite usable.
    accept(json!({"username": "ROOT", "password": PASSWORD}))
        .send()
        .await
        .expect(StatusCode::CONFLICT, "username_taken");
    let res = accept(json!({"username": "alice", "password": PASSWORD}))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    assert_eq!(res.body["user"]["displayName"], "");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn invite_endpoints_report_database_failures(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let token = invite(&app, &admin, "user").await;
    app.fail_on("INSERT", "auth_sessions").await;
    let res = app
        .post(&format!("/api/v1/invites/{token}/accept"))
        .json(account("alice"))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    app.break_table("invites").await;
    let res = app.get(&format!("/api/v1/invites/{token}")).send().await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn public_link_endpoints_are_rate_limited(db: PgPool) {
    // One request per client per hour: the first uses it up.
    let app = App::with(db, settings(), strict_limits());
    let res = app.get("/api/v1/invites/x").send().await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    let body = json!({"username": "alice", "password": PASSWORD});
    for res in [
        app.get("/api/v1/invites/x").send().await,
        app.post("/api/v1/invites/x/accept")
            .json(body.clone())
            .send()
            .await,
        app.get("/api/v1/password-resets/x").send().await,
        app.post("/api/v1/password-resets/x/accept")
            .json(body)
            .send()
            .await,
    ] {
        res.expect(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    }
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_reset_link_sets_a_new_password_and_signs_out_everywhere(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let alice = app.member("alice").await;
    let token = reset_link(&app, &admin, alice.user_id).await;

    let res = app
        .get(&format!("/api/v1/password-resets/{token}"))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["username"], "alice");

    let res = app
        .post(&format!("/api/v1/password-resets/{token}/accept"))
        .json(json!({"password": "a brand new one"}))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    assert_eq!(res.body["user"]["username"], "alice");
    let session = Session::from(&res);
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
        .cookie(&alice.cookie)
        .send()
        .await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let res = app
        .post("/api/v1/auth/login")
        .json(json!({"username": "alice", "password": "a brand new one"}))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'password_reset.accept'")
        .await;
    assert_eq!(audited, 1);

    // Single use.
    let res = app
        .post(&format!("/api/v1/password-resets/{token}/accept"))
        .json(json!({"password": "yet another one"}))
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    let res = app
        .get(&format!("/api/v1/password-resets/{token}"))
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn reset_links_are_checked(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let alice = app.member("alice").await;
    let token = reset_link(&app, &admin, alice.user_id).await;
    let accept = |password: &str| {
        app.post(&format!("/api/v1/password-resets/{token}/accept"))
            .json(json!({"password": password}))
    };
    accept("short")
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_request");
    app.fail_on("INSERT", "audit_events").await;
    accept(PASSWORD)
        .send()
        .await
        .expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    sqlx::raw_sql("DROP TRIGGER fail_INSERT_audit_events ON audit_events")
        .execute(&app.db)
        .await
        .unwrap();
    // A disabled user's link doesn't work.
    sqlx::query("UPDATE users SET disabled_at = now() WHERE username = 'alice'")
        .execute(&app.db)
        .await
        .unwrap();
    accept(PASSWORD)
        .send()
        .await
        .expect(StatusCode::NOT_FOUND, "not_found");
    let res = app
        .get(&format!("/api/v1/password-resets/{token}"))
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    app.break_table("password_resets").await;
    let res = app
        .get(&format!("/api/v1/password-resets/{token}"))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}
