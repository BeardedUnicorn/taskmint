//! Configuration from environment variables. Every variable may instead be
//! given as `<NAME>_FILE`, a path whose contents are the value (for Docker
//! secrets). Empty values count as unset.

use std::net::SocketAddr;
use std::str::FromStr;

use anyhow::{anyhow, bail, Context};
use chrono::TimeDelta;
use sqlx::postgres::PgConnectOptions;
use tower_http::csrf::CsrfLayer;

/// Reads one environment variable; `std::env::var(..).ok()` in production.
pub type Env<'a> = &'a dyn Fn(&str) -> Option<String>;

pub struct Config {
    pub bind: SocketAddr,
    pub database: PgConnectOptions,
    pub settings: Settings,
    /// The first admin, created when the users table is empty.
    pub admin: Option<AdminBootstrap>,
    pub log_filter: String,
    pub log_format: LogFormat,
}

/// What request handling needs to know.
#[derive(Clone, Debug)]
pub struct Settings {
    /// Where people reach the web app, e.g. `https://taskmint.example`. Links
    /// are built from it, and it's the trusted origin for CSRF checks.
    pub public_origin: String,
    /// Marks the session cookie `Secure` (and names it with `__Host-`).
    pub cookie_secure: bool,
    /// Take the client IP from `X-Forwarded-For` (behind nginx).
    pub trust_proxy: bool,
    pub session_ttl: TimeDelta,
    pub invite_ttl: TimeDelta,
    pub reset_ttl: TimeDelta,
    pub max_body_bytes: usize,
}

impl Settings {
    /// Browsers only accept a `__Host-` cookie when it's `Secure`.
    pub fn cookie_name(&self) -> &'static str {
        if self.cookie_secure {
            "__Host-taskmint_session"
        } else {
            "taskmint_session"
        }
    }
}

pub struct AdminBootstrap {
    pub username: String,
    pub password: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogFormat {
    Text,
    Json,
}

impl Config {
    pub fn from_env(env: Env<'_>) -> anyhow::Result<Self> {
        let get = |name: &str| var(env, name);
        let bind = parse(&get, "TASKMINT_BIND", "0.0.0.0:3000")?;
        let database = match get("DATABASE_URL")? {
            Some(url) => PgConnectOptions::from_str(&url).context("DATABASE_URL")?,
            None => pg_from_env(get("PGPASSWORD")?),
        };
        let settings = Settings {
            public_origin: origin(get("TASKMINT_PUBLIC_ORIGIN")?)?,
            cookie_secure: flag(&get, "TASKMINT_COOKIE_SECURE", true)?,
            trust_proxy: flag(&get, "TASKMINT_TRUST_PROXY", false)?,
            session_ttl: TimeDelta::days(ranged(&get, "TASKMINT_SESSION_TTL_DAYS", 30, 365)?),
            invite_ttl: TimeDelta::hours(ranged(&get, "TASKMINT_INVITE_TTL_HOURS", 72, 8760)?),
            reset_ttl: TimeDelta::hours(ranged(&get, "TASKMINT_RESET_TTL_HOURS", 24, 8760)?),
            max_body_bytes: usize::try_from(ranged(&get, "TASKMINT_MAX_BODY_MB", 32, 1024)?)
                .expect("at most 1024")
                * 1024
                * 1024,
        };
        let admin = admin(
            get("TASKMINT_ADMIN_USERNAME")?,
            get("TASKMINT_ADMIN_PASSWORD")?,
        )?;
        let log_format = match get("TASKMINT_LOG_FORMAT")?.as_deref() {
            None | Some("text") => LogFormat::Text,
            Some("json") => LogFormat::Json,
            Some(other) => bail!("TASKMINT_LOG_FORMAT: expected text or json, got {other:?}"),
        };
        Ok(Self {
            bind,
            database,
            settings,
            admin,
            log_filter: get("RUST_LOG")?.unwrap_or_else(|| "info".to_owned()),
            log_format,
        })
    }
}

/// `NAME_FILE` wins over `NAME`; the file's trailing newline is dropped.
fn var(env: Env<'_>, name: &str) -> anyhow::Result<Option<String>> {
    let value = match env(&format!("{name}_FILE")) {
        Some(path) => Some(
            std::fs::read_to_string(&path)
                .with_context(|| format!("{name}_FILE: can't read {path}"))?
                .trim_end_matches(['\r', '\n'])
                .to_owned(),
        ),
        None => env(name),
    };
    Ok(value.filter(|value| !value.is_empty()))
}

fn parse<T>(
    get: &dyn Fn(&str) -> anyhow::Result<Option<String>>,
    name: &str,
    default: &str,
) -> anyhow::Result<T>
where
    T: FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    let value = get(name)?.unwrap_or_else(|| default.to_owned());
    value.parse().with_context(|| format!("{name}: {value:?}"))
}

