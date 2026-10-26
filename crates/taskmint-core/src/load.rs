//! Reading stored collections one record at a time, so a single unreadable
//! record (after a schema change, say) is skipped instead of wiping the whole
//! collection. Hosts report the skipped count to the user.

use crate::model::{ProjectTaskMapping, TaskSession, WorkLogEntry};

pub struct LoadedSessions {
    pub sessions: Vec<TaskSession>,
    pub skipped: usize,
}

/// Parse the stored sessions array.
pub fn parse_sessions(value: &serde_json::Value) -> Result<LoadedSessions, String> {
    let records = value
        .as_array()
        .ok_or_else(|| "Stored sessions value is not an array".to_string())?;

    let mut sessions = Vec::with_capacity(records.len());
    let mut skipped = 0;
    for record in records {
        match serde_json::from_value::<TaskSession>(record.clone()) {
            Ok(session) => sessions.push(session),
            Err(e) => {
                skipped += 1;
                log::warn!("Skipping unreadable session record: {}", e);
            }
        }
    }

    Ok(LoadedSessions { sessions, skipped })
}

/// Parse one stored array. Mirrors parse_sessions.
fn parse_records<T: serde::de::DeserializeOwned>(
    value: &serde_json::Value,
    label: &str,
) -> Result<(Vec<T>, usize), String> {
    let records = value
        .as_array()
        .ok_or_else(|| format!("Stored {} value is not an array", label))?;

    let mut items = Vec::with_capacity(records.len());
    let mut skipped = 0;
    for record in records {
        match serde_json::from_value::<T>(record.clone()) {
            Ok(item) => items.push(item),
            Err(e) => {
                skipped += 1;
                log::warn!("Skipping unreadable {} record: {}", label, e);
            }
        }
    }

    Ok((items, skipped))
}

pub fn parse_work_log_entries(
    value: &serde_json::Value,
) -> Result<(Vec<WorkLogEntry>, usize), String> {
    parse_records(value, "work-log entry")
}

pub fn parse_project_mappings(
    value: &serde_json::Value,
) -> Result<(Vec<ProjectTaskMapping>, usize), String> {
    parse_records(value, "project mapping")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_session_json(id: &str) -> serde_json::Value {
        json!({
            "id": id,
            "taskId": "task_1",
            "taskName": "Test task",
            "timerInstances": [],
            "totalDuration": 0,
            "isActive": false,
            "date": "2026-08-18",
            "createdAt": "2026-08-18T00:00:00Z",
            "updatedAt": "2026-08-18T00:00:00Z"
        })
    }

    #[test]
    fn parse_skips_bad_records_and_keeps_good_ones() {
        let value = json!([
            valid_session_json("session_1"),
            { "garbage": true },
            valid_session_json("session_2"),
        ]);

        let loaded = parse_sessions(&value).unwrap();
        assert_eq!(loaded.sessions.len(), 2);
        assert_eq!(loaded.skipped, 1);
        assert_eq!(loaded.sessions[0].id, "session_1");
        assert_eq!(loaded.sessions[1].id, "session_2");
    }

    #[test]
    fn parse_tolerates_missing_defaultable_fields() {
        // A record written by an older schema: no totalDuration/isActive/date.
        let value = json!([
            {
                "id": "session_old",
                "taskId": "task_1",
                "taskName": "Old task",
                "timerInstances": [
                    {
                        "id": "instance_old",
                        "sessionId": "session_old",
                        "startTime": "2026-08-18T00:00:00Z"
                    }
                ]
            }
        ]);

        let loaded = parse_sessions(&value).unwrap();
        assert_eq!(loaded.skipped, 0);
        assert_eq!(loaded.sessions.len(), 1);
        let session = &loaded.sessions[0];
        assert_eq!(session.total_duration, 0);
        assert!(!session.is_active);
        assert_eq!(session.timer_instances.len(), 1);
        assert!(!session.timer_instances[0].is_running);
    }

    #[test]
    fn parse_rejects_non_array_value() {
        assert!(parse_sessions(&json!({"not": "an array"})).is_err());
    }

    #[test]
    fn parse_work_log_entries_skips_bad_records_and_keeps_good_ones() {
        let value = json!([
            {
                "id": "entry-1",
                "kind": "timed",
                "workDay": "2026-08-26",
                "amountCents": 3750
            },
            { "garbage": true },
            {
                "id": "entry-2",
                "kind": "workLog"
            },
        ]);

        let (entries, skipped) = parse_work_log_entries(&value).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(skipped, 1);
        assert_eq!(entries[0].id, "entry-1");
        assert_eq!(entries[1].id, "entry-2");
    }

    #[test]
    fn parse_work_log_entries_rejects_non_array_value() {
        assert!(parse_work_log_entries(&json!({"not": "an array"})).is_err());
    }

    #[test]
    fn parse_project_mappings_skips_records_missing_project_id() {
        let value = json!([
            { "projectId": "proj-1", "taskId": "task-1" },
            { "taskId": "orphan" },
        ]);

        let (mappings, skipped) = parse_project_mappings(&value).unwrap();
        assert_eq!(mappings.len(), 1);
        assert_eq!(skipped, 1);
        assert_eq!(mappings[0].project_id, "proj-1");
    }
}
