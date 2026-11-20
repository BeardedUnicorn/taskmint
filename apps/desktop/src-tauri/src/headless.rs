//! A phone's timer buttons without the app: the Today widget's Start, Pause
//! and Resume, and the running timer's notification's Pause, Resume and
//! Stop. Android runs them from a receiver (gen/android: WidgetAction.kt),
//! with no activity, so no webview and no Tauri app: the receiver calls
//! straight in here (platform/os.rs has the JNI entry).
//!
//! The data files have one reader and writer in a process (LocalBackend
//! loads them once and saves whole files), so the app and the buttons share
//! it: whichever comes first opens the data (`shared`), and the app, when it
//! starts, builds its state around that (`AppState::over`) and hears of
//! every change from then on, a button's included. Before the app has
//! started nobody listens, and nothing needs to: the page reads everything
//! when it loads, and cloud sync sends what's waiting.

use crate::backend::{Clock, LocalBackend, Publish, Published};
use crate::store::JsonFileStore;
use crate::timer_notice::TimerNotice;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use taskmint_core::contract::launch::{PAUSE, RESUME, START_TASK};
use taskmint_core::sessions::start::{live_timer, LiveTimer};
use taskmint_core::workspace::Workspace;
use taskmint_core::DayZone;

/// The notification's Stop (timer_notice.rs STOP): the widget has none.
pub const STOP: &str = crate::timer_notice::STOP;

/// The data, opened once for the app and the buttons both.
pub struct Shared {
    pub backend: Arc<LocalBackend>,
    pub store: JsonFileStore,
    pub clock: Clock,
    listener: Arc<OnceLock<Publish>>,
}

impl Shared {
    /// Loads the data in `store`. Its changes go to whoever listens.
    pub fn open(store: JsonFileStore, clock: Clock) -> Shared {
        let listener: Arc<OnceLock<Publish>> = Arc::default();
        let heard = listener.clone();
        let publish = move |published: &Published| {
            heard
                .get()
                .into_iter()
                .for_each(|listener| listener(published))
        };
        Shared {
            backend: Arc::new(LocalBackend::open(
                store.clone(),
                clock.clone(),
                Box::new(publish),
            )),
            store,
            clock,
            listener,
        }
    }

    /// The app's state hears of every change from now on. There's one app in
    /// a process, so the first to ask stays the listener.
    pub fn listen(&self, publish: Publish) {
        let _ = self.listener.set(publish);
    }
}

static SHARED: OnceLock<Shared> = OnceLock::new();

/// This process's data: loaded from `store` the first time, the same from
/// then on, whoever asks (the app starting, or a button).
pub fn shared(store: JsonFileStore, clock: Clock) -> &'static Shared {
    SHARED.get_or_init(|| Shared::open(store, clock))
}

/// The live timer after a button's action, as the phone shows it.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActedTimer {
    pub task: String,
    /// As TimerNotice has it: None while paused.
    pub counting_from_ms: Option<i64>,
    /// Whether its time is today's: a timer's whole time belongs to the day
    /// it started, so one begun on an earlier day adds nothing to today.
    pub began_today: bool,
}

/// What a button's action came to.
#[derive(Debug, Serialize, PartialEq)]
pub struct Acted {
    /// The timer is now as the button asked. False when it couldn't be (no
    /// such task, nothing to pause, a failed save): the phone opens the app
    /// instead.
    pub done: bool,
    /// None when nothing runs or waits paused.
    pub timer: Option<ActedTimer>,
}

fn began_today(workspace: &Workspace, live: &LiveTimer, now: DateTime<Utc>) -> bool {
    workspace
        .sessions
        .iter()
        .flat_map(|session| &session.timer_instances)
        .filter(|instance| instance.id == live.instance_id)
        .any(|instance| DayZone::Local.day(instance.start_time) == DayZone::Local.day(now))
}