fn flag(
    get: &dyn Fn(&str) -> anyhow::Result<Option<String>>,
    name: &str,
    default: bool,
) -> anyhow::Result<bool> {
    match get(name)?.as_deref() {
        None => Ok(default),
        Some("true" | "1" | "yes") => Ok(true),
        Some("false" | "0" | "no") => Ok(false),
        Some(other) => bail!("{name}: expected true or false, got {other:?}"),
    }
}

/// A whole number from 1 to `max`.
fn ranged(
    get: &dyn Fn(&str) -> anyhow::Result<Option<String>>,
    name: &str,
    default: i64,
    max: i64,
) -> anyhow::Result<i64> {
    let value: i64 = parse(get, name, &default.to_string())?;
    if (1..=max).contains(&value) {
        Ok(value)
    } else {
        bail!("{name}: must be 1 to {max}, got {value}")
    }
}

/// libpq-style `PG*` variables (sqlx reads them itself), plus a password
/// that may come from `PGPASSWORD_FILE`.
fn pg_from_env(password: Option<String>) -> PgConnectOptions {
    let options = PgConnectOptions::new();
    match password {
        Some(password) => options.password(&password),
        None => options,
    }
}

fn origin(value: Option<String>) -> anyhow::Result<String> {
    let value = value.unwrap_or_else(|| "http://localhost:8080".to_owned());
    let origin = value.trim_end_matches('/').to_owned();
    match CsrfLayer::new().add_trusted_origin(&origin) {
        Ok(_) => Ok(origin),
        Err(error) => bail!("TASKMINT_PUBLIC_ORIGIN: {error}"),
    }
}

