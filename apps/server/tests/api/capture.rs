use axum::http::{HeaderValue, StatusCode};
use serde_json::json;
use sqlx::PgPool;
use taskmint_core::contract::{CAPTURE_EXTENSION_ORIGIN, CAPTURE_HEADER, MAX_CAPTURE_BODY_BYTES};

use crate::common::{App, Req};

const PAYLOAD: &str = r#"{"workLogs": [], "timedWorkEntries": []}"#;

fn capture<'a>(app: &'a App, token: &str) -> Req<'a> {
    app.post("/api/v1/capture")
        .bearer(token)
        .header(CAPTURE_HEADER, "1")
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn the_extension_posts_a_capture_for_the_web_app_to_take(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let token = app.token(&alice, "capture").await;
    let mut events = app.state.events.subscribe(alice.user_id);

    let res = capture(&app, &token)
        .header("origin", CAPTURE_EXTENSION_ORIGIN)
        .raw("application/json", PAYLOAD)
        .send()
        .await;
    assert_eq!(
        (res.status, res.body),
        (StatusCode::OK, json!({ "status": "accepted" }))
    );
    let announced = events.try_recv().unwrap();
    assert_eq!(announced.name, "work-log-payload-captured");
    assert_eq!(
        announced.payload,
        json!({ "receivedAt": "2026-03-02T15:00:00+00:00" })
    );

    let taken = App::ok(
        app.call(&alice, "take_pending_work_log_capture", json!({}))
            .await,
    );
    assert_eq!(
        taken,
        json!({
            "payload": PAYLOAD,
            "receivedAt": "2026-03-02T15:00:00+00:00",
            "source": "extension"
        })
    );
    // Taken once
    let again = app
        .call(&alice, "take_pending_work_log_capture", json!({}))
        .await;
    assert_eq!(App::ok(again), json!(null));
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_capture_must_come_from_the_extension_with_its_header(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let token = app.token(&alice, "capture").await;

    for origin in [
        HeaderValue::from_static("https://evil.example"),
        HeaderValue::from_static("chrome-extension://abcdefghijklmnop"),
        HeaderValue::from_bytes(b"\xff").unwrap(),
    ] {
        capture(&app, &token)
            .header("origin", origin)
            .raw("application/json", PAYLOAD)
            .send()
            .await
            .expect(StatusCode::FORBIDDEN, "forbidden_origin");
    }
    app.post("/api/v1/capture")
        .bearer(&token)
        .raw("application/json", PAYLOAD)
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "missing_capture_header");
    app.post("/api/v1/capture")
        .header(CAPTURE_HEADER, "1")
        .raw("application/json", PAYLOAD)
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    capture(&app, "tmk_not_a_token")
        .raw("application/json", PAYLOAD)
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    // A full token works too, and a browser's cross-site marker doesn't
    // matter: only bearer tokens get here
    let full = app.token(&alice, "full").await;
    let res = capture(&app, &full)
        .header("sec-fetch-site", "cross-site")
        .raw("application/json", PAYLOAD)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    assert_eq!(app.count("SELECT count(*) FROM pending_captures").await, 1);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_capture_that_isnt_a_work_log_payload_is_refused(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let token = app.token(&alice, "capture").await;

    let res = capture(&app, &token)
        .raw("application/json", r#"{"other": 1}"#)
        .send()
        .await;
    res.expect(StatusCode::BAD_REQUEST, "rejected");
    assert_eq!(res.body["error"], "unexpected payload shape");
    capture(&app, &token)
        .raw("application/json", vec![0xff, 0xfe])
        .send()
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_body");
    let too_big = format!(
        r#"{{"workLogs": [], "pad": "{}"}}"#,
        "x".repeat(MAX_CAPTURE_BODY_BYTES)
    );
    capture(&app, &token)
        .raw("application/json", too_big)
        .send()
        .await
        .expect(StatusCode::PAYLOAD_TOO_LARGE, "invalid_body");
    assert_eq!(app.count("SELECT count(*) FROM pending_captures").await, 0);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn the_extensions_test_button_pings_with_its_token(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let token = app.token(&alice, "capture").await;

    let res = app
        .get("/api/v1/capture/ping")
        .bearer(&token)
        .header(CAPTURE_HEADER, "1")
        .send()
        .await;
    assert_eq!(
        (res.status, res.body),
        (
            StatusCode::OK,
            json!({ "app": "TaskMint", "version": env!("CARGO_PKG_VERSION"), "username": "alice" })
        )
    );
    app.get("/api/v1/capture/ping")
        .bearer(&token)
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "missing_capture_header");
}
