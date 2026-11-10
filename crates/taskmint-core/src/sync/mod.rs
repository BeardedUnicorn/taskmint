//! Cloud sync's rules, the same on every device. The cloud copy is one
//! document per session, work-log entry, project mapping and record, each
//! holding the entity as JSON. A device keeps a baseline: each document as
//! it last agreed with the cloud. What differs from the baseline is this
//! device's to send (`outgoing`); what comes in is applied where this
//! device didn't change it, and merged where both did (`apply_incoming`).
//! The baseline only moves when a document comes in, a device's own writes
//! included, so it always follows the cloud's order of writes.
//!
//! The client moves the documents (Firestore); these functions never see
//! the network.

pub mod merge;
pub mod settle;

use crate::contract::SYNC_SCHEMA;
use crate::model::{ProjectTaskMapping, TaskSession, WorkLogEntry};
use crate::records::is_app_record_key;
use crate::timer::recalculate_total_duration;
use crate::workspace::{Parts, Workspace};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// What a document holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Session,
    WorkLog,
    Mapping,
    Record,
}

impl Kind {
    const ALL: [Kind; 4] = [Kind::Session, Kind::WorkLog, Kind::Mapping, Kind::Record];

    pub fn name(self) -> &'static str {
        match self {
            Kind::Session => "session",
            Kind::WorkLog => "worklog",
            Kind::Mapping => "mapping",
            Kind::Record => "record",
        }
    }

    fn part(self) -> Parts {
        match self {
            Kind::Session => Parts::SESSIONS,
            Kind::WorkLog | Kind::Mapping => Parts::WORK_LOGS,
            Kind::Record => Parts::RECORDS,
        }
    }
}

/// A document's id: `<kind>~<key>`, the key escaped so any id makes a valid
/// Firestore document id (no `/`, never `.` or `__…__`).
pub fn doc_id(kind: Kind, key: &str) -> String {
    let mut id = format!("{}~", kind.name());
    for byte in key.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => id.push(byte as char),
            _ => id.push_str(&format!("%{:02X}", byte)),
        }
    }
    id
}

/// The kind and key a document id names; None for one this version doesn't
/// know (or a record that isn't one of TaskMint's).
pub fn parse_doc_id(id: &str) -> Option<(Kind, String)> {
    let (name, escaped) = id.split_once('~')?;
    let kind = Kind::ALL.into_iter().find(|kind| kind.name() == name)?;
    let mut bytes = Vec::new();
    let mut rest = escaped.as_bytes();
    while let Some((&byte, after)) = rest.split_first() {
        if byte == b'%' {
            let hex = std::str::from_utf8(after.get(..2)?).ok()?;
            bytes.push(u8::from_str_radix(hex, 16).ok()?);
            rest = &after[2..];
        } else {
            bytes.push(byte);
            rest = after;
        }
    }
    let key = String::from_utf8(bytes).ok()?;
    (kind != Kind::Record || is_app_record_key(&key)).then_some((kind, key))
}

/// A document's content hash: FNV-1a (64-bit) of its JSON, in hex.
pub fn hash(json: &str) -> String {
    let hash = json.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    });
    format!("{:016x}", hash)
}

/// The account a device syncs with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SyncAccount {
    /// The Firebase user's id.
    pub uid: String,
    /// The account's epoch when this device linked: deleting the cloud data
    /// starts a new one, and a device on an old one stops syncing.
    pub epoch: u64,
}

/// A document as this device last agreed with the cloud: its hash and
/// JSON, or none for a deleted one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Synced {
    pub hash: String,
    #[serde(default)]
    pub json: Option<String>,
}

impl Synced {
    fn of(json: Option<String>) -> Self {
        Self {
            hash: json.as_deref().map(hash).unwrap_or_default(),
            json,
        }
    }
}

/// A device's sync state (the desktop keeps it in sync.json).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    /// This device, in the documents it writes and on the timers it runs.
    /// Made when it first links.
    #[serde(default)]
    pub device_id: String,
    /// None: not syncing.
    #[serde(default)]
    pub account: Option<SyncAccount>,
    /// The document schema the baseline was read with.
    #[serde(default)]
    pub schema: u32,
    /// Where reading the cloud's changes carries on from (the client's
    /// marker, opaque here).
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub baseline: BTreeMap<String, Synced>,
    /// Documents a newer TaskMint wrote: left alone until this one is
    /// updated, and read again then.
    #[serde(default)]
    pub held: BTreeSet<String>,
}

