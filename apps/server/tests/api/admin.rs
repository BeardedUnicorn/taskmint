use axum::http::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::common::{App, Session, PASSWORD};

async fn change(app: &App, admin: &Session, user: Uuid, body: Value) -> crate::common::Res {
    app.patch(&format!("/api/v1/admin/users/{user}"))
        .session(admin)
        .json(body)
        .send()
        .await
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn admin_endpoints_need_an_admin_session(db: PgPool) {
    let app = App::new(db);
    let member = app.member("alice").await;
    let id = Uuid::new_v4();
    let requests = [
        ("GET", "/api/v1/admin/users".to_owned(), Value::Null),
        (
            "PATCH",
            format!("/api/v1/admin/users/{id}"),
            json!({"disabled": true}),
        ),
        (
            "POST",
            format!("/api/v1/admin/users/{id}/password-reset"),
            Value::Null,
        ),
        ("GET", "/api/v1/admin/invites".to_owned(), Value::Null),
        ("POST", "/api/v1/admin/invites".to_owned(), json!({})),
        ("DELETE", format!("/api/v1/admin/invites/{id}"), Value::Null),
    ];
    for (method, path, body) in requests {
        let request = || {
            let request = match method {
                "GET" => app.get(&path),
                "PATCH" => app.patch(&path),
                "POST" => app.post(&path),
                _ => app.delete(&path),
            };
            if body.is_null() {
                request
            } else {
                request.json(body.clone())
            }
        };
        let res = request().session(&member).send().await;
        res.expect(StatusCode::FORBIDDEN, "admin_only");
        let res = request().send().await;
        res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn admins_list_users(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    app.user("bob", "user").await;
    let res = app
        .get("/api/v1/admin/users")
        .cookie(&admin.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    let users = res.body.as_array().unwrap();
    assert_eq!(users.len(), 2);
    assert_eq!(users[0]["username"], "bob");
    assert!(users[0]["lastSeenAt"].is_null());
    assert_eq!(users[1]["username"], "root");
    assert_eq!(users[1]["role"], "admin");
    assert!(users[1]["lastSeenAt"].is_string());
    assert!(users[1]["disabledAt"].is_null());
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn disabling_a_user_signs_them_out_and_revokes_their_tokens(db: PgPool) {
    let app = App::new(db);
    let admin = app.admin().await;
    let bob = app.member("bob").await;
    let token = app
        .post("/api/v1/tokens")
        .session(&bob)
        .json(json!({"name": "script", "scope": "full"}))
        .send()
        .await
        .body["token"]
        .as_str()
        .unwrap()
        .to_owned();

    let res = change(&app, &admin, bob.user_id, json!({"disabled": true})).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);
    assert_eq!(res.body["username"], "bob");
    assert!(res.body["disabledAt"].is_string());
    let res = app.get("/api/v1/auth/me").cookie(&bob.cookie).send().await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let res = app.get("/api/v1/auth/me").bearer(&token).send().await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");
    let res = app
        .post("/api/v1/auth/login")
        .json(json!({"username": "bob", "password": PASSWORD}))
        .send()
        .await;
    res.expect(StatusCode::UNAUTHORIZED, "bad_credentials");
    assert_eq!(
        app.count("SELECT count(*) FROM auth_sessions WHERE user_id IS NOT NULL")
            .await,
        1
    );
    assert_eq!(
        app.count("SELECT count(*) FROM api_tokens WHERE revoked_at IS NULL")
            .await,
        0
    );

    // Disabling again keeps the original time.
    let first = res_disabled_at(&app, bob.user_id).await;
    change(&app, &admin, bob.user_id, json!({"disabled": true})).await;
    assert_eq!(res_disabled_at(&app, bob.user_id).await, first);

    // Enabling lets them back in; revoked tokens stay revoked.
    let res = change(&app, &admin, bob.user_id, json!({"disabled": false})).await;
    assert_eq!(res.status, StatusCode::OK);
    assert!(res.body["disabledAt"].is_null());
    app.login("bob").await;
    let res = app.get("/api/v1/auth/me").bearer(&token).send().await;
    res.expect(StatusCode::UNAUTHORIZED, "unauthenticated");

    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'user.update' AND detail ? 'disabled'")
        .await;
    assert_eq!(audited, 3);
}

async fn res_disabled_at(app: &App, user: Uuid) -> Option<chrono::DateTime<chrono::Utc>> {
    sqlx::query_scalar("SELECT disabled_at FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(&app.db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn roles_change_but_one_active_admin_always_remains(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    // The only admin can't demote or disable themselves.
    for body in [
        json!({"role": "user"}),
        json!({"disabled": true}),
        json!({"role": "admin", "disabled": true}),
    ] {
        let res = change(&app, &root, root.user_id, body).await;
        res.expect(StatusCode::CONFLICT, "last_admin");
    }
    // A no-op for the last admin is fine.
    let res = change(
        &app,
        &root,
        root.user_id,
        json!({"role": "admin", "disabled": false}),
    )
    .await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.body);

    let bob = app.member("bob").await;
    let res = change(&app, &root, bob.user_id, json!({"role": "admin"})).await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["role"], "admin");
    // Two admins: one may go, then the other must stay.
    let res = change(&app, &root, root.user_id, json!({"role": "user"})).await;
    assert_eq!(res.body["role"], "user");
    let res = change(&app, &bob, bob.user_id, json!({"disabled": true})).await;
    res.expect(StatusCode::CONFLICT, "last_admin");
    // A demoted admin isn't one any more.
    let res = app
        .get("/api/v1/admin/users")
        .cookie(&root.cookie)
        .send()
        .await;
    res.expect(StatusCode::FORBIDDEN, "admin_only");

    // Changing a disabled former admin is unrestricted.
    let res = change(
        &app,
        &bob,
        root.user_id,
        json!({"disabled": true, "role": "admin"}),
    )
    .await;
    assert_eq!(res.status, StatusCode::OK);
    let res = change(&app, &bob, root.user_id, json!({"role": "user"})).await;
    assert_eq!(res.status, StatusCode::OK);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn user_changes_are_checked(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    let res = change(&app, &root, root.user_id, json!({})).await;
    res.expect(StatusCode::BAD_REQUEST, "invalid_request");
    let res = change(&app, &root, root.user_id, json!({"username": "x"})).await;
    res.expect(StatusCode::UNPROCESSABLE_ENTITY, "invalid_body");
    let res = change(&app, &root, Uuid::new_v4(), json!({"disabled": true})).await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    let res = app
        .patch("/api/v1/admin/users/123")
        .session(&root)
        .json(json!({"disabled": true}))
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    app.fail_on("INSERT", "audit_events").await;
    let res = change(&app, &root, root.user_id, json!({"disabled": false})).await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn reset_links_replace_older_ones(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    let bob = app.user("bob", "user").await;
    let issue = || {
        app.post(&format!("/api/v1/admin/users/{bob}/password-reset"))
            .session(&root)
    };
    let first = issue().send().await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.body);
    assert_eq!(first.body["username"], "bob");
    let url = first.body["url"].as_str().unwrap();
    assert!(url.starts_with("http://localhost:8080/reset/"), "{url}");
    let second = issue().send().await;
    let token = |res: &crate::common::Res| {
        res.body["url"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_owned()
    };
    let res = app
        .get(&format!("/api/v1/password-resets/{}", token(&first)))
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
    let res = app
        .get(&format!("/api/v1/password-resets/{}", token(&second)))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    let audited = app
        .count("SELECT count(*) FROM audit_events WHERE action = 'password_reset.create' AND actor_id IS NOT NULL")
        .await;
    assert_eq!(audited, 2);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn reset_links_need_an_active_user(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    let bob = app.user("bob", "user").await;
    sqlx::query("UPDATE users SET disabled_at = now() WHERE id = $1")
        .bind(bob)
        .execute(&app.db)
        .await
        .unwrap();
    for id in [bob, Uuid::new_v4()] {
        let res = app
            .post(&format!("/api/v1/admin/users/{id}/password-reset"))
            .session(&root)
            .send()
            .await;
        res.expect(StatusCode::NOT_FOUND, "not_found");
    }
    app.fail_on("INSERT", "password_resets").await;
    let res = app
        .post(&format!(
            "/api/v1/admin/users/{}/password-reset",
            root.user_id
        ))
        .session(&root)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn invites_are_created_listed_and_revoked(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    let create = |body: Value| app.post("/api/v1/admin/invites").session(&root).json(body);
    let member = create(json!({"note": " for Alice "})).send().await;
    assert_eq!(member.status, StatusCode::CREATED, "{}", member.body);
    assert_eq!(member.body["role"], "user");
    assert_eq!(member.body["note"], "for Alice");
    assert!(member.body["url"]
        .as_str()
        .unwrap()
        .starts_with("http://localhost:8080/invite/"));
    let admin = create(json!({"role": "admin"})).send().await;
    assert_eq!(admin.body["role"], "admin");
    let revoked = create(json!({})).send().await;
    let expired = create(json!({})).send().await;
    sqlx::query("UPDATE invites SET expires_at = now() WHERE id = $1")
        .bind(
            expired.body["id"]
                .as_str()
                .unwrap()
                .parse::<Uuid>()
                .unwrap(),
        )
        .execute(&app.db)
        .await
        .unwrap();

    let revoke = |id: &Value| {
        app.delete(&format!("/api/v1/admin/invites/{}", id.as_str().unwrap()))
            .session(&root)
    };
    assert_eq!(
        revoke(&revoked.body["id"]).send().await.status,
        StatusCode::NO_CONTENT
    );
    revoke(&revoked.body["id"])
        .send()
        .await
        .expect(StatusCode::NOT_FOUND, "not_found");

    let token = member.body["url"]
        .as_str()
        .unwrap()
        .rsplit('/')
        .next()
        .unwrap();
    let res = app
        .post(&format!("/api/v1/invites/{token}/accept"))
        .json(json!({"username": "alice", "password": PASSWORD}))
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    revoke(&member.body["id"])
        .send()
        .await
        .expect(StatusCode::NOT_FOUND, "not_found");

    let res = app
        .get("/api/v1/admin/invites")
        .cookie(&root.cookie)
        .send()
        .await;
    assert_eq!(res.status, StatusCode::OK);
    let invites = res.body.as_array().unwrap();
    let status = |invite: &Value| {
        let found = invites
            .iter()
            .find(|row| row["id"] == invite["id"])
            .unwrap();
        (
            found["status"].as_str().unwrap().to_owned(),
            found["usedBy"].clone(),
        )
    };
    assert_eq!(status(&member.body), ("used".to_owned(), json!("alice")));
    assert_eq!(status(&admin.body), ("pending".to_owned(), Value::Null));
    assert_eq!(status(&revoked.body), ("revoked".to_owned(), Value::Null));
    assert_eq!(status(&expired.body), ("expired".to_owned(), Value::Null));
    assert!(invites.iter().all(|row| row["createdBy"] == "root"));
    assert_eq!(
        app.count("SELECT count(*) FROM audit_events WHERE action = 'invite.create'")
            .await,
        4
    );
    assert_eq!(
        app.count("SELECT count(*) FROM audit_events WHERE action = 'invite.revoke'")
            .await,
        1
    );
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn invite_requests_are_checked(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    let res = app
        .post("/api/v1/admin/invites")
        .session(&root)
        .json(json!({"note": "x".repeat(201)}))
        .send()
        .await;
    res.expect(StatusCode::BAD_REQUEST, "invalid_request");
    let res = app
        .post("/api/v1/admin/invites")
        .session(&root)
        .json(json!({"role": "owner"}))
        .send()
        .await;
    res.expect(StatusCode::UNPROCESSABLE_ENTITY, "invalid_body");
    let res = app
        .delete("/api/v1/admin/invites/xyz")
        .session(&root)
        .send()
        .await;
    res.expect(StatusCode::NOT_FOUND, "not_found");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn invite_admin_reports_database_failures(db: PgPool) {
    let app = App::new(db);
    let root = app.admin().await;
    let invite = app
        .post("/api/v1/admin/invites")
        .session(&root)
        .json(json!({}))
        .send()
        .await;
    app.fail_on("UPDATE", "invites").await;
    let res = app
        .delete(&format!(
            "/api/v1/admin/invites/{}",
            invite.body["id"].as_str().unwrap()
        ))
        .session(&root)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    app.fail_on("INSERT", "invites").await;
    let res = app
        .post("/api/v1/admin/invites")
        .session(&root)
        .json(json!({}))
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
    app.break_table("invites").await;
    let res = app
        .get("/api/v1/admin/invites")
        .cookie(&root.cookie)
        .send()
        .await;
    res.expect(StatusCode::INTERNAL_SERVER_ERROR, "internal");
}
