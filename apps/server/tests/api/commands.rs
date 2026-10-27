use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::Utc;
use serde_json::{json, Value};
use sqlx::PgPool;
use taskmint_core::command::Command;
use taskmint_core::contract::{ERR_RECORD_CONFLICT, TIME_ZONE_HEADER};
use taskmint_core::DayZone;
use taskmint_server::state::AppState;
use taskmint_server::workspace;
use uuid::Uuid;

use crate::common::{generous_limits, passwords, settings, App, Session};

fn task(id: &str, name: &str) -> Value {
    json!({ "id": id, "name": name, "createdAt": "x", "updatedAt": "x" })
}

async fn with_tasks(app: &App, session: &Session) {
    let tasks = json!({ "key": "predefinedTasks", "value": [task("t1", "Writing")] });
    App::ok(app.call(session, "set_app_record", tasks).await);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn commands_run_with_the_desktops_names_replies_and_errors(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    with_tasks(&app, &alice).await;

    let started = App::ok(
        app.call(
            &alice,
            "start_task",
            json!({ "taskId": "t1", "taskName": "Writing" }),
        )
        .await,
    );
    assert_eq!(started["outcome"], "started");
    let sessions = App::ok(app.call(&alice, "get_sessions", json!({})).await);
    assert_eq!(
        sessions[0]["timerInstances"][0]["id"],
        started["instanceId"]
    );

    // Core's refusals, word for word
    let res = app
        .call(
            &alice,
            "pause_timer_instance",
            json!({ "instanceId": "gone" }),
        )
        .await;
    res.expect(StatusCode::BAD_REQUEST, "rejected");
    assert_eq!(res.body["error"], "Timer instance with ID gone not found");
    let res = app.call(&alice, "delete_session", json!({})).await;
    res.expect(StatusCode::BAD_REQUEST, "invalid_args");
    assert_eq!(
        res.body["error"],
        "Invalid arguments for delete_session: missing field `sessionId`"
    );
    let res = app.call(&alice, "launch", json!({})).await;
    res.expect(StatusCode::NOT_FOUND, "unknown_command");
    assert_eq!(res.body["error"], "Unknown command: launch");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_command_takes_json_arguments_or_none(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let path = "/api/v1/commands/get_sessions";

    // No body, or null: no arguments
    let res = app.post(path).session(&alice).send().await;
    assert_eq!((res.status, res.body.clone()), (StatusCode::OK, json!([])));
    let res = app
        .post(path)
        .session(&alice)
        .json(Value::Null)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);

    let res = app
        .post(path)
        .session(&alice)
        .raw("application/json", "{not json")
        .send()
        .await;
    res.expect(StatusCode::BAD_REQUEST, "invalid_body");
    assert!(res.body["error"]
        .as_str()
        .unwrap()
        .starts_with("the arguments aren't JSON: "));
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_body_past_the_limit_is_refused(db: PgPool) {
    let mut small = settings();
    small.max_body_bytes = 64;
    let app = App::with(db, small, generous_limits());
    let alice = app.member("alice").await;
    let res = app
        .post("/api/v1/commands/get_sessions")
        .session(&alice)
        .raw("application/json", format!("\"{}\"", "x".repeat(100)))
        .send()
        .await;
    res.expect(StatusCode::PAYLOAD_TOO_LARGE, "invalid_body");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn commands_need_a_session_with_its_csrf_token_or_a_full_token(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let path = "/api/v1/commands/get_sessions";

    app.post(path)
        .send()
        .await
        .expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    app.post(path)
        .cookie(&alice.cookie)
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "csrf");
    let capture = app.token(&alice, "capture").await;
    app.post(path)
        .bearer(&capture)
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "insufficient_scope");
    let full = app.token(&alice, "full").await;
    assert_eq!(
        app.post(path).bearer(&full).send().await.status,
        StatusCode::OK
    );
    // Cross-site, even signed in
    app.post(path)
        .session(&alice)
        .header("sec-fetch-site", "cross-site")
        .send()
        .await
        .expect(StatusCode::FORBIDDEN, "cross_origin");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn sessions_are_dated_in_the_clients_zone_else_the_accounts(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    // 02:00-07:00 UTC on 2 March: still 1 March in Los Angeles. Each entry
    // gets an hour of its own (they can't overlap).
    let hour = std::sync::atomic::AtomicU32::new(2);
    let date = |res: crate::common::Res| App::ok(res)["date"].clone();
    let add = |zone: Option<&'static str>| {
        let at = hour.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let entry = json!({
            "taskId": "t1",
            "taskName": "Writing",
            "startTime": format!("2026-03-02T{at:02}:00:00Z"),
            "durationMs": 60000
        });
        let mut req = app
            .post("/api/v1/commands/add_manual_time")
            .session(&alice)
            .json(entry);
        if let Some(zone) = zone {
            req = req.header(TIME_ZONE_HEADER, zone);
        }
        req.send()
    };

    assert_eq!(date(add(None).await), "2026-03-02");
    assert_eq!(date(add(Some("America/Los_Angeles")).await), "2026-03-01");
    sqlx::query("UPDATE users SET time_zone = 'America/Los_Angeles'")
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(date(add(None).await), "2026-03-01");
    assert_eq!(date(add(Some("Asia/Tokyo")).await), "2026-03-02");

    add(Some("Mars/Olympus_Mons"))
        .await
        .expect(StatusCode::BAD_REQUEST, "invalid_time_zone");
    // A stored zone that isn't one: UTC
    sqlx::query("UPDATE users SET time_zone = 'Atlantis'")
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(date(add(None).await), "2026-03-02");
}

async fn record_row(app: &App) -> (Option<Value>, i64) {
    sqlx::query_as("SELECT value, revision FROM app_records WHERE key = 'dailyGoal'")
        .fetch_one(&app.db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn records_keep_counting_revisions_in_the_database(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let save = |value: Value, base: Value| {
        app.call(
            &alice,
            "set_app_record",
            json!({ "key": "dailyGoal", "value": value, "baseRevision": base }),
        )
    };

    assert_eq!(
        App::ok(save(json!(1), json!(0)).await),
        json!({ "revision": 1 })
    );
    assert_eq!(
        App::ok(save(json!(2), json!(1)).await),
        json!({ "revision": 2 })
    );
    assert_eq!(record_row(&app).await, (Some(json!(2)), 2));

    let stale = save(json!(3), json!(1)).await;
    stale.expect(StatusCode::CONFLICT, "conflict");
    assert_eq!(stale.body["error"], ERR_RECORD_CONFLICT);
    assert_eq!(record_row(&app).await, (Some(json!(2)), 2));

    // Removed, it keeps its revision
    assert_eq!(
        App::ok(save(Value::Null, json!(2)).await),
        json!({ "revision": 3 })
    );
    assert_eq!(record_row(&app).await, (None, 3));
    let all = App::ok(app.call(&alice, "get_app_records", json!({})).await);
    assert_eq!(all["records"], json!({}));
    assert_eq!(all["revisions"]["dailyGoal"], 3);
    assert_eq!(all["revisions"]["taskNotes"], 0);
}

/// Stores rows for the user as an older or broken build might have.
async fn store_rows(app: &App, user: Uuid, sql: &str) {
    sqlx::query("INSERT INTO workspaces (user_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(user)
        .execute(&app.db)
        .await
        .unwrap();
    for statement in sql.split(';').filter(|s| !s.trim().is_empty()) {
        sqlx::query(statement)
            .bind(user)
            .execute(&app.db)
            .await
            .unwrap();
    }
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn rows_that_cant_be_read_are_reported_and_never_saved_over(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    with_tasks(&app, &alice).await;
    let bad_session = r#"{"garbage": true}"#;
    store_rows(
        &app,
        alice.user_id,
        &format!(
            "INSERT INTO sessions (user_id, id, data) VALUES
                 ($1, 'bad', '{bad_session}'),
                 ($1, 'misfiled', '{{\"id\": \"other\", \"taskId\": \"t1\", \"taskName\": \"A\"}}');
             INSERT INTO work_log_entries (user_id, id, data) VALUES ($1, 'e-bad', '[]');
             INSERT INTO project_mappings (user_id, project_id, data) VALUES ($1, 'p-bad', '1');
             INSERT INTO pending_captures (user_id, data) VALUES ($1, '{{\"payload\": 5}}');"
        ),
    )
    .await;

    let warning = App::ok(
        app.call(&alice, "get_session_load_warning", json!({}))
            .await,
    );
    assert_eq!(
        warning,
        "2 saved session record(s) could not be read and were skipped. They're kept as they are."
    );
    let logs = App::ok(app.call(&alice, "get_work_logs", json!({})).await);
    assert_eq!(
        logs["loadWarning"],
        "2 saved work-log record(s) could not be read and were skipped. They're kept as they are."
    );
    assert_eq!(logs["entries"], json!([]));
    let taken = app
        .call(&alice, "take_pending_work_log_capture", json!({}))
        .await;
    assert_eq!(App::ok(taken), Value::Null);

    // Changes go around them
    App::ok(
        app.call(
            &alice,
            "start_task",
            json!({ "taskId": "t1", "taskName": "Writing" }),
        )
        .await,
    );
    let import = json!({ "payload": { "entries": [{ "id": "e1", "kind": "workLog" }] } });
    App::ok(app.call(&alice, "apply_work_log_import", import).await);
    let stored: String = sqlx::query_scalar("SELECT data::text FROM sessions WHERE id = 'bad'")
        .fetch_one(&app.db)
        .await
        .unwrap();
    assert_eq!(stored, bad_session);
    assert_eq!(app.count("SELECT count(*) FROM sessions").await, 3);
    assert_eq!(app.count("SELECT count(*) FROM work_log_entries").await, 2);

    // Until a record with its id comes back
    let restore = json!({ "payload": { "mode": "merge", "sessions": [
        { "id": "bad", "taskId": "t1", "taskName": "Writing", "timerInstances": [], "notes": null }
    ] } });
    App::ok(app.call(&alice, "restore_backup_data", restore).await);
    let sessions = App::ok(app.call(&alice, "get_sessions", json!({})).await);
    assert_eq!(sessions.as_array().unwrap().len(), 2);
    assert_eq!(sessions[1]["id"], "bad");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn copies_are_kept_before_replacing_data_up_to_ten_of_a_kind(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    let restore = json!({ "payload": { "mode": "merge", "sessions": [] } });
    for _ in 0..12 {
        App::ok(
            app.call(&alice, "restore_backup_data", restore.clone())
                .await,
        );
    }
    let records = json!({ "records": { "taskNotes": [{ "id": "n1" }] } });
    App::ok(app.call(&alice, "import_app_records", records).await);

    let kinds: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT kind, reason, count(*) FROM data_snapshots GROUP BY kind, reason ORDER BY kind",
    )
    .fetch_all(&app.db)
    .await
    .unwrap();
    assert_eq!(
        kinds,
        [
            ("incoming_records".into(), "import_app_records".into(), 1),
            ("sessions".into(), "restore_backup_data".into(), 10),
            ("work_logs".into(), "restore_backup_data".into(), 10),
        ]
    );
    let incoming: Value =
        sqlx::query_scalar("SELECT data FROM data_snapshots WHERE kind = 'incoming_records'")
            .fetch_one(&app.db)
            .await
            .unwrap();
    assert_eq!(incoming, json!({ "taskNotes": [{ "id": "n1" }] }));

    // A reset takes the copies with everything else
    let reset = App::ok(app.call(&alice, "reset_all_app_data", json!({})).await);
    assert_eq!(reset, json!({ "backupsDeleted": 21, "warning": null }));
    for table in [
        "sessions",
        "work_log_entries",
        "project_mappings",
        "app_records",
        "pending_captures",
        "data_snapshots",
    ] {
        assert_eq!(app.count(&format!("SELECT count(*) FROM {table}")).await, 0);
    }
}

/// What alice has after `start_task`, to show a failed change left it so.
async fn sessions_of(app: &App, alice: &Session) -> Value {
    App::ok(app.call(alice, "get_sessions", json!({})).await)
}

async fn start(app: &App, alice: &Session) -> crate::common::Res {
    app.call(
        alice,
        "start_task",
        json!({ "taskId": "t1", "taskName": "Writing" }),
    )
    .await
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_change_the_database_refuses_changes_nothing(db: PgPool) {
    let app = App::new(db);
    let alice = app.member("alice").await;
    with_tasks(&app, &alice).await;
    let internal =
        |res: crate::common::Res| res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");

    // Locking the workspace
    app.fail_on("UPDATE", "workspaces").await;
    internal(start(&app, &alice).await);
    app.heal("UPDATE", "workspaces").await;
    // Saving it
    app.fail_on("INSERT", "sessions").await;
    internal(start(&app, &alice).await);
    app.heal("INSERT", "sessions").await;
    // Committing it
    sqlx::raw_sql(
        "CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
             $$ BEGIN RAISE EXCEPTION 'refused at commit'; END $$;
         CREATE CONSTRAINT TRIGGER at_commit AFTER INSERT ON sessions
             DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse();",
    )
    .execute(&app.db)
    .await
    .unwrap();
    internal(start(&app, &alice).await);
    sqlx::raw_sql("DROP TRIGGER at_commit ON sessions")
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(sessions_of(&app, &alice).await, json!([]));

    // Keeping a copy first
    app.fail_on("INSERT", "data_snapshots").await;
    let restore = json!({ "payload": { "mode": "replace", "sessions": [] } });
    internal(app.call(&alice, "restore_backup_data", restore).await);
    app.heal("INSERT", "data_snapshots").await;
    // Deleting the copies
    App::ok(start(&app, &alice).await);
    app.fail_on("DELETE", "data_snapshots").await;
    internal(app.call(&alice, "reset_all_app_data", json!({})).await);
    assert_eq!(sessions_of(&app, &alice).await.as_array().unwrap().len(), 1);

    // Reading it, to change it or not
    app.break_table("sessions").await;
    internal(start(&app, &alice).await);
    internal(app.call(&alice, "get_sessions", json!({})).await);
    app.mend_table("sessions").await;
    // Only the changes that were saved counted
    assert_eq!(app.count("SELECT version FROM workspaces").await, 2);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn a_database_that_cant_be_reached_fails_reads_and_changes(db: PgPool) {
    let state = AppState::new(
        db.clone(),
        settings(),
        passwords(),
        generous_limits(),
        Arc::new(Utc::now),
    );
    db.close().await;
    let user = Uuid::new_v4();
    for name in ["get_sessions", "stop_live_timer"] {
        let command = Command::parse(name, Value::Null).unwrap();
        let error = workspace::run(&state, user, name, command, DayZone::UTC)
            .await
            .unwrap_err();
        assert_eq!(
            error.into_response().status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }
}