/// A document from the cloud.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(optional_fields = nullable))]
#[serde(rename_all = "camelCase")]
pub struct IncomingDoc {
    pub doc_id: String,
    /// The entity's JSON; null for a deleted one.
    #[serde(default)]
    pub json: Option<String>,
    pub schema: u32,
}

/// A document to write: this device's version, or a deletion.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct OutgoingDoc {
    pub doc_id: String,
    pub kind: String,
    /// The entity's id (a mapping's project id, a record's key).
    pub id: String,
    /// null: delete it.
    pub json: Option<String>,
    /// "" for a deletion.
    pub hash: String,
}

/// get_sync_status's reply.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub account: Option<SyncAccount>,
    /// "" until the device first links.
    pub device_id: String,
    /// Where reading the cloud carries on from; null reads everything.
    pub cursor: Option<String>,
    /// Changes on this device the cloud doesn't have yet.
    pub pending: usize,
    /// Documents a newer TaskMint wrote, which this one leaves alone.
    pub held: usize,
    /// This device has sessions, work logs or records of its own (a first
    /// link then asks whether to merge them).
    pub has_data: bool,
}

/// apply_sync_incoming's reply.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SyncApplied {
    /// Taken as they came (this device hadn't changed them).
    pub applied: usize,
    /// Changed here and there, and merged.
    pub merged: usize,
    /// Unreadable, or not TaskMint's.
    pub skipped: usize,
    /// From a newer TaskMint, left alone.
    pub held: usize,
}

/// What applying changed, for the host.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Applied {
    pub summary: SyncApplied,
    pub changed: Parts,
    /// The record keys that changed, in order.
    pub records: Vec<String>,
}

fn canonical(value: &impl Serialize) -> Value {
    serde_json::to_value(value).expect("entities are plain data")
}

fn text(value: &Value) -> String {
    value.to_string()
}

/// The entity `key` of `kind` on this device, as JSON.
fn local_value(workspace: &Workspace, kind: Kind, key: &str) -> Option<Value> {
    match kind {
        Kind::Session => workspace
            .sessions
            .iter()
            .find(|s| s.id == key)
            .map(canonical),
        Kind::WorkLog => workspace
            .work_log_entries
            .iter()
            .find(|e| e.id == key)
            .map(canonical),
        Kind::Mapping => workspace
            .work_log_mappings
            .iter()
            .find(|m| m.project_id == key)
            .map(canonical),
        Kind::Record => workspace.records.get(key).filter(|v| !v.is_null()).cloned(),
    }
}

/// Every entity on this device, by document id: its kind, id and JSON.
fn local_docs(workspace: &Workspace) -> BTreeMap<String, (Kind, String, String)> {
    let sessions = workspace
        .sessions
        .iter()
        .map(|s| (Kind::Session, s.id.clone(), canonical(s)));
    let entries = workspace
        .work_log_entries
        .iter()
        .map(|e| (Kind::WorkLog, e.id.clone(), canonical(e)));
    let mappings = workspace
        .work_log_mappings
        .iter()
        .map(|m| (Kind::Mapping, m.project_id.clone(), canonical(m)));
    let records = workspace
        .records
        .iter()
        .filter(|(key, value)| is_app_record_key(key) && !value.is_null())
        .map(|(key, value)| (Kind::Record, key.clone(), value.clone()));
    sessions
        .chain(entries)
        .chain(mappings)
        .chain(records)
        .map(|(kind, key, value)| (doc_id(kind, &key), (kind, key, text(&value))))
        .collect()
}

/// A document's JSON read as its kind and written back this device's way;
/// None when it doesn't read as one, or is for another id.
fn parse_remote(kind: Kind, key: &str, json: &str) -> Option<Value> {
    match kind {
        Kind::Session => serde_json::from_str::<TaskSession>(json)
            .ok()
            .filter(|s| s.id == key)
            .map(|s| canonical(&s)),
        Kind::WorkLog => serde_json::from_str::<WorkLogEntry>(json)
            .ok()
            .filter(|e| e.id == key)
            .map(|e| canonical(&e)),
        Kind::Mapping => serde_json::from_str::<ProjectTaskMapping>(json)
            .ok()
            .filter(|m| m.project_id == key)
            .map(|m| canonical(&m)),
        Kind::Record => serde_json::from_str::<Value>(json)
            .ok()
            .filter(|v| !v.is_null()),
    }
}

/// Where a session goes among the others: after every one created before it.
fn session_slot(sessions: &[TaskSession], created_at: &str) -> usize {
    sessions
        .iter()
        .rposition(|s| s.created_at.as_str() <= created_at)
        .map_or(0, |i| i + 1)
}

