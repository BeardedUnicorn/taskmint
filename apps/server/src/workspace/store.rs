//! A user's workspace in Postgres: reading the parts a command needs, and
//! saving what it changed, one row per record (see migrations/0002).
//!
//! Each step is one statement, or one list of statements run in order, so a
//! failure anywhere in it surfaces in one place.

use std::collections::HashSet;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::postgres::PgArguments;
use sqlx::query::Query;
use sqlx::{PgConnection, PgExecutor, Postgres};
use taskmint_core::command::Backup;
use taskmint_core::contract::APP_RECORD_KEYS;
use taskmint_core::model::{PendingCapture, ProjectTaskMapping, TaskSession, WorkLogEntry};
use taskmint_core::workspace::{Parts, Workspace};
use uuid::Uuid;

use super::diff::{diff_rows, Row, RowChanges};

/// Copies of each kind kept, as the desktop keeps 10 `.bak` files.
const SNAPSHOTS_KEPT: i64 = 10;

type Statement = Query<'static, Postgres, PgArguments>;

/// How a table of records with ids is written.
struct RowTable {
    delete: &'static str,
    write: &'static str,
}

const SESSIONS: RowTable = RowTable {
    delete: "DELETE FROM sessions WHERE user_id = $1 AND id = ANY($2)",
    write: "INSERT INTO sessions (user_id, id, data)
            SELECT $1, id, data FROM UNNEST($2::text[], $3::jsonb[]) WITH ORDINALITY AS t (id, data, n)
            ORDER BY n
            ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data",
};

const ENTRIES: RowTable = RowTable {
    delete: "DELETE FROM work_log_entries WHERE user_id = $1 AND id = ANY($2)",
    write: "INSERT INTO work_log_entries (user_id, id, data)
            SELECT $1, id, data FROM UNNEST($2::text[], $3::jsonb[]) WITH ORDINALITY AS t (id, data, n)
            ORDER BY n
            ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data",
};

const MAPPINGS: RowTable = RowTable {
    delete: "DELETE FROM project_mappings WHERE user_id = $1 AND project_id = ANY($2)",
    write: "INSERT INTO project_mappings (user_id, project_id, data)
            SELECT $1, id, data FROM UNNEST($2::text[], $3::jsonb[]) WITH ORDINALITY AS t (id, data, n)
            ORDER BY n
            ON CONFLICT (user_id, project_id) DO UPDATE SET data = EXCLUDED.data",
};

fn session_id(session: &TaskSession) -> &str {
    &session.id
}

fn entry_id(entry: &WorkLogEntry) -> &str {
    &entry.id
}

fn mapping_id(mapping: &ProjectTaskMapping) -> &str {
    &mapping.project_id
}

/// The ids of rows that were stored but couldn't be read, by table. They're
/// never saved over.
#[derive(Debug, Default)]
pub struct Unreadable {
    sessions: HashSet<String>,
    entries: HashSet<String>,
    mappings: HashSet<String>,
}

/// The parts read for a command.
pub struct Loaded {
    pub workspace: Workspace,
    pub unreadable: Unreadable,
}

/// `[id, data]` pairs (none when the table has no rows) read as `T`s. A
/// row that doesn't read as one, or whose record has another id, is left
/// out and its id returned.
fn read_rows<T: DeserializeOwned>(
    table: &str,
    pairs: Option<Value>,
    id_of: fn(&T) -> &str,
) -> (Vec<T>, HashSet<String>) {
    let pairs: Vec<Row> = pairs
        .map(|pairs| serde_json::from_value(pairs).expect("the query returns [id, data] pairs"))
        .unwrap_or_default();
    let mut records = Vec::with_capacity(pairs.len());
    let mut unreadable = HashSet::new();
    for (id, data) in pairs {
        match serde_json::from_value::<T>(data) {
            Ok(record) if id_of(&record) == id => records.push(record),
            outcome => {
                let error = outcome.err().map(|e| e.to_string());
                tracing::warn!(table, id, ?error, "skipping an unreadable row");
                unreadable.insert(id);
            }
        }
    }
    (records, unreadable)
}

