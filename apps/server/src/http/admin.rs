//! Admin: users (disable/enable, role, reset links) and invites. Every
//! change is written to `audit_events`.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::created;
use super::extract::{AdminSession, ClientIp, JsonBody, Path};
use crate::accounts::{self, Actor, Role};
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    id: Uuid,
    username: String,
    display_name: String,
    role: Role,
    created_at: DateTime<Utc>,
    disabled_at: Option<DateTime<Utc>>,
    last_seen_at: Option<DateTime<Utc>>,
}

pub async fn list_users(
    _: AdminSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<AdminUser>>, ApiError> {
    sqlx::query_as!(
        AdminUser,
        r#"
        SELECT u.id, u.username, u.display_name, u.role AS "role: Role", u.created_at,
               u.disabled_at,
               (SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.user_id = u.id)
                   AS last_seen_at
        FROM users u
        ORDER BY u.username
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map(Json)
    .map_err(ApiError::from)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserChange {
    disabled: Option<bool>,
    role: Option<Role>,
}

/// Disables or enables a user and/or changes their role. Disabling signs
/// the user out everywhere and revokes their API tokens. Refused (409) if
/// it would leave no active admin.
pub async fn update_user(
    AdminSession(admin): AdminSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(id): Path<Uuid>,
    JsonBody(change): JsonBody<UserChange>,
) -> Result<Json<AdminUser>, ApiError> {
    if change.disabled.is_none() && change.role.is_none() {
        return Err(ApiError::invalid(
            "nothing to change: send disabled and/or role",
        ));
    }
    // The active admins are locked first, so two admins demoting each other
    // at once can't both succeed.
    let row = sqlx::query!(
        r#"
        WITH active_admins AS MATERIALIZED (
            SELECT count(*) AS n FROM (
                SELECT id FROM users WHERE role = 'admin' AND disabled_at IS NULL FOR UPDATE
            ) locked
        ), updated AS (
            UPDATE users SET
                disabled_at = CASE
                    WHEN $2::bool IS NULL THEN disabled_at
                    WHEN $2::bool THEN coalesce(disabled_at, now())
                    ELSE NULL
                END,
                role = coalesce($3::text, role),
                updated_at = now()
            WHERE id = $1 AND (
                role <> 'admin' OR disabled_at IS NOT NULL
                OR (NOT coalesce($2::bool, false) AND coalesce($3::text, 'admin') = 'admin')
                OR (SELECT n FROM active_admins) > 1
            )
            RETURNING id, role, disabled_at
        ), signed_out AS (
            DELETE FROM auth_sessions
            WHERE user_id IN (SELECT id FROM updated WHERE disabled_at IS NOT NULL)
        ), revoked AS (
            UPDATE api_tokens SET revoked_at = now()
            WHERE revoked_at IS NULL
              AND user_id IN (SELECT id FROM updated WHERE disabled_at IS NOT NULL)
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, target_user_id, detail, ip)
            SELECT $4, 'user.update', id,
                   jsonb_strip_nulls(jsonb_build_object('disabled', $2::bool, 'role', $3::text)), $5
            FROM updated
        )
        SELECT u.id AS "id!", u.username AS "username!", u.display_name AS "display_name!",
               coalesce(updated.role, u.role) AS "role!: Role", u.created_at AS "created_at!",
               CASE WHEN updated.id IS NULL THEN u.disabled_at ELSE updated.disabled_at END
                   AS disabled_at,
               (SELECT max(s.last_seen_at) FROM auth_sessions s WHERE s.user_id = u.id)
                   AS last_seen_at,
               updated.id IS NOT NULL AS "changed!"
        FROM users u LEFT JOIN updated ON updated.id = u.id
        WHERE u.id = $1
        "#,
        id,
        change.disabled,
        change.role.map(Role::as_str),
        admin.user.id,
        ip.to_string(),
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("no such user"))?;
    if !row.changed {
        return Err(ApiError::conflict(
            "last_admin",
            "there must be at least one active admin",
        ));
    }
    Ok(Json(AdminUser {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        created_at: row.created_at,
        disabled_at: row.disabled_at,
        last_seen_at: row.last_seen_at,
    }))
}

/// A one-time link the admin passes on; there's no email.
pub async fn create_password_reset(
    AdminSession(admin): AdminSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let ip = ip.to_string();
    let actor = Actor {
        user_id: Some(admin.user.id),
        ip: Some(&ip),
    };
    accounts::create_password_reset(&state.db, &state.settings, actor, Some(id), None)
        .await?
        .map(created)
        .ok_or_else(|| ApiError::not_found("no active user with that id"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteRow {
    id: Uuid,
    role: Role,
    note: String,
    /// pending, used, revoked or expired
    status: String,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    created_by: Option<String>,
    used_by: Option<String>,
    used_at: Option<DateTime<Utc>>,
}

pub async fn list_invites(
    _: AdminSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<InviteRow>>, ApiError> {
    sqlx::query_as!(
        InviteRow,
        r#"
        SELECT i.id, i.role AS "role: Role", i.note,
               CASE
                   WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                   WHEN i.used_at IS NOT NULL THEN 'used'
                   WHEN i.expires_at <= now() THEN 'expired'
                   ELSE 'pending'
               END AS "status!",
               i.created_at, i.expires_at,
               creator.username AS "created_by?", invitee.username AS "used_by?", i.used_at
        FROM invites i
        LEFT JOIN users creator ON creator.id = i.created_by
        LEFT JOIN users invitee ON invitee.id = i.used_by
        ORDER BY i.created_at DESC
        LIMIT 500
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map(Json)
    .map_err(ApiError::from)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateInvite {
    role: Option<Role>,
    #[serde(default)]
    note: String,
}

pub async fn create_invite(
    AdminSession(admin): AdminSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    JsonBody(body): JsonBody<CreateInvite>,
) -> Result<impl IntoResponse, ApiError> {
    let note = accounts::invite_note(&body.note).map_err(ApiError::invalid)?;
    let ip = ip.to_string();
    let actor = Actor {
        user_id: Some(admin.user.id),
        ip: Some(&ip),
    };
    let role = body.role.unwrap_or(Role::User);
    accounts::create_invite(&state.db, &state.settings, actor, role, &note)
        .await
        .map(created)
        .map_err(ApiError::from)
}

/// Revokes an invite that hasn't been used yet.
pub async fn revoke_invite(
    AdminSession(admin): AdminSession,
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    sqlx::query_scalar!(
        r#"
        WITH invite AS (
            UPDATE invites SET revoked_at = now()
            WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
            RETURNING id
        ), audit AS (
            INSERT INTO audit_events (actor_id, action, detail, ip)
            SELECT $2, 'invite.revoke', jsonb_build_object('inviteId', id), $3 FROM invite
        )
        SELECT id AS "id!" FROM invite
        "#,
        id,
        admin.user.id,
        ip.to_string(),
    )
    .fetch_optional(&state.db)
    .await?
    .map(|_| StatusCode::NO_CONTENT)
    .ok_or_else(|| ApiError::not_found("no pending invite with that id"))
}
