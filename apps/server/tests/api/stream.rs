use axum::http::StatusCode;
use serde_json::json;
use sqlx::PgPool;
use taskmint_core::command::Event;

use crate::common::{App, Session, Stream, PASSWORD};

async fn open(app: &App, session: &Session) -> Stream {
    let stream = app
        .get("/api/v1/events")
        .cookie(&session.cookie)
        .open()
        .await;
    assert_eq!(stream.status, StatusCode::OK);
    stream
}

async fn start(app: &App, session: &Session) {
    let tasks = json!({ "key": "predefinedTasks", "value": [
        { "id": "t1", "name": "Writing", "createdAt": "x", "updatedAt": "x" }
    ] });
    App::ok(app.call(session, "set_app_record", tasks).await);
    let start = json!({ "taskId": "t1", "taskName": "Writing" });
    App::ok(app.call(session, "start_task", start).await);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_users_changes_stream_as_named_events_with_json_data(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let mut stream = open(&app, &alice).await;
    assert_eq!(stream.headers["content-type"], "text/event-stream");

    start(&app, &alice).await;

    assert_eq!(
        stream.next_event().await.unwrap(),
        (
            "app-records-changed".to_string(),
            json!({ "key": "predefinedTasks", "revision": 1 })
        )
    );
    let (name, data) = stream.next_event().await.unwrap();
    assert_eq!(name, "timer-instance-started");
    assert_eq!(data["startTime"], "2026-03-02T15:00:00+00:00");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_stream_needs_a_session_or_a_full_token(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    app.get("/api/v1/events")
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let capture = app.token(&alice, "capture").await;
    app.get("/api/v1/events")
        .bearer(&capture)
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "insufficient_scope");

    let full = app.token(&alice, "full").await;
    let mut stream = app.get("/api/v1/events").bearer(&full).open().await;
    assert_eq!(stream.status, StatusCode::OK);
    App::ok(app.call(&alice, "reset_all_app_data", json!({})).await);
    // After a reset, every view of the data reads it again
    assert_eq!(stream.next_name().await.unwrap(), "resync");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_stream_that_falls_behind_is_told_to_resync(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let mut stream = open(&app, &alice).await;
    let flood: Vec<Event> = (0..100)
        .map(|n| Event::new("sessions-changed", json!({ "n": n })))
        .collect();
    app.state.events.publish(alice.user_id, &flood);

    assert_eq!(stream.next_name().await.unwrap(), "resync");
    // Then what it still holds
    let (name, data) = stream.next_event().await.unwrap();
    assert_eq!(name, "sessions-changed");
    assert_eq!(data, json!({ "n": 36 }));
}

/// Opens a stream for `session`, does `act`, and expects the stream to end.
async fn ends_when<F: std::future::Future<Output = ()>>(app: &App, session: &Session, act: F) {
    let mut stream = open(app, session).await;
    act.await;
    assert_eq!(stream.next_event().await, None);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn streams_end_when_who_can_act_as_the_user_changes(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let alice = app.member("alice").await;

    // Signing out
    let other = app.login("alice").await;
    ends_when(&app, &alice, async {
        let res = app.post("/api/v1/auth/logout").session(&other).send().await;
        assert_eq!(res.status, StatusCode::NO_CONTENT);
    })
    .await;
    // Changing the password
    ends_when(&app, &alice, async {
        let change = json!({ "currentPassword": PASSWORD, "newPassword": PASSWORD });
        let res = app
            .post("/api/v1/auth/password")
            .session(&alice)
            .json(change)
            .send()
            .await;
        assert_eq!(res.status, StatusCode::NO_CONTENT, "{}", res.body);
    })
    .await;
    // Revoking a token
    let token = app.token(&alice, "full").await;
    let id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM api_tokens WHERE revoked_at IS NULL")
        .fetch_one(&app.db)
        .await
        .unwrap();
    ends_when(&app, &alice, async {
        let res = app
            .delete(&format!("/api/v1/tokens/{id}"))
            .session(&alice)
            .send()
            .await;
        assert_eq!(res.status, StatusCode::NO_CONTENT);
    })
    .await;
    assert_eq!(
        app.get("/api/v1/events").bearer(&token).send().await.status,
        StatusCode::UNAUTHORIZED
    );
    // A password reset
    let link = app
        .post(&format!(
            "/api/v1/admin/users/{}/password-reset",
            alice.user_id
        ))
        .session(&admin)
        .send()
        .await;
    let reset = link.body["url"]
        .as_str()
        .unwrap()
        .rsplit('/')
        .next()
        .unwrap()
        .to_owned();
    ends_when(&app, &alice, async {
        let res = app
            .post(&format!("/api/v1/password-resets/{reset}/accept"))
            .json(json!({ "password": PASSWORD }))
            .send()
            .await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    })
    .await;
    // Being disabled
    let alice = app.login("alice").await;
    ends_when(&app, &alice, async {
        let res = app
            .patch(&format!("/api/v1/admin/users/{}", alice.user_id))
            .session(&admin)
            .json(json!({ "disabled": true }))
            .send()
            .await;
        assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    })
    .await;
    assert_eq!(app.state.events.users(), 0);
}