/// Runs a button's `action` (contract::launch's pause, resume and
/// start-task:<id>, and the notification's stop) as the tray runs its own
/// (tray::run), and says how the timer stands after it.
pub fn act(backend: &LocalBackend, now: DateTime<Utc>, action: &str) -> Acted {
    let live = || backend.read(|workspace| live_timer(&workspace.sessions, now));
    let call = |command: &str, args: Value| {
        if let Err(e) = backend.call_named(command, args) {
            log::error!("Failed to {} from a button: {}", command, e);
        }
    };
    let start = |task_id: &str, task_name: &str| {
        call(
            "start_task",
            json!({ "taskId": task_id, "taskName": task_name }),
        )
    };
    let done = match action {
        PAUSE => {
            call("pause_live_timer", json!({}));
            live().is_some_and(|live| live.is_paused)
        }
        RESUME => {
            if let Some(paused) = live().filter(|live| live.is_paused) {
                start(&paused.task_id, &paused.task_name);
            }
            live().is_some_and(|live| !live.is_paused)
        }
        STOP => {
            call("stop_live_timer", json!({}));
            live().is_none()
        }
        _ => match action.strip_prefix(START_TASK) {
            Some(task_id) => {
                let task_name = backend.read(|workspace| {
                    workspace
                        .tasks()
                        .into_iter()
                        .find(|task| task.id == task_id && !task.is_archived)
                        .map(|task| task.name)
                });
                if let Some(task_name) = task_name {
                    start(task_id, &task_name);
                }
                live().is_some_and(|live| !live.is_paused && live.task_id == task_id)
            }
            None => false,
        },
    };
    let timer = live().map(|live| ActedTimer {
        counting_from_ms: TimerNotice::of(&live, now)
            .counting_from
            .map(|from| from.timestamp_millis()),
        began_today: backend.read(|workspace| began_today(workspace, &live, now)),
        task: live.task_name,
    });
    Acted { done, timer }
}

