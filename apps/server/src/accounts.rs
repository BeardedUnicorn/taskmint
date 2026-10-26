//! Users, roles and the account operations shared by the HTTP API and the
//! command line: the first-admin bootstrap, invites and password resets.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Settings;
use crate::passwords::Passwords;
use crate::secrets;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, clap::ValueEnum,
)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum Role {
    Admin,
    User,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::User => "user",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub time_zone: String,
}

/// Normalizes a username (trimmed, lowercased) and checks it fits the
/// `users.username` constraint.
pub fn username(raw: &str) -> Result<String, &'static str> {
    let name = raw.trim().to_lowercase();
    let mut chars = name.chars();
    let valid = name.len() <= 64
        && chars
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'));
    if valid {
        Ok(name)
    } else {
        Err("a username is 1-64 letters, digits, '.', '_' or '-', starting with a letter or digit")
    }
}

pub fn password(password: &str) -> Result<(), &'static str> {
    if (8..=256).contains(&password.chars().count()) {
        Ok(())
    } else {
        Err("a password is 8-256 characters")
    }
}

/// Trims `raw` and checks its length in characters.
pub fn trimmed(
    raw: &str,
    min: usize,
    max: usize,
    error: &'static str,
) -> Result<String, &'static str> {
    let text = raw.trim();
    if (min..=max).contains(&text.chars().count()) {
        Ok(text.to_owned())
    } else {
        Err(error)
    }
}

pub fn display_name(raw: &str) -> Result<String, &'static str> {
    trimmed(raw, 0, 100, "a display name is at most 100 characters")
}

pub fn invite_note(raw: &str) -> Result<String, &'static str> {
    trimmed(raw, 0, 200, "a note is at most 200 characters")
}

/// Creates the first admin when the users table is empty. Returns whether
/// it did.
pub async fn bootstrap_admin(
    db: &PgPool,
    passwords: &Passwords,
    username: &str,
    password: &str,
) -> Result<bool, sqlx::Error> {
    let hash = passwords.hash(password.to_owned()).await;
    sqlx::query_scalar!(
        r#"
        WITH admin AS (
            INSERT INTO users (username, password_hash, role)
            SELECT $1, $2, 'admin'
            WHERE NOT EXISTS (SELECT 1 FROM users)
            RETURNING id
        ), audit AS (
            INSERT INTO audit_events (action, target_user_id)
            SELECT 'user.bootstrap', id FROM admin
        )
        SELECT count(*) AS "created!" FROM admin
        "#,
        username,
        hash,
    )
    .fetch_one(db)
    .await
    .map(|created| created > 0)
}

/// Who did something, for `audit_events`. Both are `None` on the command line.
#[derive(Clone, Copy, Default)]
pub struct Actor<'a> {
    pub user_id: Option<Uuid>,
    pub ip: Option<&'a str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInvite {
    pub id: Uuid,
    pub url: String,
    pub role: Role,
    pub note: String,
    pub expires_at: DateTime<Utc>,
}

pub async fn create_invite(
    db: &PgPool,
    settings: &Settings,
    actor: Actor<'_>,
    role: Role,
    note: &str,
) -> Result<NewInvite, sqlx::Error> {
    let token = secrets::token();
    let expires_at = Utc::now() + settings.invite_ttl;
    let row = sqlx::query!(
        r#"
        WITH invite AS (
            INSERT INTO invites (token_hash, role, note, created_by, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, role, note, expires_at
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, detail, ip)
            SELECT $4, 'invite.create', jsonb_build_object('inviteId', id, 'role', role), $6
            FROM invite
        )
        SELECT id AS "id!", role AS "role!: Role", note AS "note!", expires_at AS "expires_at!"
        FROM invite
        "#,
        secrets::hash(&token),
        role.as_str(),
        note,
        actor.user_id,
        expires_at,
        actor.ip,
    )
    .fetch_one(db)
    .await?;
    Ok(NewInvite {
        id: row.id,
        url: format!("{}/invite/{token}", settings.public_origin),
        role: row.role,
        note: row.note,
        expires_at: row.expires_at,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPasswordReset {
    pub username: String,
    pub url: String,
    pub expires_at: DateTime<Utc>,
}

/// Issues a one-time password-reset link for the active user with this id
/// or username, replacing any link still pending for them. `None` when no
/// such active user exists.
pub async fn create_password_reset(
    db: &PgPool,
    settings: &Settings,
    actor: Actor<'_>,
    user_id: Option<Uuid>,
    username: Option<&str>,
) -> Result<Option<NewPasswordReset>, sqlx::Error> {
    let token = secrets::token();
    let expires_at = Utc::now() + settings.reset_ttl;
    let row = sqlx::query!(
        r#"
        WITH target AS (
            SELECT id, username FROM users
            WHERE (id = $1 OR username = $2) AND disabled_at IS NULL
        ), replaced AS (
            UPDATE password_resets SET expires_at = now()
            WHERE user_id IN (SELECT id FROM target) AND used_at IS NULL AND expires_at > now()
        ), reset AS (
            INSERT INTO password_resets (user_id, token_hash, created_by, expires_at)
            SELECT id, $3, $4, $5 FROM target
            RETURNING id, user_id, expires_at
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT $4, 'password_reset.create', user_id, jsonb_build_object('resetId', id), $6
            FROM reset
        )
        SELECT target.username, reset.expires_at
        FROM reset JOIN target ON target.id = reset.user_id
        "#,
        user_id,
        username,
        secrets::hash(&token),
        actor.user_id,
        expires_at,
        actor.ip,
    )
    .fetch_optional(db)
    .await?;
    Ok(row.map(|row| NewPasswordReset {
        username: row.username,
        url: format!("{}/reset/{token}", settings.public_origin),
        expires_at: row.expires_at,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usernames_are_normalized_and_checked() {
        assert_eq!(username("  Alice.B-2_ ").unwrap(), "alice.b-2_");
        assert_eq!(username("7").unwrap(), "7");
        assert_eq!(username(&"a".repeat(64)).unwrap().len(), 64);
        for bad in [
            "",
            "   ",
            "_alice",
            ".alice",
            "al ice",
            "alice!",
            "Ålice",
            &"a".repeat(65),
        ] {
            assert!(username(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn passwords_and_free_text_have_length_limits() {
        assert!(password("8 chars!").is_ok());
        assert!(password("7 chars").is_err());
        assert!(password(&"é".repeat(256)).is_ok());
        assert!(password(&"x".repeat(257)).is_err());
        assert_eq!(display_name("  Alice  ").unwrap(), "Alice");
        assert!(display_name(&"x".repeat(101)).is_err());
        assert_eq!(invite_note("").unwrap(), "");
        assert!(invite_note(&"x".repeat(201)).is_err());
    }
}