/// `value` read as its kind. It always reads: it's a document that read as
/// one, or the merge of two that did (every field and item from one side).
fn typed<T: serde::de::DeserializeOwned>(value: Option<Value>) -> Option<T> {
    value.map(|value| serde_json::from_value(value).expect("a document or a merge of two"))
}

/// Puts `value` (None: removes it) in place of the entity on this device.
fn put(
    workspace: &mut Workspace,
    kind: Kind,
    key: &str,
    value: Option<Value>,
    applied: &mut Applied,
) {
    match kind {
        Kind::Session => {
            let sessions = &mut workspace.sessions;
            let at = sessions.iter().position(|s| s.id == key);
            match (typed::<TaskSession>(value), at) {
                (Some(mut session), at) => {
                    recalculate_total_duration(&mut session);
                    match at {
                        Some(i) => sessions[i] = session,
                        None => {
                            let slot = session_slot(sessions, &session.created_at);
                            sessions.insert(slot, session);
                        }
                    }
                }
                (None, _) => sessions.retain(|s| s.id != key),
            }
        }
        Kind::WorkLog => {
            let entries = &mut workspace.work_log_entries;
            match typed::<WorkLogEntry>(value) {
                Some(entry) => match entries.iter_mut().find(|e| e.id == key) {
                    Some(old) => *old = entry,
                    None => entries.push(entry),
                },
                None => entries.retain(|e| e.id != key),
            }
        }
        Kind::Mapping => {
            let mappings = &mut workspace.work_log_mappings;
            match typed::<ProjectTaskMapping>(value) {
                Some(mapping) => match mappings.iter_mut().find(|m| m.project_id == key) {
                    Some(old) => *old = mapping,
                    None => mappings.push(mapping),
                },
                None => mappings.retain(|m| m.project_id != key),
            }
        }
        Kind::Record => {
            match value {
                Some(value) => workspace.records.insert(key.to_string(), value),
                None => workspace.records.remove(key),
            };
            workspace.bump_revision(key);
            if !applied.records.iter().any(|k| k == key) {
                applied.records.push(key.to_string());
            }
        }
    }
    applied.changed |= kind.part();
}

/// The merge of an entity changed here and in the cloud since `base`.
fn merge_entity(
    kind: Kind,
    key: &str,
    base: Option<&Value>,
    local: Option<&Value>,
    remote: Option<&Value>,
) -> Option<Value> {
    let item_key = match kind {
        Kind::Record => merge::item_key(key),
        _ => "id",
    };
    match (local, remote) {
        (Some(local), Some(remote)) => Some(merge::merge(base, local, remote, item_key)),
        // Removed on one side, changed on the other: the change stays
        (local, remote) => local.or(remote).cloned(),
    }
}

/// Applies documents from the cloud, in the order they were written, and
/// carries on from `cursor` next time.
pub fn apply_incoming(
    workspace: &mut Workspace,
    docs: Vec<IncomingDoc>,
    cursor: Option<String>,
) -> Applied {
    let mut applied = Applied::default();
    if workspace.sync.schema < SYNC_SCHEMA {
        // Read with an older schema: what it held is read again now
        workspace.sync.held.clear();
        workspace.sync.schema = SYNC_SCHEMA;
    }
    for doc in docs {
        let Some((kind, key)) = parse_doc_id(&doc.doc_id) else {
            applied.summary.skipped += 1;
            continue;
        };
        if doc.schema > SYNC_SCHEMA {
            workspace.sync.held.insert(doc.doc_id);
            applied.summary.held += 1;
            continue;
        }
        let remote = match doc
            .json
            .as_deref()
            .map(|json| parse_remote(kind, &key, json))
        {
            Some(None) => {
                applied.summary.skipped += 1;
                continue;
            }
            Some(Some(value)) => Some(value),
            None => None,
        };
        let local = local_value(workspace, kind, &key);
        let base_json = workspace
            .sync
            .baseline
            .get(&doc.doc_id)
            .and_then(|synced| synced.json.clone());
        let local_json = local.as_ref().map(text);
        let remote_json = remote.as_ref().map(text);
        if local_json != remote_json {
            if local_json == base_json {
                put(workspace, kind, &key, remote, &mut applied);
                applied.summary.applied += 1;
            } else {
                let base = base_json.and_then(|json| serde_json::from_str(&json).ok());
                let merged =
                    merge_entity(kind, &key, base.as_ref(), local.as_ref(), remote.as_ref());
                put(workspace, kind, &key, merged, &mut applied);
                applied.summary.merged += 1;
            }
        }
        workspace.sync.held.remove(&doc.doc_id);
        workspace
            .sync
            .baseline
            .insert(doc.doc_id, Synced::of(remote_json));
    }
    if !applied.changed.is_empty() {
        if settle::settle(&mut workspace.sessions) {
            applied.changed |= Parts::SESSIONS;
        }
        applied.changed |= workspace.sync_task_links().dirty;
    }
    if cursor.is_some() {
        workspace.sync.cursor = cursor;
    }
    applied
}

