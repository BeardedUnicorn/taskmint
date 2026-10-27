use std::collections::HashMap;
use std::future::Future;
use std::io::Write;
use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, PgPool};
use taskmint_server::cli::{self, Shutdown};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

struct Output {
    code: u8,
    out: String,
    err: String,
}

/// Runs the command line with only `vars` set (logs off unless RUST_LOG is).
async fn run(args: &[&str], vars: &[(&str, &str)]) -> Output {
    run_until(args, vars, Box::pin(std::future::pending())).await
}

async fn run_until(args: &[&str], vars: &[(&str, &str)], shutdown: Shutdown) -> Output {
    let mut out = Vec::new();
    let (code, err) = run_into(args, vars, shutdown, &mut out).await;
    Output {
        code,
        out: String::from_utf8(out).unwrap(),
        err,
    }
}

/// Returns the exit code and stderr; stdout goes to `out`.
async fn run_into(
    args: &[&str],
    vars: &[(&str, &str)],
    shutdown: Shutdown,
    out: &mut (dyn Write + Send),
) -> (u8, String) {
    let mut vars: HashMap<String, String> = vars
        .iter()
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .collect();
    vars.entry("RUST_LOG".to_owned())
        .or_insert_with(|| "off".to_owned());
    let env = move |name: &str| vars.get(name).cloned();
    let args = std::iter::once("taskmint-server")
        .chain(args.iter().copied())
        .map(Into::into)
        .collect();
    let mut err = Vec::new();
    let code = cli::run(args, &env, shutdown, out, &mut err).await;
    (code, String::from_utf8(err).unwrap())
}

fn url(options: &PgConnectOptions) -> String {
    options.to_url_lossy().to_string()
}

