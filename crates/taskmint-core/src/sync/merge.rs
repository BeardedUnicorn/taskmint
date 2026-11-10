//! Three-way merges of an entity changed on this device and elsewhere since
//! they last agreed (the baseline). Neither side is lost where they changed
//! different things; where both changed the same thing, this device's
//! version wins (it is pushed afterwards, so it is also the last write).
//!
//! - A list of items keyed by `id` (a session's timers, the tasks, notes,
//!   templates and withdrawals) merges item by item, and the goal history
//!   by `date`: what either side added is kept, what either side removed
//!   goes, and an item changed on both sides keeps this device's version.
//! - An object (a session, the daily goal, the account settings) merges
//!   field by field the same way, one level deep: two changes to one field
//!   keep this device's.
//! - Without a baseline (the first sync on a device that already had data),
//!   nothing counts as removed: the two are joined, this device's version
//!   winning where both have an item.

use serde_json::{Map, Value};

/// What a list's items are keyed by: the goal history by day (a day's entry
/// is replaced under a new id), everything else by id.
pub fn item_key(record_key: &str) -> &'static str {
    match record_key {
        "dailyGoalAchievements" => "date",
        _ => "id",
    }
}

/// `local` and `remote` merged against `base`. `key` keys a list's items.
pub fn merge(base: Option<&Value>, local: &Value, remote: &Value, key: &str) -> Value {
    merge_present(base, Some(local), Some(remote), key, true).unwrap_or(Value::Null)
}

/// One value present on either side or neither (`None`: removed, or never
/// there). `deep`: an object merges field by field (only the top level).
fn merge_present(
    base: Option<&Value>,
    local: Option<&Value>,
    remote: Option<&Value>,
    key: &str,
    deep: bool,
) -> Option<Value> {
    if local == remote || base == remote {
        return local.cloned();
    }
    if base == local {
        return remote.cloned();
    }
    // Changed on both sides; a change beats a removal
    let (Some(local), Some(remote)) = (local, remote) else {
        return local.or(remote).cloned();
    };
    if let (Some(local_items), Some(remote_items)) = (keyed(local, key), keyed(remote, key)) {
        let base_items = base.and_then(|base| keyed(base, key)).unwrap_or_default();
        return Some(Value::Array(merge_items(
            &base_items,
            &local_items,
            &remote_items,
        )));
    }
    match (local, remote) {
        (Value::Object(local), Value::Object(remote)) if deep => {
            let base = base.and_then(Value::as_object);
            Some(Value::Object(merge_fields(base, local, remote)))
        }
        _ => Some(local.clone()),
    }
}

/// A list's items by their key, in order, when every item is an object
/// with a string key.
fn keyed<'a>(value: &'a Value, key: &str) -> Option<Vec<(&'a str, &'a Value)>> {
    value
        .as_array()?
        .iter()
        .map(|item| item.get(key).and_then(Value::as_str).map(|id| (id, item)))
        .collect()
}

fn find<'a>(items: &[(&str, &'a Value)], id: &str) -> Option<&'a Value> {
    items
        .iter()
        .find(|(key, _)| *key == id)
        .map(|(_, item)| *item)
}

/// This device's items in its order, then the ones only the other side has.
fn merge_items(
    base: &[(&str, &Value)],
    local: &[(&str, &Value)],
    remote: &[(&str, &Value)],
) -> Vec<Value> {
    let only_remote = remote.iter().filter(|(id, _)| find(local, id).is_none());
    let mut seen = std::collections::HashSet::new();
    local
        .iter()
        .chain(only_remote)
        .filter(|(id, _)| seen.insert(*id))
        .filter_map(|(id, _)| {
            merge_present(
                find(base, id),
                find(local, id),
                find(remote, id),
                "id",
                false,
            )
        })
        .collect()
}

