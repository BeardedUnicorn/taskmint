//! The conformance scenarios (crates/taskmint-core/src/testkit) over HTTP,
//! so the server keeps the rules, replies, errors and events that core in
//! memory and the desktop app do. Each scenario runs as a new user.

use std::sync::Arc;

use axum::http::StatusCode;
use serde_json::Value;
use sqlx::PgPool;
use taskmint_core::command::Event;
use taskmint_core::contract::events::RESYNC;
use taskmint_core::contract::TIME_ZONE_HEADER;
use taskmint_core::testkit::{run_all, start_time, Host};
use tokio::runtime::Handle;
use tokio::sync::broadcast::Receiver;

use crate::common::App;

struct HttpHost {
    app: Arc<App>,
    handle: Handle,
    token: String,
    events: Receiver<Event>,
}

impl HttpHost {
    async fn new(app: Arc<App>, handle: Handle, username: &str) -> Self {
        let session = app.member(username).await;
        let token = app.token(&session, "full").await;
        let events = app.state.events.subscribe(session.user_id);
        *app.now.lock().unwrap() = start_time();
        Self {
            app,
            handle,
            token,
            events,
        }
    }
}

impl Host for HttpHost {
    fn call(&mut self, command: &str, args: Value) -> Result<Value, String> {
        let res = self.handle.block_on(
            self.app
                .post(&format!("/api/v1/commands/{command}"))
                .bearer(&self.token)
                .header(TIME_ZONE_HEADER, "UTC")
                .json(args)
                .send(),
        );
        match res.status {
            StatusCode::OK => Ok(res.body),
            _ => Err(res.body["error"].as_str().unwrap().to_owned()),
        }
    }

    /// Core's events. `resync`, which the server adds after a reset, is the
    /// stream's own (tests/api/stream.rs checks it).
    fn take_events(&mut self) -> Vec<String> {
        std::iter::from_fn(|| self.events.try_recv().ok())
            .map(|event| event.name.to_owned())
            .filter(|name| name != RESYNC)
            .collect()
    }

    fn advance(&mut self, ms: i64) {
        self.app.advance_ms(ms);
    }

    /// The server keeps nothing between requests: every one reads what's
    /// saved.
    fn reload(&mut self) {}
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn the_server_passes_every_scenario(db: PgPool) {
    let app = Arc::new(App::new(db));
    let handle = Handle::current();
    // The scenarios run synchronously; requests go back to the test's runtime
    let outcome = tokio::task::spawn_blocking(move || {
        let mut scenarios = 0;
        run_all(&mut || {
            scenarios += 1;
            let username = format!("scenario{scenarios}");
            let host = handle.block_on(HttpHost::new(app.clone(), handle.clone(), &username));
            Box::new(host)
        })
    })
    .await
    .unwrap();
    outcome.unwrap();
}