/// Same server and database, wrong password: fails fast, like a database
/// that's down.
fn bad_url(options: &PgConnectOptions) -> String {
    url(&options.clone().password("wrong"))
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

struct Broken;

impl Write for Broken {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::other("stdout is closed"))
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn help_version_and_usage_errors() {
    let help = run(&["--help"], &[]).await;
    assert_eq!(help.code, 0);
    assert!(
        help.out.contains("Usage: taskmint-server <COMMAND>"),
        "{}",
        help.out
    );
    for command in ["serve", "migrate", "healthcheck", "admin"] {
        assert!(help.out.contains(command), "{}", help.out);
    }
    let version = run(&["--version"], &[]).await;
    assert_eq!(
        (version.code, version.out.trim()),
        (0, concat!("taskmint-server ", env!("CARGO_PKG_VERSION")))
    );
    let wrong = run(&["frobnicate"], &[]).await;
    assert_eq!(wrong.code, 2);
    assert!(
        wrong.err.contains("unrecognized subcommand"),
        "{}",
        wrong.err
    );
    assert!(wrong.out.is_empty());
}

#[tokio::test]
async fn configuration_errors_exit_1() {
    let res = run(&["migrate"], &[("TASKMINT_BIND", "nowhere")]).await;
    assert_eq!(res.code, 1);
    assert_eq!(
        res.err,
        "error: TASKMINT_BIND: \"nowhere\": invalid socket address syntax\n"
    );
}

#[sqlx::test(migrations = false)]
async fn migrate_creates_the_schema_once(_: PgPoolOptions, options: PgConnectOptions) {
    let db_url = url(&options);
    let vars = [
        ("DATABASE_URL", db_url.as_str()),
        ("TASKMINT_LOG_FORMAT", "json"),
    ];
    for _ in 0..2 {
        let res = run(&["migrate"], &vars).await;
        assert_eq!((res.code, res.err.as_str()), (0, ""));
    }
    let db = PgPool::connect_with(options.clone()).await.unwrap();
    let tables: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
         AND table_name IN ('users', 'invites', 'password_resets', 'auth_sessions', 'api_tokens', 'audit_events')",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(tables, 6);

    let bad = bad_url(&options);
    let res = run(&["migrate"], &[("DATABASE_URL", bad.as_str())]).await;
    assert_eq!(res.code, 1);
    assert!(
        res.err.starts_with("error: applying migrations: "),
        "{}",
        res.err
    );
}

/// Runs `serve` until `client` finishes, then shuts it down.
async fn serving<F: Future<Output = ()>>(vars: &[(&str, &str)], client: F) -> Output {
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let shutdown: Shutdown = Box::pin(async move {
        let _ = stopped.await;
    });
    let server = run_until(&["serve"], vars, shutdown);
    let client = async move {
        client.await;
        stop.send(()).unwrap();
    };
    let (output, ()) = tokio::join!(server, client);
    output
}

async fn wait_until_healthy(port: u16) {
    let bind = format!("0.0.0.0:{port}");
    for _ in 0..100 {
        if run(&["healthcheck"], &[("TASKMINT_BIND", bind.as_str())])
            .await
            .code
            == 0
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the server never became healthy");
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn serve_bootstraps_the_first_admin_and_answers_health_checks(
    _: PgPoolOptions,
    options: PgConnectOptions,
) {
    let db_url = url(&options);
    let port = free_port();
    let bind = format!("127.0.0.1:{port}");
    let vars = [
        ("DATABASE_URL", db_url.as_str()),
        ("TASKMINT_BIND", bind.as_str()),
        ("TASKMINT_ADMIN_USERNAME", "Root"),
        ("TASKMINT_ADMIN_PASSWORD", "bootstrap password"),
    ];
    let res = serving(&vars, async {
        wait_until_healthy(port).await;
        let direct = run(&["healthcheck"], &[("TASKMINT_BIND", bind.as_str())]).await;
        assert_eq!(direct.code, 0);
    })
    .await;
    assert_eq!((res.code, res.err.as_str()), (0, ""));
    assert_eq!(
        run(&["healthcheck"], &[("TASKMINT_BIND", bind.as_str())])
            .await
            .code,
        1
    );

    let db = PgPool::connect_with(options.clone()).await.unwrap();
    let admin: (String, String) = sqlx::query_as("SELECT username, role FROM users")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(admin, ("root".to_owned(), "admin".to_owned()));

    // Users exist now, so a second start adds nobody (and nobody without
    // the variables either).
    let other = [
        ("TASKMINT_ADMIN_USERNAME", "other"),
        ("TASKMINT_ADMIN_PASSWORD", "bootstrap password"),
    ];
    for extra in [&other[..], &[]] {
        let mut vars = vec![
            ("DATABASE_URL", db_url.as_str()),
            ("TASKMINT_BIND", bind.as_str()),
        ];
        vars.extend_from_slice(extra);
        let res = serving(&vars, wait_until_healthy(port)).await;
        assert_eq!(res.code, 0, "{}", res.err);
    }
    let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(users, 1);
}

/// Opens a connection to the server, sends `request`, and reads the
/// response's head; the body is left on the connection.
async fn send(port: u16, request: &str) -> (BufReader<TcpStream>, String) {
    let mut conn = BufReader::new(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
    conn.get_mut().write_all(request.as_bytes()).await.unwrap();
    let mut head = String::new();
    loop {
        let mut line = String::new();
        conn.read_line(&mut line).await.unwrap();
        if line == "\r\n" {
            return (conn, head);
        }
        head.push_str(&line);
    }
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn serve_stops_promptly_with_event_streams_open(_: PgPoolOptions, options: PgConnectOptions) {
    let db_url = url(&options);
    let port = free_port();
    let bind = format!("127.0.0.1:{port}");
    let vars = [
        ("DATABASE_URL", db_url.as_str()),
        ("TASKMINT_BIND", bind.as_str()),
        ("TASKMINT_ADMIN_USERNAME", "root"),
        ("TASKMINT_ADMIN_PASSWORD", "bootstrap password"),
    ];
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let server = run_until(
        &["serve"],
        &vars,
        Box::pin(async move {
            let _ = stopped.await;
        }),
    );
    let client = async move {
        wait_until_healthy(port).await;
        let body = r#"{"username": "root", "password": "bootstrap password"}"#;
        let (_, head) = send(
            port,
            &format!(
                "POST /api/v1/auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n\
                 Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            ),
        )
        .await;
        let cookie = head
            .lines()
            .find_map(|line| {
                line.to_lowercase()
                    .starts_with("set-cookie:")
                    .then(|| line[11..].trim())
            })
            .and_then(|value| value.split(';').next())
            .unwrap_or_else(|| panic!("no session cookie in {head}"))
            .to_owned();
        let (mut events, head) = send(
            port,
            &format!("GET /api/v1/events HTTP/1.1\r\nHost: localhost\r\nCookie: {cookie}\r\n\r\n"),
        )
        .await;
        assert!(head.contains("text/event-stream"), "{head}");

        stop.send(()).unwrap();
        // The server ends the stream, then the connection
        let mut rest = Vec::new();
        events.read_to_end(&mut rest).await.unwrap();
    };
    let (res, ()) = tokio::time::timeout(Duration::from_secs(10), async {
        tokio::join!(server, client)
    })
    .await
    .expect("serve stops while an event stream is open");
    assert_eq!((res.code, res.err.as_str()), (0, ""));
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn serve_reports_startup_failures(_: PgPoolOptions, options: PgConnectOptions) {
    let taken = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let bind = taken.local_addr().unwrap().to_string();
    let db_url = url(&options);
    let res = run(
        &["serve"],
        &[
            ("DATABASE_URL", db_url.as_str()),
            ("TASKMINT_BIND", bind.as_str()),
        ],
    )
    .await;
    assert_eq!(res.code, 1);
    assert!(
        res.err
            .starts_with(&format!("error: can't listen on {bind}: ")),
        "{}",
        res.err
    );

    let bad = bad_url(&options);
    let res = run(
        &["serve"],
        &[
            ("DATABASE_URL", bad.as_str()),
            ("TASKMINT_ADMIN_USERNAME", "root"),
            ("TASKMINT_ADMIN_PASSWORD", "bootstrap password"),
        ],
    )
    .await;
    assert_eq!(res.code, 1);
    assert!(
        res.err.starts_with("error: creating the first admin: "),
        "{}",
        res.err
    );
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn admin_commands_print_one_time_links(
    pool_options: PgPoolOptions,
    options: PgConnectOptions,
) {
    let db = pool_options.connect_with(options.clone()).await.unwrap();
    let db_url = url(&options);
    let vars = [
        ("DATABASE_URL", db_url.as_str()),
        ("TASKMINT_PUBLIC_ORIGIN", "https://tm.example"),
    ];

    let res = run(
        &[
            "admin",
            "create-invite",
            "--role",
            "admin",
            "--note",
            " recovery ",
        ],
        &vars,
    )
    .await;
    assert_eq!((res.code, res.err.as_str()), (0, ""));
    assert!(
        res.out.starts_with("https://tm.example/invite/"),
        "{}",
        res.out
    );
    assert!(res.out.contains("Single use; expires "), "{}", res.out);
    let invite: (String, String, Option<uuid::Uuid>) =
        sqlx::query_as("SELECT role, note, created_by FROM invites")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(invite, ("admin".to_owned(), "recovery".to_owned(), None));

    sqlx::query("INSERT INTO users (username, password_hash) VALUES ('alice', 'x')")
        .execute(&db)
        .await
        .unwrap();
    let res = run(&["admin", "reset-password", "Alice"], &vars).await;
    assert_eq!((res.code, res.err.as_str()), (0, ""));
    assert!(
        res.out.starts_with("https://tm.example/reset/"),
        "{}",
        res.out
    );
    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_events WHERE actor_id IS NULL
         AND action IN ('invite.create', 'password_reset.create')",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(audited, 2);
}

#[sqlx::test(migrator = "taskmint_server::MIGRATOR")]
async fn admin_command_failures(pool_options: PgPoolOptions, options: PgConnectOptions) {
    let db = pool_options.connect_with(options.clone()).await.unwrap();
    sqlx::query("INSERT INTO users (username, password_hash) VALUES ('alice', 'x')")
        .execute(&db)
        .await
        .unwrap();
    let db_url = url(&options);
    let good = [("DATABASE_URL", db_url.as_str())];
    let bad_url = bad_url(&options);
    let bad = [("DATABASE_URL", bad_url.as_str())];
    let long_note = "x".repeat(201);
    for (args, vars, expected) in [
        (
            vec!["admin", "create-invite", "--note", long_note.as_str()],
            &good,
            "error: a note is at most",
        ),
        (
            vec!["admin", "create-invite"],
            &bad,
            "error: error returned from database",
        ),
        (
            vec!["admin", "reset-password", "no spaces"],
            &good,
            "error: a username is",
        ),
        (
            vec!["admin", "reset-password", "bob"],
            &good,
            "error: no active user named bob",
        ),
        (
            vec!["admin", "reset-password", "alice"],
            &bad,
            "error: error returned from database",
        ),
    ] {
        let res = run(&args, vars).await;
        assert_eq!(res.code, 1, "{args:?}");
        assert!(res.err.starts_with(expected), "{args:?}: {}", res.err);
    }
    for args in [
        &["admin", "create-invite", "--role", "user"][..],
        &["admin", "reset-password", "alice"],
    ] {
        let (code, err) =
            run_into(args, &good, Box::pin(std::future::pending()), &mut Broken).await;
        assert_eq!(code, 1);
        assert!(err.starts_with("error: writing the link: "), "{err}");
    }
}