fn admin(
    username: Option<String>,
    password: Option<String>,
) -> anyhow::Result<Option<AdminBootstrap>> {
    let (username, password) = match (username, password) {
        (None, None) => return Ok(None),
        (Some(username), Some(password)) => (username, password),
        _ => bail!("set both TASKMINT_ADMIN_USERNAME and TASKMINT_ADMIN_PASSWORD, or neither"),
    };
    let username = crate::accounts::username(&username)
        .map_err(|error| anyhow!("TASKMINT_ADMIN_USERNAME: {error}"))?;
    crate::accounts::password(&password)
        .map_err(|error| anyhow!("TASKMINT_ADMIN_PASSWORD: {error}"))?;
    Ok(Some(AdminBootstrap { username, password }))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn config(pairs: &[(&str, &str)]) -> anyhow::Result<Config> {
        let vars: HashMap<String, String> = pairs
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect();
        Config::from_env(&move |name| vars.get(name).cloned())
    }

    fn error(pairs: &[(&str, &str)]) -> String {
        format!("{:#}", config(pairs).err().expect("a config error"))
    }

    #[test]
    fn defaults_suit_the_compose_stack() {
        let config = config(&[]).unwrap();
        assert_eq!(config.bind, "0.0.0.0:3000".parse().unwrap());
        let settings = &config.settings;
        assert_eq!(settings.public_origin, "http://localhost:8080");
        assert!(settings.cookie_secure);
        assert_eq!(settings.cookie_name(), "__Host-taskmint_session");
        assert!(!settings.trust_proxy);
        assert_eq!(settings.session_ttl, TimeDelta::days(30));
        assert_eq!(settings.invite_ttl, TimeDelta::hours(72));
        assert_eq!(settings.reset_ttl, TimeDelta::hours(24));
        assert_eq!(settings.max_body_bytes, 32 * 1024 * 1024);
        assert!(config.admin.is_none());
        assert_eq!(config.log_format, LogFormat::Text);
        assert_eq!(config.log_filter, "info");
    }

    #[test]
    fn reads_every_variable() {
        let config = config(&[
            ("TASKMINT_BIND", "127.0.0.1:4000"),
            ("DATABASE_URL", "postgres://u:p@db:5432/tm"),
            ("TASKMINT_PUBLIC_ORIGIN", "https://tm.example/"),
            ("TASKMINT_COOKIE_SECURE", "no"),
            ("TASKMINT_TRUST_PROXY", "1"),
            ("TASKMINT_SESSION_TTL_DAYS", "7"),
            ("TASKMINT_INVITE_TTL_HOURS", "1"),
            ("TASKMINT_RESET_TTL_HOURS", "2"),
            ("TASKMINT_MAX_BODY_MB", "8"),
            ("TASKMINT_ADMIN_USERNAME", " Admin "),
            ("TASKMINT_ADMIN_PASSWORD", "long enough"),
            ("TASKMINT_LOG_FORMAT", "json"),
            ("RUST_LOG", "debug"),
        ])
        .unwrap();
        assert_eq!(config.bind, "127.0.0.1:4000".parse().unwrap());
        assert_eq!(config.database.get_host(), "db");
        assert_eq!(config.database.get_database(), Some("tm"));
        let settings = &config.settings;
        assert_eq!(settings.public_origin, "https://tm.example");
        assert!(!settings.cookie_secure);
        assert_eq!(settings.cookie_name(), "taskmint_session");
        assert!(settings.trust_proxy);
        assert_eq!(settings.session_ttl, TimeDelta::days(7));
        assert_eq!(settings.invite_ttl, TimeDelta::hours(1));
        assert_eq!(settings.reset_ttl, TimeDelta::hours(2));
        assert_eq!(settings.max_body_bytes, 8 * 1024 * 1024);
        let admin = config.admin.unwrap();
        assert_eq!(
            (admin.username.as_str(), admin.password.as_str()),
            ("admin", "long enough")
        );
        assert_eq!(config.log_format, LogFormat::Json);
        assert_eq!(config.log_filter, "debug");
    }

    #[test]
    fn other_spellings_and_empty_values() {
        let config = config(&[
            ("TASKMINT_BIND", ""),
            ("TASKMINT_COOKIE_SECURE", "false"),
            ("TASKMINT_TRUST_PROXY", "yes"),
            ("TASKMINT_LOG_FORMAT", "text"),
        ])
        .unwrap();
        assert_eq!(config.bind, "0.0.0.0:3000".parse().unwrap());
        assert!(!config.settings.cookie_secure);
        assert!(config.settings.trust_proxy);
        assert_eq!(config.log_format, LogFormat::Text);
        let config = super::tests::config(&[
            ("TASKMINT_COOKIE_SECURE", "0"),
            ("TASKMINT_TRUST_PROXY", "true"),
        ])
        .unwrap();
        assert!(!config.settings.cookie_secure);
        assert!(config.settings.trust_proxy);
    }

    #[test]
    fn without_database_url_uses_libpq_variables() {
        // sqlx reads PGHOST and friends from the process; the password may
        // also come from a file.
        assert!(config(&[]).is_ok());
        assert!(config(&[("PGPASSWORD", "secret")]).is_ok());
    }

    #[test]
    fn file_variants_win_and_lose_their_trailing_newline() {
        let dir = std::env::temp_dir().join(format!("taskmint-config-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let url = dir.join("url");
        std::fs::write(&url, "postgres://u:p@filehost/tm\n").unwrap();
        let password = dir.join("password");
        std::fs::write(&password, "from a file\r\n").unwrap();
        let config = config(&[
            ("DATABASE_URL", "postgres://ignored/x"),
            ("DATABASE_URL_FILE", url.to_str().unwrap()),
            ("TASKMINT_ADMIN_USERNAME", "root"),
            ("TASKMINT_ADMIN_PASSWORD_FILE", password.to_str().unwrap()),
        ])
        .unwrap();
        assert_eq!(config.database.get_host(), "filehost");
        assert_eq!(config.admin.unwrap().password, "from a file");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn every_variable_reports_an_unreadable_file() {
        for name in [
            "TASKMINT_BIND",
            "DATABASE_URL",
            "PGPASSWORD",
            "TASKMINT_PUBLIC_ORIGIN",
            "TASKMINT_COOKIE_SECURE",
            "TASKMINT_TRUST_PROXY",
            "TASKMINT_SESSION_TTL_DAYS",
            "TASKMINT_INVITE_TTL_HOURS",
            "TASKMINT_RESET_TTL_HOURS",
            "TASKMINT_MAX_BODY_MB",
            "TASKMINT_ADMIN_USERNAME",
            "TASKMINT_ADMIN_PASSWORD",
            "TASKMINT_LOG_FORMAT",
            "RUST_LOG",
        ] {
            let file_var = format!("{name}_FILE");
            let message = error(&[(&file_var, "/nonexistent/taskmint")]);
            assert!(
                message.starts_with(&format!("{file_var}: can't read")),
                "{message}"
            );
        }
    }

    #[test]
    fn rejects_bad_values() {
        for (pairs, expected) in [
            (vec![("TASKMINT_BIND", "nope")], "TASKMINT_BIND: \"nope\""),
            (
                vec![("DATABASE_URL", "postgres://db:port/tm")],
                "DATABASE_URL",
            ),
            (
                vec![("TASKMINT_PUBLIC_ORIGIN", "ftp://tm.example")],
                "TASKMINT_PUBLIC_ORIGIN: invalid origin",
            ),
            (
                vec![("TASKMINT_COOKIE_SECURE", "maybe")],
                "TASKMINT_COOKIE_SECURE: expected true or false",
            ),
            (
                vec![("TASKMINT_TRUST_PROXY", "maybe")],
                "TASKMINT_TRUST_PROXY: expected true or false",
            ),
            (
                vec![("TASKMINT_SESSION_TTL_DAYS", "0")],
                "TASKMINT_SESSION_TTL_DAYS: must be 1 to 365, got 0",
            ),
            (
                vec![("TASKMINT_SESSION_TTL_DAYS", "many")],
                "TASKMINT_SESSION_TTL_DAYS: \"many\"",
            ),
            (
                vec![("TASKMINT_INVITE_TTL_HOURS", "9000")],
                "TASKMINT_INVITE_TTL_HOURS: must be 1 to 8760",
            ),
            (
                vec![("TASKMINT_RESET_TTL_HOURS", "-1")],
                "TASKMINT_RESET_TTL_HOURS: must be 1 to 8760",
            ),
            (
                vec![("TASKMINT_MAX_BODY_MB", "2048")],
                "TASKMINT_MAX_BODY_MB: must be 1 to 1024",
            ),
            (
                vec![("TASKMINT_LOG_FORMAT", "xml")],
                "TASKMINT_LOG_FORMAT: expected text or json",
            ),
            (
                vec![("TASKMINT_ADMIN_USERNAME", "root")],
                "set both TASKMINT_ADMIN_USERNAME",
            ),
            (
                vec![("TASKMINT_ADMIN_PASSWORD", "long enough")],
                "set both TASKMINT_ADMIN_USERNAME",
            ),
            (
                vec![
                    ("TASKMINT_ADMIN_USERNAME", "no spaces"),
                    ("TASKMINT_ADMIN_PASSWORD", "long enough"),
                ],
                "TASKMINT_ADMIN_USERNAME: a username is",
            ),
            (
                vec![
                    ("TASKMINT_ADMIN_USERNAME", "root"),
                    ("TASKMINT_ADMIN_PASSWORD", "short"),
                ],
                "TASKMINT_ADMIN_PASSWORD: a password is",
            ),
        ] {
            let message = error(&pairs);
            assert!(message.starts_with(expected), "{pairs:?}: {message}");
        }
    }
}