/// What the user is told about rows that couldn't be read.
fn skipped_warning(count: usize, what: &str) -> Option<String> {
    (count > 0).then(|| {
        format!(
            "{} saved {} record(s) could not be read and were skipped. They're kept as they are.",
            count, what
        )
    })
}

/// Reads `parts` of the user's workspace, in one statement.
pub async fn load<'c>(
    db: impl PgExecutor<'c>,
    user: Uuid,
    parts: Parts,
) -> Result<Loaded, sqlx::Error> {
    let stored = sqlx::query!(
        r#"
        SELECT
            CASE WHEN $2 THEN (
                SELECT jsonb_agg(jsonb_build_array(id, data) ORDER BY seq)
                FROM sessions WHERE user_id = $1
            ) END AS sessions,
            CASE WHEN $3 THEN (
                SELECT jsonb_agg(jsonb_build_array(id, data) ORDER BY seq)
                FROM work_log_entries WHERE user_id = $1
            ) END AS entries,
            CASE WHEN $3 THEN (
                SELECT jsonb_agg(jsonb_build_array(project_id, data) ORDER BY seq)
                FROM project_mappings WHERE user_id = $1
            ) END AS mappings,
            CASE WHEN $4 THEN (
                SELECT jsonb_agg(jsonb_build_array(key, value, revision))
                FROM app_records WHERE user_id = $1
            ) END AS records,
            CASE WHEN $5 THEN (
                SELECT data FROM pending_captures WHERE user_id = $1
            ) END AS capture
        "#,
        user,
        parts.contains(Parts::SESSIONS),
        parts.contains(Parts::WORK_LOGS),
        parts.contains(Parts::RECORDS),
        parts.contains(Parts::CAPTURE),
    )
    .fetch_one(db)
    .await?;

    let mut workspace = Workspace::default();
    let (sessions, skipped_sessions) = read_rows("sessions", stored.sessions, session_id);
    let (entries, skipped_entries) = read_rows("work_log_entries", stored.entries, entry_id);
    let (mappings, skipped_mappings) = read_rows("project_mappings", stored.mappings, mapping_id);
    workspace.sessions = sessions;
    workspace.work_log_entries = entries;
    workspace.work_log_mappings = mappings;
    workspace.notes.session_warning = skipped_warning(skipped_sessions.len(), "session");
    workspace.notes.work_log_warning =
        skipped_warning(skipped_entries.len() + skipped_mappings.len(), "work-log");

    let records: Vec<(String, Option<Value>, u64)> = stored
        .records
        .map(|rows| serde_json::from_value(rows).expect("the query returns [key, value, revision]"))
        .unwrap_or_default();
    for (key, value, revision) in records {
        // A removed record keeps only its revision
        if let Some(value) = value {
            workspace.records.insert(key.clone(), value);
        }
        workspace.record_revisions.insert(key, revision);
    }
    workspace.pending_capture = stored.capture.and_then(|data| {
        serde_json::from_value::<PendingCapture>(data)
            .inspect_err(|error| tracing::warn!(%error, "skipping an unreadable capture"))
            .ok()
    });
    Ok(Loaded {
        workspace,
        unreadable: Unreadable {
            sessions: skipped_sessions,
            entries: skipped_entries,
            mappings: skipped_mappings,
        },
    })
}

/// Records as rows: each one's id and JSON.
fn rows<T: Serialize>(records: &[T], id_of: fn(&T) -> &str) -> Vec<Row> {
    records
        .iter()
        .map(|record| {
            let data = serde_json::to_value(record).expect("records are plain data");
            (id_of(record).to_string(), data)
        })
        .collect()
}

