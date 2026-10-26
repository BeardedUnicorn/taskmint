//! Conformance scenarios: the same command sequences, run against every
//! host (core in memory, the desktop's LocalBackend on disk, the server over
//! HTTP), so they all keep the same rules, replies, errors and events.
//!
//! A scenario is a JSON file in `scenarios/`. Each step may move the clock
//! (`advanceMs`), reload the host from what it saved (`reload`), and run a
//! command (`call`, `args`), expecting either a `reply` or an exact `error`,
//! and exactly the `events` listed (none when absent). `save` keeps parts of
//! the reply, by JSON pointer, for later steps to use as `"$name"`.
//!
//! Replies match loosely, so they needn't spell out ids and timestamps: an
//! object matches when every key it lists matches (`{}` only matches an empty
//! object), an array when it has as many items and each matches, numbers by
//! value, and the strings `"$absent"` and `"$any"` match a missing key and
//! any value.

use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Deserializer};
use serde_json::Value;
use std::collections::BTreeMap;

/// A host the scenarios run against.
pub trait Host {
    /// Runs a command by name, as a client sends it; an error is the message
    /// the client sees.
    fn call(&mut self, command: &str, args: Value) -> Result<Value, String>;
    /// The names of the events published since this was last called.
    fn take_events(&mut self) -> Vec<String>;
    /// Moves the host's clock on.
    fn advance(&mut self, ms: i64);
    /// Drops what the host holds in memory and loads what it saved.
    fn reload(&mut self);
}

/// Every host's clock starts here.
pub fn start_time() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 3, 2, 15, 0, 0).unwrap()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scenario {
    pub name: String,
    pub steps: Vec<Step>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Step {
    #[serde(default)]
    pub advance_ms: Option<i64>,
    #[serde(default)]
    pub reload: bool,
    #[serde(default)]
    pub call: Option<String>,
    #[serde(default)]
    pub args: Value,
    /// Some(Null) expects a null reply; None doesn't look at the reply.
    #[serde(default, deserialize_with = "present")]
    pub reply: Option<Value>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub save: BTreeMap<String, String>,
    #[serde(default)]
    pub events: Vec<String>,
}

/// A key that's there, even as null.
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(deserializer).map(Some)
}

const SCENARIOS: [&str; 9] = [
    include_str!("scenarios/records.json"),
    include_str!("scenarios/timer.json"),
    include_str!("scenarios/starting_work.json"),
    include_str!("scenarios/task_links.json"),
    include_str!("scenarios/manual_time_and_undo.json"),
    include_str!("scenarios/timer_instances.json"),
    include_str!("scenarios/tray_and_idle.json"),
    include_str!("scenarios/work_logs.json"),
    include_str!("scenarios/restore_and_reset.json"),
];

pub fn scenarios() -> Vec<Scenario> {
    SCENARIOS
        .iter()
        .map(|text| serde_json::from_str(text).expect("scenario files are valid"))
        .collect()
}

/// Runs every scenario, each on a fresh host from `new_host`. Returns every
/// failure, not just the first. (Not generic: coverage scores a generic
/// function by one instantiation, and no host fails and passes alike.)
pub fn run_all(new_host: &mut dyn FnMut() -> Box<dyn Host>) -> Result<(), String> {
    let failures: Vec<String> = scenarios()
        .iter()
        .filter_map(|scenario| run(scenario, new_host().as_mut()).err())
        .collect();
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("\n"))
    }
}

type Vars = BTreeMap<String, Value>;

/// Runs one scenario; the error says which step went wrong and how.
pub fn run(scenario: &Scenario, host: &mut dyn Host) -> Result<(), String> {
    let mut vars = Vars::new();
    for (index, step) in scenario.steps.iter().enumerate() {
        run_step(step, host, &mut vars)
            .map_err(|e| format!("{}, step {}: {}", scenario.name, index + 1, e))?;
    }
    Ok(())
}