/// A button's `action` on the data in `data_dir` (the app's data folder),
/// opening it if nothing in this process has: the reply, as JSON, for
/// WidgetAction.kt.
pub fn run(data_dir: PathBuf, action: &str) -> String {
    let shared = shared(JsonFileStore::new(data_dir), Arc::new(Utc::now));
    let acted = act(&shared.backend, (shared.clock)(), action);
    json!(acted).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::fake::FakePlatform;
    use crate::state::AppState;
    use crate::store::json_file::tests::TempDir;
    use crate::testing::start as started_at;
    use chrono::Duration;
    use std::sync::Mutex;

    struct Opened {
        shared: Shared,
        now: Arc<Mutex<DateTime<Utc>>>,
        _dir: TempDir,
    }

    impl Opened {
        fn now(&self) -> DateTime<Utc> {
            *self.now.lock().unwrap()
        }

        fn advance(&self, by: Duration) {
            *self.now.lock().unwrap() += by;
        }

        fn act(&self, action: &str) -> Acted {
            act(&self.shared.backend, self.now(), action)
        }

        fn call(&self, name: &str, args: Value) {
            self.shared.backend.call_named(name, args).unwrap();
        }
    }

    /// The data in a fresh folder, with two tasks (one archived).
    fn opened() -> Opened {
        let dir = TempDir::new("headless");
        let now = Arc::new(Mutex::new(started_at()));
        let clock = now.clone();
        let clock: Clock = Arc::new(move || *clock.lock().unwrap());
        let shared = Shared::open(JsonFileStore::new(&dir.0), clock);
        let opened = Opened {
            shared,
            now,
            _dir: dir,
        };
        opened.call(
            "set_app_record",
            json!({ "key": "predefinedTasks", "value": [
                { "id": "t1", "name": "Writing", "createdAt": "x", "updatedAt": "x" },
                { "id": "t2", "name": "Filing", "createdAt": "x", "updatedAt": "x", "isArchived": true }
            ] }),
        );
        opened
    }

    fn running(task: &str, from: DateTime<Utc>) -> Option<ActedTimer> {
        Some(ActedTimer {
            task: task.to_string(),
            counting_from_ms: Some(from.timestamp_millis()),
            began_today: true,
        })
    }

    fn paused(task: &str) -> Option<ActedTimer> {
        Some(ActedTimer {
            task: task.to_string(),
            counting_from_ms: None,
            began_today: true,
        })
    }

    #[test]
    fn start_begins_the_task_and_says_where_it_counts_from() {
        let o = opened();
        let acted = o.act("start-task:t1");
        assert!(acted.done);
        assert_eq!(acted.timer, running("Writing", o.now()));
    }

    #[test]
    fn start_does_nothing_for_a_task_that_cant_be_started() {
        let o = opened();
        // Archived, unknown, and not a start at all
        for action in ["start-task:t2", "start-task:nope", "dance"] {
            assert_eq!(
                o.act(action),
                Acted {
                    done: false,
                    timer: None
                }
            );
        }
    }

    #[test]
    fn pause_and_resume_stop_and_restart_the_clock() {
        let o = opened();
        o.act("start-task:t1");
        o.advance(Duration::minutes(10));
        let acted = o.act(PAUSE);
        assert!(acted.done);
        assert_eq!(acted.timer, paused("Writing"));
        // Pausing what's paused already leaves it so
        assert!(o.act(PAUSE).done);

        o.advance(Duration::minutes(5));
        let acted = o.act(RESUME);
        assert!(acted.done);
        // Ten minutes ran before the pause
        assert_eq!(
            acted.timer,
            running("Writing", o.now() - Duration::minutes(10))
        );
        // Resuming what runs already leaves it running
        assert!(o.act(RESUME).done);
    }

    #[test]
    fn pause_and_resume_say_so_when_theres_no_timer() {
        let o = opened();
        for action in [PAUSE, RESUME] {
            assert_eq!(
                o.act(action),
                Acted {
                    done: false,
                    timer: None
                }
            );
        }
    }

    #[test]
    fn stop_ends_the_timer() {
        let o = opened();
        o.act("start-task:t1");
        assert_eq!(
            o.act(STOP),
            Acted {
                done: true,
                timer: None
            }
        );
        // Nothing to stop is stopped too
        assert!(o.act(STOP).done);
    }

    #[test]
    fn a_timer_begun_on_an_earlier_day_isnt_todays() {
        let o = opened();
        o.act("start-task:t1");
        // Left running over three midnights: its time is the day it began's
        o.advance(Duration::days(3));
        let acted = o.act(PAUSE);
        assert!(acted.done);
        assert!(!acted.timer.unwrap().began_today);
    }

    #[test]
    fn a_failed_save_isnt_done() {
        let o = opened();
        o.act("start-task:t1");
        // The data folder is gone: the pause can't be saved, so the timer runs on
        std::fs::remove_dir_all(&o._dir.0).unwrap();
        std::fs::write(&o._dir.0, "in the way").unwrap();
        let acted = o.act(PAUSE);
        std::fs::remove_file(&o._dir.0).unwrap();
        std::fs::create_dir_all(&o._dir.0).unwrap();
        assert!(!acted.done);
        assert_eq!(acted.timer, running("Writing", o.now()));
    }

    #[test]
    fn the_apps_state_hears_what_a_button_changes() {
        let o = opened();
        // Before the app has started, nobody listens
        o.act("start-task:t1");
        let platform = Arc::new(FakePlatform::default());
        let state = AppState::over(&o.shared, platform.clone());
        assert!(Arc::ptr_eq(&state.backend, &o.shared.backend));
        let heard = || platform.event_names().len();
        assert_eq!(heard(), 0);
        o.act(PAUSE);
        assert!(heard() > 0);
        // And the app's own commands run on the same data
        state
            .backend
            .call_named("stop_live_timer", json!({}))
            .unwrap();
        assert_eq!(o.act(RESUME).timer, None);
    }

    #[test]
    fn the_first_to_listen_stays_the_listener() {
        let o = opened();
        let counting = |count: &Arc<Mutex<u32>>| -> Publish {
            let count = count.clone();
            Box::new(move |_| *count.lock().unwrap() += 1)
        };
        let (first, second) = (Arc::default(), Arc::default());
        o.shared.listen(counting(&first));
        o.shared.listen(counting(&second));
        o.act("start-task:t1");
        assert!(*first.lock().unwrap() > 0);
        assert_eq!(*second.lock().unwrap(), 0);
    }

    #[test]
    fn a_process_opens_its_data_once() {
        let first = TempDir::new("headless-first");
        let second = TempDir::new("headless-second");
        // A button, with the app not started: the reply is JSON for the phone
        let reply: Value = serde_json::from_str(&run(first.0.clone(), PAUSE)).unwrap();
        assert_eq!(reply, json!({ "done": false, "timer": null }));
        // Whoever asks next gets the same data, whatever folder it names
        let ours = shared(JsonFileStore::new(&first.0), Arc::new(Utc::now));
        let theirs = shared(JsonFileStore::new(&second.0), Arc::new(Utc::now));
        assert!(std::ptr::eq(ours, theirs));
    }
}