/// The statements that make `changes` to `table`.
fn row_statements(table: &RowTable, user: Uuid, changes: RowChanges) -> Vec<Statement> {
    let mut statements = Vec::new();
    if !changes.deletes.is_empty() {
        statements.push(sqlx::query(table.delete).bind(user).bind(changes.deletes));
    }
    if !changes.writes.is_empty() {
        let (ids, data): (Vec<String>, Vec<Value>) = changes.writes.into_iter().unzip();
        statements.push(sqlx::query(table.write).bind(user).bind(ids).bind(data));
    }
    statements
}

/// The statements that save the `dirty` parts of `after` over what was
/// loaded.
fn save_statements(user: Uuid, loaded: &Loaded, after: &Workspace, dirty: Parts) -> Vec<Statement> {
    let before = &loaded.workspace;
    let mut statements = Vec::new();
    if dirty.contains(Parts::SESSIONS) {
        let changes = diff_rows(
            &rows(&before.sessions, session_id),
            &rows(&after.sessions, session_id),
            &loaded.unreadable.sessions,
        );
        statements.extend(row_statements(&SESSIONS, user, changes));
    }
    if dirty.contains(Parts::WORK_LOGS) {
        let entries = diff_rows(
            &rows(&before.work_log_entries, entry_id),
            &rows(&after.work_log_entries, entry_id),
            &loaded.unreadable.entries,
        );
        statements.extend(row_statements(&ENTRIES, user, entries));
        let mappings = diff_rows(
            &rows(&before.work_log_mappings, mapping_id),
            &rows(&after.work_log_mappings, mapping_id),
            &loaded.unreadable.mappings,
        );
        statements.extend(row_statements(&MAPPINGS, user, mappings));
    }
    if dirty.contains(Parts::RECORDS) {
        let changed = APP_RECORD_KEYS.iter().filter(|key| {
            before.records.get(**key) != after.records.get(**key)
                || before.revision(key) != after.revision(key)
        });
        for key in changed {
            statements.push(
                sqlx::query(
                    "INSERT INTO app_records (user_id, key, value, revision) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, key) DO UPDATE
                     SET value = EXCLUDED.value, revision = EXCLUDED.revision",
                )
                .bind(user)
                .bind(*key)
                .bind(after.records.get(*key).cloned())
                .bind(after.revision(key) as i64),
            );
        }
    }
    if dirty.contains(Parts::CAPTURE) {
        statements.push(match &after.pending_capture {
            Some(capture) => sqlx::query(
                "INSERT INTO pending_captures (user_id, data) VALUES ($1, $2)
                 ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, received_at = now()",
            )
            .bind(user)
            .bind(serde_json::to_value(capture).expect("a capture is plain data")),
            None => sqlx::query("DELETE FROM pending_captures WHERE user_id = $1").bind(user),
        });
    }
    statements
}

/// Saves the `dirty` parts of `after` over what was loaded.
pub async fn save(
    conn: &mut PgConnection,
    user: Uuid,
    loaded: &Loaded,
    after: &Workspace,
    dirty: Parts,
) -> Result<(), sqlx::Error> {
    for statement in save_statements(user, loaded, after, dirty) {
        statement.execute(&mut *conn).await?;
    }
    Ok(())
}

