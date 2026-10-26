use axum::http::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::common::{App, Session};

async fn create(app: &App, session: &Session, name: &str, scope: &str) -> Value {
    let res = app
        .post("/api/v1/tokens")
        .session(session)
        .json(json!({"name": name, "scope": scope}))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.body);
    res.body
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn tokens_are_shown_once_and_listed_without_the_secret(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let list = || app.get("/api/v1/tokens").cookie(&session.cookie);
    assert_eq!(list().send().await.body, json!([]));

    let extension = create(&app, &session, " Chrome extension ", "capture").await;
    assert_eq!(extension["name"], "Chrome extension");
    assert_eq!(extension["scope"], "capture");
    assert_eq!(extension["kind"], "api");
    let secret = extension["token"].as_str().unwrap();
    assert!(secret.starts_with(extension["prefix"].as_str().unwrap()));
    let stored: Vec<u8> = sqlx::query_scalar("SELECT token_hash FROM api_tokens")
        .fetch_one(&app.db)
        .await
        .unwrap();
    assert_ne!(stored, secret.as_bytes());
    create(&app, &session, "script", "full").await;

    let res = list().send().await;
    assert_eq!(res.status, StatusCode::OK);
    let tokens = res.body.as_array().unwrap();
    assert_eq!(tokens.len(), 2);
    assert_eq!(tokens[0]["name"], "script");
    assert_eq!(tokens[1]["id"], extension["id"]);
    assert_eq!(tokens[1]["prefix"], extension["prefix"]);
    assert!(tokens[1]["lastUsedAt"].is_null());
    assert!(tokens.iter().all(|token| token.get("token").is_none()));
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn tokens_are_per_user_and_cookie_only(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let bob = app.member("bob").await;
    let token = create(&app, &alice, "script", "full").await;
    let secret = token["token"].as_str().unwrap();
    assert_eq!(
        app.get("/api/v1/tokens")
            .cookie(&bob.cookie)
            .send()
            .await
            .body,
        json!([])
    );
    let res = app
        .delete(&format!("/api/v1/tokens/{}", token["id"].as_str().unwrap()))
        .session(&bob)
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    // A token can't manage tokens.
    let res = app.get("/api/v1/tokens").bearer(secret).send().await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let res = app
        .post("/api/v1/tokens")
        .bearer(secret)
        .json(json!({"name": "more", "scope": "full"}))
        .send()
        .await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn revoking_a_token_stops_it_working(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let token = create(&app, &session, "script", "full").await;
    let secret = token["token"].as_str().unwrap();
    let revoke = || {
        app.delete(&format!("/api/v1/tokens/{}", token["id"].as_str().unwrap()))
            .session(&session)
    };
    assert_eq!(revoke().send().await.status, StatusCode::NO_CONTENT);
    revoke()
        .send()
        .await
        .expect(StatusCode::NOT_FOUND, "not_found");
    let res = app.get("/api/v1/auth/me").bearer(secret).send().await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    assert_eq!(
        app.get("/api/v1/tokens")
            .cookie(&session.cookie)
            .send()
            .await
            .body,
        json!([])
    );
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'token.revoke'")
        .await;
    assert_eq!(audited, 1);
    let res = app
        .delete("/api/v1/tokens/not-a-uuid")
        .session(&session)
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn token_requests_are_checked(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let create = |body: Value| app.post("/api/v1/tokens").session(&session).json(body);
    create(json!({"name": "", "scope": "full"}))
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_request");
    create(json!({"name": "x".repeat(101), "scope": "full"}))
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_request");
    create(json!({"name": "script", "scope": "admin"}))
        .send()
        .await
        .expect(StatusCode::UNPROCESSABLE_ENTITY, "invalid_body");
    let res = app
        .post("/api/v1/tokens")
        .cookie(&session.cookie)
        .json(json!({"name": "script", "scope": "full"}))
        .send()
        .await;
    res.expect(StatusCode::FORBIDDEN, "csrf");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn token_endpoints_report_database_failures(db: PgPool) {
    let app = App::new(db);
    let session = app.member("alice").await;
    let token = create(&app, &session, "script", "full").await;
    app.fail_on("INSERT", "api_tokens").await;
    let res = app
        .post("/api/v1/tokens")
        .session(&session)
        .json(json!({"name": "script", "scope": "full"}))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    app.fail_on("UPDATE", "api_tokens").await;
    let res = app
        .delete(&format!("/api/v1/tokens/{}", token["id"].as_str().unwrap()))
        .session(&session)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    app.break_table("api_tokens").await;
    let res = app
        .get("/api/v1/tokens")
        .cookie(&session.cookie)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}
