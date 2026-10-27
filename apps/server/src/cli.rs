//! The `taskmint-server` command line. `main.rs` only wires the process
//! (arguments, environment, stdio, signals) into [`run`].

use std::ffi::OsString;
use std::future::Future;
use std::io::Write;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context};
use chrono::Utc;
use clap::{Parser, Subcommand};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::net::TcpListener;

use crate::accounts::{self, Actor, Role};
use crate::config::{Config, Env};
use crate::passwords::Passwords;
use crate::ratelimit::RateLimits;
use crate::state::AppState;
use crate::{healthcheck, http, telemetry, MIGRATOR};

/// Resolves when the server should stop (SIGINT/SIGTERM in production).
pub type Shutdown = Pin<Box<dyn Future<Output = ()> + Send>>;

#[derive(Parser)]
#[command(name = "taskmint-server", version, about = "The TaskMint server")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve the HTTP API on TASKMINT_BIND.
    Serve,
    /// Apply pending database migrations, then exit.
    Migrate,
    /// Exit 0 if the server on TASKMINT_BIND answers /healthz.
    Healthcheck,
    /// Account recovery from the command line.
    #[command(subcommand)]
    Admin(AdminCommand),
}

#[derive(Subcommand)]
enum AdminCommand {
    /// Print a one-time invite link.
    CreateInvite {
        #[arg(long, value_enum, default_value_t = Role::User)]
        role: Role,
        /// Shown to admins in the invite list.
        #[arg(long, default_value = "")]
        note: String,
    },
    /// Print a one-time password-reset link for an active user.
    ResetPassword { username: String },
}

/// Runs the command line and returns the process exit code.
pub async fn run(
    args: Vec<OsString>,
    env: Env<'_>,
    shutdown: Shutdown,
    out: &mut (dyn Write + Send),
    err: &mut (dyn Write + Send),
) -> u8 {
    let cli = match Cli::try_parse_from(args) {
        Ok(cli) => cli,
        Err(error) => {
            // --help and --version are "errors" that go to stdout.
            let stream: &mut (dyn Write + Send) = if error.use_stderr() {
                &mut *err
            } else {
                &mut *out
            };
            let _ = write!(stream, "{}", error.render());
            return u8::try_from(error.exit_code()).expect("clap exit codes are 0 or 2");
        }
    };
    match execute(cli.command, env, shutdown, out).await {
        Ok(()) => 0,
        Err(error) => {
            let _ = writeln!(err, "error: {error:#}");
            1
        }
    }
}

async fn execute(
    command: Command,
    env: Env<'_>,
    shutdown: Shutdown,
    out: &mut (dyn Write + Send),
) -> anyhow::Result<()> {
    let config = Config::from_env(env)?;
    telemetry::init(config.log_format, &config.log_filter);
    match command {
        Command::Serve => serve(config, shutdown).await,
        Command::Migrate => migrate(&config).await,
        Command::Healthcheck => {
            if healthcheck::probe(config.bind).await {
                Ok(())
            } else {
                bail!("no healthy server on {}", config.bind)
            }
        }
        Command::Admin(command) => admin(command, &config, out).await,
    }
}

fn pool(config: &Config, max_connections: u32) -> PgPool {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(10))
        .connect_lazy_with(config.database.clone())
}

async fn serve(config: Config, shutdown: Shutdown) -> anyhow::Result<()> {
    let db = pool(&config, 16);
    let passwords = Passwords::production();
    if let Some(admin) = &config.admin {
        let created = accounts::bootstrap_admin(&db, &passwords, &admin.username, &admin.password)
            .await
            .context("creating the first admin")?;
        if created {
            tracing::info!(username = %admin.username, "created the first admin");
        }
    }
    let listener = TcpListener::bind(config.bind)
        .await
        .with_context(|| format!("can't listen on {}", config.bind))?;
    tracing::info!(address = %config.bind, "listening");
    let state = AppState::new(
        db,
        config.settings,
        passwords,
        RateLimits::production(),
        Arc::new(Utc::now),
    );
    let app = http::router(state.clone()).into_make_service_with_connect_info::<SocketAddr>();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown.await;
            // Requests in flight finish; event streams would never
            state.events.close();
        })
        .await
        .context("serving")
}

async fn migrate(config: &Config) -> anyhow::Result<()> {
    MIGRATOR
        .run(&pool(config, 1))
        .await
        .context("applying migrations")?;
    tracing::info!("migrations are up to date");
    Ok(())
}

async fn admin(
    command: AdminCommand,
    config: &Config,
    out: &mut (dyn Write + Send),
) -> anyhow::Result<()> {
    let db = pool(config, 1);
    let (url, expires_at) = match command {
        AdminCommand::CreateInvite { role, note } => {
            let note = accounts::invite_note(&note).map_err(anyhow::Error::msg)?;
            let invite =
                accounts::create_invite(&db, &config.settings, Actor::default(), role, &note)
                    .await?;
            (invite.url, invite.expires_at)
        }
        AdminCommand::ResetPassword { username } => {
            let username = accounts::username(&username).map_err(anyhow::Error::msg)?;
            let reset = accounts::create_password_reset(
                &db,
                &config.settings,
                Actor::default(),
                None,
                Some(&username),
            )
            .await?
            .with_context(|| format!("no active user named {username}"))?;
            (reset.url, reset.expires_at)
        }
    };
    writeln!(out, "{url}\nSingle use; expires {expires_at}.").context("writing the link")
}