fn merge_fields(
    base: Option<&Map<String, Value>>,
    local: &Map<String, Value>,
    remote: &Map<String, Value>,
) -> Map<String, Value> {
    let only_remote = remote.keys().filter(|name| !local.contains_key(*name));
    local
        .keys()
        .chain(only_remote)
        .filter_map(|name| {
            let merged = merge_present(
                base.and_then(|base| base.get(name)),
                local.get(name),
                remote.get(name),
                "id",
                false,
            )?;
            Some((name.clone(), merged))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_side_that_didnt_change_takes_the_other() {
        let base = json!({ "n": 1 });
        assert_eq!(
            merge(Some(&base), &json!({ "n": 1 }), &json!({ "n": 2 }), "id"),
            json!({ "n": 2 })
        );
        assert_eq!(
            merge(Some(&base), &json!({ "n": 3 }), &json!({ "n": 1 }), "id"),
            json!({ "n": 3 })
        );
        assert_eq!(merge(Some(&base), &json!(4), &json!(4), "id"), json!(4));
    }

    #[test]
    fn items_added_and_removed_on_either_side_are_kept_and_removed() {
        let base = json!([{ "id": "a" }, { "id": "b" }, { "id": "c" }]);
        // Here: b removed, d added. There: c removed, e added.
        let local = json!([{ "id": "a" }, { "id": "c" }, { "id": "d" }]);
        let remote = json!([{ "id": "a" }, { "id": "b" }, { "id": "e" }]);
        assert_eq!(
            merge(Some(&base), &local, &remote, "id"),
            json!([{ "id": "a" }, { "id": "d" }, { "id": "e" }])
        );
    }

    #[test]
    fn an_item_changed_on_both_sides_keeps_this_devices_and_a_change_beats_a_removal() {
        let base = json!([{ "id": "a", "v": 0 }, { "id": "b", "v": 0 }, { "id": "c", "v": 0 }]);
        let local = json!([{ "id": "a", "v": 1 }, { "id": "c", "v": 1 }]);
        let remote = json!([{ "id": "a", "v": 2 }, { "id": "b", "v": 2 }]);
        // a: both changed (ours); b: removed here, changed there (theirs);
        // c: changed here, removed there (ours)
        assert_eq!(
            merge(Some(&base), &local, &remote, "id"),
            json!([{ "id": "a", "v": 1 }, { "id": "c", "v": 1 }, { "id": "b", "v": 2 }])
        );
    }

    #[test]
    fn objects_merge_field_by_field_one_level_deep() {
        let base = json!({ "a": 1, "b": 1, "c": { "x": 1, "y": 1 }, "gone": 1 });
        let local = json!({ "a": 2, "b": 1, "c": { "x": 2, "y": 1 } });
        let remote = json!({ "a": 1, "b": 3, "c": { "x": 1, "y": 3 }, "gone": 1, "new": 4 });
        assert_eq!(
            merge(Some(&base), &local, &remote, "id"),
            // c changed on both sides: ours, whole
            json!({ "a": 2, "b": 3, "c": { "x": 2, "y": 1 }, "new": 4 })
        );
    }

    #[test]
    fn a_sessions_timers_merge_inside_the_field_merge() {
        let base = json!({ "id": "s", "notes": null, "timerInstances": [{ "id": "t1" }] });
        let local = json!({ "id": "s", "notes": null, "timerInstances": [{ "id": "t1" }, { "id": "desk" }] });
        let remote = json!({ "id": "s", "notes": "hi", "timerInstances": [{ "id": "t1" }, { "id": "phone" }] });
        assert_eq!(
            merge(Some(&base), &local, &remote, "id"),
            json!({ "id": "s", "notes": "hi", "timerInstances": [{ "id": "t1" }, { "id": "desk" }, { "id": "phone" }] })
        );
    }

    #[test]
    fn without_a_baseline_the_two_are_joined_this_devices_winning() {
        let local = json!([{ "id": "a", "v": 1 }, { "id": "b" }]);
        let remote = json!([{ "id": "a", "v": 2 }, { "id": "c" }]);
        assert_eq!(
            merge(None, &local, &remote, "id"),
            json!([{ "id": "a", "v": 1 }, { "id": "b" }, { "id": "c" }])
        );
        assert_eq!(
            merge(
                None,
                &json!({ "a": 1, "b": 1 }),
                &json!({ "a": 2, "c": 2 }),
                "id"
            ),
            json!({ "a": 1, "b": 1, "c": 2 })
        );
    }

    #[test]
    fn lists_not_keyed_throughout_and_other_values_keep_this_devices() {
        let base = json!([{ "id": "a" }]);
        assert_eq!(
            merge(Some(&base), &json!([1]), &json!([{ "id": "a" }, 2]), "id"),
            json!([1])
        );
        assert_eq!(merge(Some(&json!(1)), &json!(2), &json!(3), "id"), json!(2));
        // A baseline that isn't a list removes nothing
        assert_eq!(
            merge(
                Some(&json!("old")),
                &json!([{ "id": "a" }]),
                &json!([{ "id": "b" }]),
                "id"
            ),
            json!([{ "id": "a" }, { "id": "b" }])
        );
    }

    #[test]
    fn an_id_listed_twice_comes_out_once() {
        let local = json!([{ "id": "a", "v": 1 }, { "id": "a", "v": 2 }]);
        assert_eq!(
            merge(Some(&json!([])), &local, &json!([{ "id": "b" }]), "id"),
            json!([{ "id": "a", "v": 1 }, { "id": "b" }])
        );
    }

    #[test]
    fn the_goal_history_is_keyed_by_day() {
        assert_eq!(item_key("dailyGoalAchievements"), "date");
        assert_eq!(item_key("predefinedTasks"), "id");
        let base = json!([{ "date": "2026-11-01", "id": "x" }]);
        let local = json!([{ "date": "2026-11-01", "id": "y" }]);
        let remote =
            json!([{ "date": "2026-11-01", "id": "x" }, { "date": "2026-11-02", "id": "z" }]);
        assert_eq!(
            merge(Some(&base), &local, &remote, "date"),
            json!([{ "date": "2026-11-01", "id": "y" }, { "date": "2026-11-02", "id": "z" }])
        );
    }
}
