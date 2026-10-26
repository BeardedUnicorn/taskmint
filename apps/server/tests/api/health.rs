use axum::http::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::common::{settings, App, ORIGIN};

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn liveness_readiness_and_meta(db: PgPool) {
    let app = App::new(db);
    let res = app.get("/healthz").send().await;
    assert_eq!(
        (res.status, res.body.clone()),
        (StatusCode::OK, Value::from("ok"))
    );
    assert_eq!(res.headers["cache-control"], "no-store");
    assert_eq!(res.headers["x-content-type-options"], "nosniff");

    let res = app.get("/readyz").send().await;
    assert_eq!(
        (res.status, res.body),
        (StatusCode::OK, Value::from("ready"))
    );

    let res = app.get("/api/v1/meta").send().await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(
        res.body,
        json!({"version": env!("CARGO_PKG_VERSION"), "apiVersion": 1, "minDesktopVersion": "1.0.0"})
    );
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn not_ready_without_the_database(db: PgPool) {
    let app = App::new(db);
    app.db.close().await;
    let res = app.get("/readyz").send().await;
    assert_eq!(res.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(app.get("/healthz").send().await.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn unknown_paths_are_json_404s(db: PgPool) {
    let app = App::new(db);
    for path in ["/nope", "/api/v1/nope", "/api/v2/meta"] {
        app.get(path)
            .send()
            .await
            .expect(StatusCode::NOT_FOUND, "not_found");
    }
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn database_errors_are_opaque_500s(db: PgPool) {
    let app = App::new(db);
    app.db.close().await;
    let res = app
        .post("/api/v1/auth/login")
        .json(json!({"username": "root", "password": "whatever!"}))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    assert_eq!(res.body["error"], "internal error");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn cross_origin_writes_are_refused(db: PgPool) {
    let app = App::new(db);
    let login = || {
        app.post("/api/v1/auth/login")
            .json(json!({"username": "nobody", "password": "whatever!"}))
    };
    login()
        .header("sec-fetch-site", "cross-site")
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "cross_origin");
    login()
        .header("origin", "https://evil.example")
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "cross_origin");
    // Same origin, or not a browser at all: on to the handler.
    login()
        .header("origin", ORIGIN)
        .header("sec-fetch-site", "same-origin")
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "bad_credentials");
    login()
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "bad_credentials");
    // Reads are never refused.
    let res = app
        .get("/api/v1/meta")
        .header("sec-fetch-site", "cross-site")
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn bodies_are_checked(db: PgPool) {
    let mut settings = settings();
    settings.max_body_bytes = 1024;
    let app = App::with(db, settings, crate::common::generous_limits());
    let big = "x".repeat(2048);
    app.post("/api/v1/auth/login")
        .json(json!({"username": big, "password": "whatever!"}))
        .send()
        .await
        .expect(StatusCode::PAYLOAD_TOO_LARGE, "invalid_body");
    app.post("/api/v1/auth/login")
        .raw("application/json", "{not json")
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_body");
    app.post("/api/v1/auth/login")
        .json(json!({"username": "root"}))
        .send()
        .await
        .expect(StatusCode::UNPROCESSABLE_ENTITY, "invalid_body");
    app.post("/api/v1/auth/login")
        .raw("text/plain", "hello")
        .send()
        .await
        .expect(StatusCode::UNSUPPORTED_MEDIA_TYPE, "invalid_body");
}
