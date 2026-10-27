//! What saving a list of records changes: the rows to delete and the rows
//! to write. Rows keep the order they were added in (each table's `seq`),
//! which is the order core keeps them in, so a change that reorders them
//! (a restore that replaces them) writes the whole list again.

use std::collections::{HashMap, HashSet};

use serde_json::Value;

/// A stored record: its id and its JSON.
pub type Row = (String, Value);

#[derive(Debug, Default, PartialEq)]
pub struct RowChanges {
    /// Deleted first.
    pub deletes: Vec<String>,
    /// Then written in this order, so a new row goes after the rest.
    pub writes: Vec<Row>,
}

/// From `before` (the rows read, in order) to `after` (what the command
/// left). `unreadable` are the ids of rows stored but not read: they're left
/// alone, unless `after` has a record with the same id.
pub fn diff_rows(before: &[Row], after: &[Row], unreadable: &HashSet<String>) -> RowChanges {
    let stored: HashMap<&str, &Value> = before
        .iter()
        .map(|(id, value)| (id.as_str(), value))
        .collect();
    let kept: HashSet<&str> = after.iter().map(|(id, _)| id.as_str()).collect();
    if !keeps_order(before, after, &kept, unreadable) {
        // Everything again, in order: what's stored goes, with any
        // unreadable row whose id comes back
        return RowChanges {
            deletes: before
                .iter()
                .chain(after.iter().filter(|(id, _)| unreadable.contains(id)))
                .map(|(id, _)| id.clone())
                .collect(),
            writes: after.to_vec(),
        };
    }
    RowChanges {
        deletes: before
            .iter()
            .filter(|(id, _)| !kept.contains(id.as_str()))
            .map(|(id, _)| id.clone())
            .collect(),
        writes: after
            .iter()
            .filter(|(id, value)| stored.get(id.as_str()) != Some(&value))
            .cloned()
            .collect(),
    }
}

/// Whether `after` can be saved over `before` row by row: the rows it keeps
/// are in their old order, and every new row comes after them without taking
/// an unreadable row's id (whose place in the order it would take).
fn keeps_order(
    before: &[Row],
    after: &[Row],
    kept: &HashSet<&str>,
    unreadable: &HashSet<String>,
) -> bool {
    let mut after_ids = after.iter().map(|(id, _)| id.as_str());
    let still_in_order = before
        .iter()
        .map(|(id, _)| id.as_str())
        .filter(|id| kept.contains(id))
        .all(|id| after_ids.next() == Some(id));
    still_in_order && after_ids.all(|id| !unreadable.contains(id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(items: &[(&str, i64)]) -> Vec<Row> {
        items
            .iter()
            .map(|(id, value)| (id.to_string(), json!(*value)))
            .collect()
    }

    fn ids(items: &[&str]) -> Vec<String> {
        items.iter().map(|id| id.to_string()).collect()
    }

    fn none() -> HashSet<String> {
        HashSet::new()
    }

    #[test]
    fn only_changed_and_new_rows_are_written_and_removed_ones_deleted() {
        let before = rows(&[("a", 1), ("b", 2), ("c", 3)]);
        let after = rows(&[("a", 1), ("c", 30), ("d", 4)]);
        assert_eq!(
            diff_rows(&before, &after, &none()),
            RowChanges {
                deletes: ids(&["b"]),
                writes: rows(&[("c", 30), ("d", 4)]),
            }
        );
        assert_eq!(diff_rows(&before, &before, &none()), RowChanges::default());
        assert_eq!(
            diff_rows(&[], &after, &none()),
            RowChanges {
                deletes: vec![],
                writes: after.clone(),
            }
        );
    }

    #[test]
    fn a_change_of_order_writes_every_row_again() {
        let before = rows(&[("a", 1), ("b", 2)]);
        // Reordered
        assert_eq!(
            diff_rows(&before, &rows(&[("b", 2), ("a", 1)]), &none()),
            RowChanges {
                deletes: ids(&["a", "b"]),
                writes: rows(&[("b", 2), ("a", 1)]),
            }
        );
        // A new row before an old one
        assert_eq!(
            diff_rows(&before, &rows(&[("n", 0), ("a", 1)]), &none()).writes,
            rows(&[("n", 0), ("a", 1)])
        );
    }

    #[test]
    fn unreadable_rows_stay_unless_their_id_comes_back() {
        let before = rows(&[("a", 1)]);
        let unreadable: HashSet<String> = ["x".to_string()].into();
        assert_eq!(
            diff_rows(&before, &rows(&[("a", 1), ("b", 2)]), &unreadable),
            RowChanges {
                deletes: vec![],
                writes: rows(&[("b", 2)]),
            }
        );
        // A record with its id replaces it, at the end of the order
        assert_eq!(
            diff_rows(&before, &rows(&[("a", 1), ("x", 9)]), &unreadable),
            RowChanges {
                deletes: ids(&["a", "x"]),
                writes: rows(&[("a", 1), ("x", 9)]),
            }
        );
    }
}