/// This device's changes the cloud doesn't have: new and changed entities,
/// and deletions. Nothing while not syncing.
pub fn outgoing(workspace: &Workspace) -> Vec<OutgoingDoc> {
    let state = &workspace.sync;
    if state.account.is_none() {
        return Vec::new();
    }
    let local = local_docs(workspace);
    let changed = local
        .iter()
        .filter(|(id, (_, _, json))| {
            !state.held.contains(*id)
                && state.baseline.get(*id).and_then(|s| s.json.as_ref()) != Some(json)
        })
        .map(|(id, (kind, key, json))| OutgoingDoc {
            doc_id: id.clone(),
            kind: kind.name().to_string(),
            id: key.clone(),
            hash: hash(json),
            json: Some(json.clone()),
        });
    let deleted = state
        .baseline
        .iter()
        .filter(|(id, synced)| {
            synced.json.is_some() && !local.contains_key(*id) && !state.held.contains(*id)
        })
        .filter_map(|(id, _)| {
            // The baseline only has ids that parsed
            parse_doc_id(id).map(|(kind, key)| OutgoingDoc {
                doc_id: id.clone(),
                kind: kind.name().to_string(),
                id: key,
                hash: String::new(),
                json: None,
            })
        });
    changed.chain(deleted).collect()
}

/// Whether this device has data of its own.
fn has_data(workspace: &Workspace) -> bool {
    !workspace.sessions.is_empty()
        || !workspace.work_log_entries.is_empty()
        || !workspace.work_log_mappings.is_empty()
        || workspace.records.values().any(|value| !value.is_null())
}

pub fn status(workspace: &Workspace) -> SyncStatus {
    let state = &workspace.sync;
    SyncStatus {
        account: state.account.clone(),
        device_id: state.device_id.clone(),
        // A baseline read with an older schema is read again from the start
        cursor: state.cursor.clone().filter(|_| state.schema >= SYNC_SCHEMA),
        pending: outgoing(workspace).len(),
        held: state.held.len(),
        has_data: has_data(workspace),
    }
}

/// Starts syncing with `account`, from nothing: the first changes in are
/// joined with this device's data. Timers running here are this device's.
/// Whether a session changed.
pub fn link(workspace: &mut Workspace, account: SyncAccount) -> bool {
    let state = &mut workspace.sync;
    if state.device_id.is_empty() {
        state.device_id = uuid::Uuid::new_v4().to_string();
    }
    *state = SyncState {
        device_id: std::mem::take(&mut state.device_id),
        account: Some(account),
        schema: SYNC_SCHEMA,
        ..SyncState::default()
    };
    let device = workspace.sync.device_id.clone();
    let mut stamped = false;
    for instance in workspace
        .sessions
        .iter_mut()
        .flat_map(|s| s.timer_instances.iter_mut())
        .filter(|i| (i.is_running || i.is_paused) && i.running_on.is_none())
    {
        instance.running_on = Some(device.clone());
        stamped = true;
    }
    stamped
}

/// Stops syncing. This device keeps its data and its id.
pub fn unlink(workspace: &mut Workspace) {
    workspace.sync = SyncState {
        device_id: std::mem::take(&mut workspace.sync.device_id),
        ..SyncState::default()
    };
}

/// Marks the timers `instance_ids` as running on this device, once it has
/// an id. Whether one changed.
pub fn claim_timers(workspace: &mut Workspace, instance_ids: &[&str]) -> bool {
    let device = &workspace.sync.device_id;
    if device.is_empty() {
        return false;
    }
    let mut claimed = false;
    for instance in workspace
        .sessions
        .iter_mut()
        .flat_map(|s| s.timer_instances.iter_mut())
        .filter(|i| instance_ids.contains(&i.id.as_str()) && i.running_on.as_ref() != Some(device))
    {
        instance.running_on = Some(device.clone());
        claimed = true;
    }
    claimed
}

#[cfg(test)]
mod tests;
