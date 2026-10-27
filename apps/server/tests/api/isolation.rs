//! One account's data is its own: no command names a user, so every one
//! runs on the caller's workspace, and nothing another account does reaches
//! it (or its event streams).

use axum::http::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;
use taskmint_core::contract::CAPTURE_HEADER;
use tokio::sync::broadcast::error::TryRecvError;

use crate::common::{App, Session};

/// Alice tracks time, keeps records, imports a ledger and captures a payload.
async fn alices_data(app: &App, alice: &Session) -> (String, String) {
    let tasks = json!({ "key": "predefinedTasks", "value": [
        { "id": "t1", "name": "Writing", "createdAt": "x", "updatedAt": "x" }
    ] });
    App::ok(app.call(alice, "set_app_record", tasks).await);
    let start = json!({ "taskId": "t1", "taskName": "Writing" });
    let started = App::ok(app.call(alice, "start_task", start).await);
    let import = json!({ "payload": {
        "entries": [{ "id": "e1", "kind": "workLog" }],
        "mappings": [{ "projectId": "p1", "taskId": "t1", "taskName": "Writing" }]
    } });
    App::ok(app.call(alice, "apply_work_log_import", import).await);
    let token = app.token(alice, "capture").await;
    let res = app
        .post("/api/v1/capture")
        .bearer(&token)
        .header(CAPTURE_HEADER, "1")
        .raw("application/json", r#"{"workLogs": []}"#)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    let sessions = App::ok(app.call(alice, "get_sessions", json!({})).await);
    (
        sessions[0]["id"].as_str().unwrap().to_owned(),
        started["instanceId"].as_str().unwrap().to_owned(),
    )
}

async fn snapshot(app: &App, session: &Session) -> Vec<Value> {
    let mut seen = Vec::new();
    for command in ["get_sessions", "get_app_records", "get_work_logs"] {
        seen.push(App::ok(app.call(session, command, json!({})).await));
    }
    seen
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn one_account_never_sees_or_changes_anothers_data(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let bob = app.member("bob").await;
    let mut bobs_events = app.state.events.subscribe(bob.user_id);
    let (session_id, instance_id) = alices_data(&app, &alice).await;
    let alice_before = snapshot(&app, &alice).await;

    // Bob sees nothing of hers
    assert_eq!(bobs_events.try_recv(), Err(TryRecvError::Empty));
    let [sessions, records, logs] = <[Value; 3]>::try_from(snapshot(&app, &bob).await).unwrap();
    assert_eq!(sessions, json!([]));
    assert_eq!(records["records"], json!({}));
    assert_eq!(records["revisions"]["predefinedTasks"], 0);
    assert_eq!(logs["entries"], json!([]));
    assert_eq!(logs["mappings"], json!([]));
    let taken = app
        .call(&bob, "take_pending_work_log_capture", json!({}))
        .await;
    assert_eq!(App::ok(taken), Value::Null);

    // Her ids mean nothing to him
    let stop = app
        .call(
            &bob,
            "stop_timer_instance",
            json!({ "instanceId": instance_id }),
        )
        .await;
    stop.expect(StatusCode::BAD_REQUEST, "rejected");
    assert_eq!(
        stop.body["error"],
        format!("Timer instance with ID {instance_id} not found")
    );
    app.call(&bob, "delete_session", json!({ "sessionId": session_id }))
        .await
        .expect(StatusCode::BAD_REQUEST, "rejected");
    // His saves and his reset are his alone, even with her record's revision
    let save = json!({ "key": "predefinedTasks", "value": [], "baseRevision": 0 });
    App::ok(app.call(&bob, "set_app_record", save).await);
    App::ok(app.call(&bob, "reset_all_app_data", json!({})).await);
    assert_eq!(bobs_events.try_recv().unwrap().name, "app-records-changed");

    assert_eq!(snapshot(&app, &alice).await, alice_before);
    let taken = App::ok(
        app.call(&alice, "take_pending_work_log_capture", json!({}))
            .await,
    );
    assert_eq!(taken["payload"], r#"{"workLogs": []}"#);
    // Every row is filed under its owner
    for table in [
        "sessions",
        "work_log_entries",
        "project_mappings",
        "app_records",
    ] {
        let others: i64 =
            sqlx::query_scalar(&format!("SELECT count(*) FROM {table} WHERE user_id <> $1"))
                .bind(alice.user_id)
                .fetch_one(&app.db)
                .await
                .unwrap();
        assert_eq!(others, 0, "{table}");
    }
}
