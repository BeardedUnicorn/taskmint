//! The frontend's records (tasks, notes, note templates, the daily goal and
//! its history), kept as opaque JSON: the frontend owns their schemas, so
//! fields Rust doesn't model are never dropped.

use crate::contract::APP_RECORD_KEYS;
use std::collections::HashSet;

pub type RecordMap = serde_json::Map<String, serde_json::Value>;

pub fn is_app_record_key(key: &str) -> bool {
    APP_RECORD_KEYS.contains(&key)
}

/// A list item's identity when merging: its id, or the whole item if it
/// has none.
fn record_item_identity(item: &serde_json::Value) -> String {
    match item.get("id").and_then(serde_json::Value::as_str) {
        Some(id) => format!("id:{}", id),
        None => format!("value:{}", item),
    }
}

/// Adds imported records without overwriting anything stored. A list (tasks,
/// notes, templates, goal history) gains the imported items whose id it
/// doesn't have; any other record (the goal) is set only where none is
/// stored. Unknown keys and null values are ignored. Returns the keys that
/// changed.
pub fn merge_imported_records(existing: &mut RecordMap, imported: RecordMap) -> Vec<String> {
    let mut changed = Vec::new();
    for (key, value) in imported {
        if !is_app_record_key(&key) || value.is_null() {
            continue;
        }
        match existing.get_mut(&key) {
            None | Some(serde_json::Value::Null) => {
                existing.insert(key.clone(), value);
                changed.push(key);
            }
            Some(serde_json::Value::Array(items)) => {
                let serde_json::Value::Array(imported_items) = value else {
                    continue;
                };
                let mut seen: HashSet<String> = items.iter().map(record_item_identity).collect();
                let before = items.len();
                for item in imported_items {
                    if seen.insert(record_item_identity(&item)) {
                        items.push(item);
                    }
                }
                if items.len() > before {
                    changed.push(key);
                }
            }
            // A stored goal stays as it is
            Some(_) => {}
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_the_five_record_keys_are_records() {
        for key in APP_RECORD_KEYS {
            assert!(is_app_record_key(key));
        }
        assert!(!is_app_record_key("sessions"));
        assert!(!is_app_record_key("theme-mode"));
    }

    #[test]
    fn importing_records_adds_to_them_and_never_overwrites() {
        let mut existing = RecordMap::new();
        existing.insert(
            "predefinedTasks".into(),
            json!([{ "id": "shared", "name": "Stored" }, { "id": "stored-only" }]),
        );
        existing.insert("dailyGoal".into(), json!({ "targetAmount": 50 }));
        existing.insert("noteTemplates".into(), serde_json::Value::Null);

        let mut imported = RecordMap::new();
        imported.insert(
            "predefinedTasks".into(),
            json!([{ "id": "shared", "name": "From webview" }, { "id": "webview-only" }]),
        );
        imported.insert("taskNotes".into(), json!([{ "id": "note" }]));
        imported.insert("dailyGoal".into(), json!({ "targetAmount": 100 }));
        imported.insert("noteTemplates".into(), json!([{ "id": "template" }]));
        imported.insert("dailyGoalAchievements".into(), serde_json::Value::Null);
        imported.insert("theme-mode".into(), json!("dark"));

        let mut changed = merge_imported_records(&mut existing, imported.clone());
        changed.sort();

        assert_eq!(
            changed,
            vec!["noteTemplates", "predefinedTasks", "taskNotes"]
        );
        // Stored items win on a shared id; new ones are added after them
        assert_eq!(
            existing["predefinedTasks"],
            json!([
                { "id": "shared", "name": "Stored" },
                { "id": "stored-only" },
                { "id": "webview-only" }
            ])
        );
        assert_eq!(existing["taskNotes"], json!([{ "id": "note" }]));
        assert_eq!(existing["noteTemplates"], json!([{ "id": "template" }]));
        // A stored goal stays
        assert_eq!(existing["dailyGoal"], json!({ "targetAmount": 50 }));
        assert!(!existing.contains_key("dailyGoalAchievements"));
        assert!(!existing.contains_key("theme-mode"));

        // A second import changes nothing
        assert!(merge_imported_records(&mut existing, imported).is_empty());
    }

    #[test]
    fn list_items_without_an_id_are_merged_by_their_whole_value() {
        let mut existing = RecordMap::new();
        existing.insert("taskNotes".into(), json!([{ "text": "a" }]));
        let mut imported = RecordMap::new();
        imported.insert(
            "taskNotes".into(),
            json!([{ "text": "a" }, { "text": "b" }]),
        );

        merge_imported_records(&mut existing, imported);

        assert_eq!(
            existing["taskNotes"],
            json!([{ "text": "a" }, { "text": "b" }])
        );
    }

    #[test]
    fn a_stored_list_ignores_an_imported_value_that_is_not_a_list() {
        let mut existing = RecordMap::new();
        existing.insert("taskNotes".into(), json!([{ "id": "note" }]));
        let mut imported = RecordMap::new();
        imported.insert("taskNotes".into(), json!({ "id": "not a list" }));

        assert!(merge_imported_records(&mut existing, imported).is_empty());
        assert_eq!(existing["taskNotes"], json!([{ "id": "note" }]));
    }
}