/// Locks the user's workspace (making it on their first change) and counts
/// the change. Held until the transaction ends.
pub async fn lock(conn: &mut PgConnection, user: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO workspaces (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE
         SET version = workspaces.version + 1, updated_at = now()",
        user
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// A part's contents, as its desktop file holds them.
type Contents = fn(&Workspace) -> Value;

/// The parts a copy can hold, by kind, each in its desktop file's shape.
const SNAPSHOT_KINDS: [(Parts, &str, Contents); 3] = [
    (
        Parts::SESSIONS,
        "sessions",
        |w| json!({ "sessions": w.sessions }),
    ),
    (
        Parts::WORK_LOGS,
        "work_logs",
        |w| json!({ "entries": w.work_log_entries, "mappings": w.work_log_mappings }),
    ),
    (Parts::RECORDS, "records", |w| {
        Value::Object(w.records.clone())
    }),
];

/// The copies `backups` ask for, by kind, of `before`.
fn snapshots(backups: &[Backup], before: &Workspace) -> Vec<(&'static str, Value)> {
    let mut copies = Vec::new();
    for backup in backups {
        match backup {
            Backup::Saved { parts, .. } => copies.extend(
                SNAPSHOT_KINDS
                    .iter()
                    .filter(|(part, _, _)| parts.contains(*part))
                    .map(|(_, kind, contents)| (*kind, contents(before))),
            ),
            Backup::Incoming { records, .. } => {
                copies.push(("incoming_records", Value::Object(records.clone())))
            }
        }
    }
    copies
}

/// Keeps the copies a command asks for, of the data as it was loaded,
/// dropping the oldest of each kind past the newest 10. They're written in
/// the change's own transaction: a database that can't take a copy can't
/// take the change either, so every copy is required here.
pub async fn keep(
    conn: &mut PgConnection,
    user: Uuid,
    reason: &str,
    backups: &[Backup],
    before: &Workspace,
) -> Result<(), sqlx::Error> {
    for (kind, data) in snapshots(backups, before) {
        // The DELETE can't see the row the INSERT adds, so it keeps one fewer
        sqlx::query!(
            "WITH added AS (
                 INSERT INTO data_snapshots (user_id, kind, reason, data) VALUES ($1, $2, $3, $4)
             )
             DELETE FROM data_snapshots
             WHERE user_id = $1 AND kind = $2 AND id NOT IN (
                 SELECT id FROM data_snapshots WHERE user_id = $1 AND kind = $2
                 ORDER BY id DESC LIMIT $5
             )",
            user,
            kind,
            reason,
            data,
            SNAPSHOTS_KEPT - 1,
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Reset All Data: every record and every copy of the user's goes. Returns
/// how many copies were deleted.
pub async fn purge(conn: &mut PgConnection, user: Uuid) -> Result<usize, sqlx::Error> {
    let deleted = sqlx::query_scalar!(
        r#"
        WITH sessions AS (DELETE FROM sessions WHERE user_id = $1),
             entries AS (DELETE FROM work_log_entries WHERE user_id = $1),
             mappings AS (DELETE FROM project_mappings WHERE user_id = $1),
             records AS (DELETE FROM app_records WHERE user_id = $1),
             captures AS (DELETE FROM pending_captures WHERE user_id = $1),
             copies AS (DELETE FROM data_snapshots WHERE user_id = $1 RETURNING 1)
        SELECT count(*) AS "deleted!" FROM copies
        "#,
        user
    )
    .fetch_one(conn)
    .await?;
    Ok(deleted as usize)
}

#[cfg(test)]
mod tests {
    use super::*;
    use taskmint_core::records::RecordMap;

    #[test]
    fn a_copy_of_each_part_has_its_desktop_file_shape() {
        let mut workspace = Workspace::default();
        workspace.records.insert("dailyGoal".into(), json!(5));
        let mut incoming = RecordMap::new();
        incoming.insert("taskNotes".into(), json!([]));
        let backups = [
            Backup::Saved {
                parts: Parts::ALL,
                failure: "",
                required: false,
            },
            Backup::Incoming {
                records: incoming,
                failure: "",
            },
        ];
        assert_eq!(
            snapshots(&backups, &workspace),
            [
                ("sessions", json!({ "sessions": [] })),
                ("work_logs", json!({ "entries": [], "mappings": [] })),
                ("records", json!({ "dailyGoal": 5 })),
                ("incoming_records", json!({ "taskNotes": [] })),
            ]
        );
    }

    #[test]
    fn skipped_rows_are_reported_only_when_there_are_some() {
        assert_eq!(skipped_warning(0, "session"), None);
        assert_eq!(
            skipped_warning(2, "work-log").unwrap(),
            "2 saved work-log record(s) could not be read and were skipped. They're kept as they are."
        );
    }
}