fn run_step(step: &Step, host: &mut dyn Host, vars: &mut Vars) -> Result<(), String> {
    if let Some(ms) = step.advance_ms {
        host.advance(ms);
    }
    if step.reload {
        host.reload();
    }
    let Some(command) = &step.call else {
        return Ok(());
    };
    let args = substitute(&step.args, vars)?;
    let result = host.call(command, args);
    let events = host.take_events();
    match (result, &step.error) {
        (Err(actual), Some(expected)) if actual == *expected => {}
        (Err(actual), Some(expected)) => {
            return Err(format!(
                "{} failed with {:?}, not {:?}",
                command, actual, expected
            ))
        }
        (Err(actual), None) => return Err(format!("{} failed: {}", command, actual)),
        (Ok(reply), Some(expected)) => {
            return Err(format!(
                "{} replied {} instead of failing with {:?}",
                command, reply, expected
            ))
        }
        (Ok(reply), None) => {
            if let Some(expected) = &step.reply {
                matches(expected, &reply, vars, "")
                    .map_err(|e| format!("{} replied {}: {}", command, reply, e))?;
            }
            for (name, pointer) in &step.save {
                let value = reply.pointer(pointer).ok_or_else(|| {
                    format!("{} replied {}, with nothing at {}", command, reply, pointer)
                })?;
                vars.insert(name.clone(), value.clone());
            }
        }
    }
    if events != step.events {
        return Err(format!(
            "{} published {:?}, not {:?}",
            command, events, step.events
        ));
    }
    Ok(())
}

/// The value saved as `"$name"`, if `value` is one.
fn variable<'a>(value: &Value, vars: &'a Vars) -> Option<Result<&'a Value, String>> {
    let name = value.as_str()?.strip_prefix('$')?;
    if name == "absent" || name == "any" {
        return None;
    }
    Some(
        vars.get(name)
            .ok_or_else(|| format!("nothing was saved as ${}", name)),
    )
}

/// `args` with every `"$name"` replaced by what was saved as it.
fn substitute(args: &Value, vars: &Vars) -> Result<Value, String> {
    if let Some(saved) = variable(args, vars) {
        return saved.cloned();
    }
    Ok(match args {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| substitute(item, vars))
                .collect::<Result<_, _>>()?,
        ),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, value)| Ok((key.clone(), substitute(value, vars)?)))
                .collect::<Result<_, String>>()?,
        ),
        other => other.clone(),
    })
}

/// Whether `actual` matches `expected` (see the module docs); the error
/// names where it doesn't.
fn matches(expected: &Value, actual: &Value, vars: &Vars, at: &str) -> Result<(), String> {
    let differs = || Err(format!("at {:?}, expected {}", at, expected));
    if let Some(saved) = variable(expected, vars) {
        return if saved? == actual { Ok(()) } else { differs() };
    }
    match (expected, actual) {
        (Value::String(marker), _) if marker == "$any" => Ok(()),
        (Value::Object(expected), Value::Object(actual)) if expected.is_empty() => {
            if actual.is_empty() {
                Ok(())
            } else {
                Err(format!("at {:?}, expected an empty object", at))
            }
        }
        (Value::Object(expected), Value::Object(actual)) => {
            for (key, value) in expected {
                let path = format!("{}/{}", at, key);
                match actual.get(key) {
                    None if value == "$absent" => {}
                    None => return Err(format!("at {:?}, nothing", path)),
                    Some(_) if value == "$absent" => {
                        return Err(format!("at {:?}, expected nothing", path))
                    }
                    Some(actual) => matches(value, actual, vars, &path)?,
                }
            }
            Ok(())
        }
        (Value::Array(expected), Value::Array(actual)) => {
            if expected.len() != actual.len() {
                return Err(format!(
                    "at {:?}, {} items, not {}",
                    at,
                    actual.len(),
                    expected.len()
                ));
            }
            for (index, (expected, actual)) in expected.iter().zip(actual).enumerate() {
                matches(expected, actual, vars, &format!("{}/{}", at, index))?;
            }
            Ok(())
        }
        (Value::Number(expected), Value::Number(actual))
            if expected.as_f64() == actual.as_f64() =>
        {
            Ok(())
        }
        _ if expected == actual => Ok(()),
        _ => differs(),
    }
}

#[cfg(test)]
mod tests;
