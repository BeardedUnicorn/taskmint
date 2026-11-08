//! What the tray shows, as plain data: the menu, and the tooltip and
//! title, from a snapshot of the sessions and tasks. The platform draws it
//! (platform/os.rs); nothing here touches Tauri.

use crate::config::{TRAY_MAX_RECENT_TASKS, TRAY_TOOLTIP_APP_NAME};
use crate::utils::format_duration_hm;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use taskmint_core::contract::{IDLE_CHOICE_DISCARD_RESUME, IDLE_CHOICE_KEEP_RESUME};
use taskmint_core::model::{Task, TaskSession};
use taskmint_core::sessions::start::{live_timer, LiveTimer};
use taskmint_core::workspace::Workspace;

const STOP_TIMER: &str = "stop_timer";
const PAUSE_TIMER: &str = "pause_timer";
const RESUME_TIMER: &str = "resume_timer";
const IDLE_DISCARD_RESUME: &str = "idle_discard_resume";
const IDLE_KEEP_RESUME: &str = "idle_keep_resume";
const CHOOSE_TASK: &str = "choose_task";
const ADD_TASK: &str = "add_task";
const SHOW_APP: &str = "show_app";
const START_TASK_PREFIX: &str = "start_task_";

/// One entry in the tray menu.
#[derive(Debug, Clone, PartialEq)]
pub enum TrayItem {
    /// A line of text that can't be clicked.
    Label(String),
    Action {
        id: String,
        label: String,
    },
    Separator,
    Submenu {
        label: String,
        items: Vec<TrayItem>,
    },
    /// The platform's own Quit item.
    Quit,
}

/// The whole menu. The tray rebuilds only when it changes: a rebuild closes
/// a menu the user has open.
#[derive(Debug, Clone, PartialEq)]
pub struct TrayMenu(pub Vec<TrayItem>);

/// The tray icon's tooltip, and the title beside it (macOS only; none
/// clears it).
#[derive(Debug, Clone, PartialEq)]
pub struct TrayStatus {
    pub tooltip: String,
    pub title: Option<String>,
}

/// What a menu item asks for.
#[derive(Debug, Clone, PartialEq)]
pub enum TrayAction {
    StopTimer,
    PauseTimer,
    /// Starting the paused timer's own task resumes it.
    ResumeTimer,
    /// An answer to "you were away".
    ResolveIdle(&'static str),
    /// The app picks: its start dialog, or the Tasks page when there are no
    /// tasks yet.
    ChooseTask,
    ShowApp,
    StartTask(String),
}

impl TrayAction {
    pub fn from_id(id: &str) -> Option<TrayAction> {
        Some(match id {
            STOP_TIMER => TrayAction::StopTimer,
            PAUSE_TIMER => TrayAction::PauseTimer,
            RESUME_TIMER => TrayAction::ResumeTimer,
            IDLE_DISCARD_RESUME => TrayAction::ResolveIdle(IDLE_CHOICE_DISCARD_RESUME),
            IDLE_KEEP_RESUME => TrayAction::ResolveIdle(IDLE_CHOICE_KEEP_RESUME),
            CHOOSE_TASK | ADD_TASK => TrayAction::ChooseTask,
            SHOW_APP => TrayAction::ShowApp,
            _ => TrayAction::StartTask(id.strip_prefix(START_TASK_PREFIX)?.to_string()),
        })
    }
}

/// Everything the tray shows, read from the data at once.
#[derive(Debug, Clone, PartialEq)]
pub struct TraySnapshot {
    pub live: Option<LiveTimer>,
    /// The live timer is the one idle detection paused (question pending).
    pub idle_paused: bool,
    /// The Start submenu's tasks, in order.
    pub tasks: Vec<Task>,
    /// Server mode: what's wrong with the link to the server, if anything.
    pub server_problem: Option<&'static str>,
    /// When the next withdrawal opens and how much it will be (the app sends it).
    pub withdrawal: Option<String>,
}

impl TraySnapshot {
    /// `idle_paused` is the timer idle detection paused, if any.
    pub fn read(workspace: &Workspace, idle_paused: Option<&str>, now: DateTime<Utc>) -> Self {
        let tasks = workspace.tasks();
        let last_used = last_used_by_task(&workspace.sessions);
        let live = live_timer(&workspace.sessions, now);
        Self {
            idle_paused: live
                .as_ref()
                .is_some_and(|live| live.is_paused && idle_paused == Some(&live.instance_id)),
            live,
            tasks: visible_tasks(&tasks, &last_used, TRAY_MAX_RECENT_TASKS)
                .into_iter()
                .cloned()
                .collect(),
            server_problem: None,
            withdrawal: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.live.as_ref().is_some_and(|live| !live.is_paused)
    }

    pub fn menu(&self) -> TrayMenu {
        let mut items = Vec::new();
        // Its actions fail until the server is back (or signed in again)
        if let Some(problem) = self.server_problem {
            items.push(TrayItem::Label(format!("⚠️ {}", problem)));
            items.push(TrayItem::Separator);
        }
        match &self.live {
            Some(live) if self.idle_paused => {
                // Idle detection paused it as of when input stopped: the
                // resume choices decide whether that away time counts.
                items.push(TrayItem::Label(format!(
                    "⏸️ Paused while away: {} ({})",
                    live.task_name,
                    format_duration_hm(live.elapsed_ms)
                )));
                items.push(action(
                    IDLE_DISCARD_RESUME,
                    "▶️ Resume (don't count away time)",
                ));
                items.push(action(IDLE_KEEP_RESUME, "↩️ Resume, counting away time"));
                items.push(action(STOP_TIMER, "⏹️ Stop Timer"));
            }
            Some(live) => {
                let elapsed = format_duration_hm(live.elapsed_ms);
                if live.is_paused {
                    items.push(TrayItem::Label(format!(
                        "⏸️ Paused: {} ({})",
                        live.task_name, elapsed
                    )));
                    items.push(action(RESUME_TIMER, "▶️ Resume Timer"));
                } else {
                    items.push(TrayItem::Label(format!(
                        "⏱️ Running: {} ({})",
                        live.task_name, elapsed
                    )));
                    items.push(action(PAUSE_TIMER, "⏸️ Pause Timer"));
                }
                items.push(action(STOP_TIMER, "⏹️ Stop Timer"));
            }
            None => items.push(TrayItem::Label("No active timer".to_string())),
        }
        items.push(TrayItem::Separator);

        if let Some(withdrawal) = &self.withdrawal {
            items.push(TrayItem::Label(format!("💰 {}", withdrawal)));
            items.push(TrayItem::Separator);
        }

        if self.tasks.is_empty() {
            // Work starts from existing tasks only; the app opens on Tasks.
            items.push(action(ADD_TASK, "➕ Add a Task…"));
        } else {
            let mut start: Vec<TrayItem> = self
                .tasks
                .iter()
                .map(|task| TrayItem::Action {
                    id: format!("{}{}", START_TASK_PREFIX, task.id),
                    label: if task.is_favorite {
                        format!("★ {}", task.name)
                    } else {
                        task.name.clone()
                    },
                })
                .collect();
            // Every task, not just the ones listed, in the app's start dialog
            start.push(TrayItem::Separator);
            start.push(action(CHOOSE_TASK, "Choose Task…"));
            items.push(TrayItem::Submenu {
                label: "▶️ Start Timer".to_string(),
                items: start,
            });
        }

        items.push(TrayItem::Separator);
        items.push(action(SHOW_APP, "📊 Show App"));
        items.push(TrayItem::Separator);
        items.push(TrayItem::Quit);
        TrayMenu(items)
    }

    pub fn status(&self) -> TrayStatus {
        let mut status = self.timer_status();
        if let Some(problem) = self.server_problem {
            status.tooltip = format!("⚠️ {} - {}", problem, status.tooltip);
        }
        status
    }

    fn timer_status(&self) -> TrayStatus {
        match &self.live {
            Some(live) => {
                let elapsed = format_duration_hm(live.elapsed_ms);
                if live.is_paused {
                    TrayStatus {
                        tooltip: format!(
                            "⏸️ {} - {} paused (Click for menu)",
                            live.task_name, elapsed
                        ),
                        title: Some(format!("⏸ {}", elapsed)),
                    }
                } else {
                    TrayStatus {
                        tooltip: format!("⏱️ {} - {} (Click for menu)", live.task_name, elapsed),
                        title: Some(elapsed),
                    }
                }
            }
            None => TrayStatus {
                tooltip: format!(
                    "{} - No active timer (Click for menu)",
                    TRAY_TOOLTIP_APP_NAME
                ),
                title: None,
            },
        }
    }
}

fn action(id: &str, label: &str) -> TrayItem {
    TrayItem::Action {
        id: id.to_string(),
        label: label.to_string(),
    }
}

/// When each task last had a timer start, from the sessions (keyed by task id).
pub(crate) fn last_used_by_task(sessions: &[TaskSession]) -> HashMap<String, DateTime<Utc>> {
    let mut last_used: HashMap<String, DateTime<Utc>> = HashMap::new();
    for session in sessions {
        for instance in &session.timer_instances {
            let latest = last_used
                .entry(session.task_id_of(instance).to_string())
                .or_insert(instance.start_time);
            *latest = (*latest).max(instance.start_time);
        }
    }
    last_used
}

/// Tasks for the tray's quick-start submenu, in the same order as the app's
/// start pickers (orderTasksForStart in packages/client/src/utils/
/// taskOrdering.ts): favorites first, then most recently used, then
/// never-used tasks by name. Archived tasks are hidden, and truncation
/// happens after ordering so they never take visible slots.
pub(crate) fn visible_tasks<'a>(
    tasks: &'a [Task],
    last_used: &HashMap<String, DateTime<Utc>>,
    max: usize,
) -> Vec<&'a Task> {
    let mut visible: Vec<&Task> = tasks.iter().filter(|t| !t.is_archived).collect();
    // Option orders None first, so comparing b to a puts the latest use first
    // and never-used tasks last; those fall back to their names.
    visible.sort_by(|a, b| {
        b.is_favorite
            .cmp(&a.is_favorite)
            .then_with(|| last_used.get(&b.id).cmp(&last_used.get(&a.id)))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    visible.truncate(max);
    visible
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    fn task(id: &str, archived: bool) -> Task {
        Task {
            id: id.to_string(),
            name: format!("Task {}", id),
            hourly_rate: None,
            default_note_template_id: None,
            is_archived: archived,
            is_favorite: false,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    fn favorite(id: &str) -> Task {
        Task {
            is_favorite: true,
            ..task(id, false)
        }
    }

    fn at(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    fn ids<'a>(tasks: &[&'a Task]) -> Vec<&'a str> {
        tasks.iter().map(|t| t.id.as_str()).collect()
    }

    fn live(paused: bool) -> LiveTimer {
        LiveTimer {
            instance_id: "r".to_string(),
            task_id: "a".to_string(),
            task_name: "Writing".to_string(),
            is_paused: paused,
            elapsed_ms: 90 * 60_000,
        }
    }

    fn snapshot(live: Option<LiveTimer>, idle_paused: bool, tasks: Vec<Task>) -> TraySnapshot {
        TraySnapshot {
            live,
            idle_paused,
            tasks,
            server_problem: None,
            withdrawal: None,
        }
    }

    fn labels(items: &[TrayItem]) -> Vec<String> {
        items
            .iter()
            .map(|item| match item {
                TrayItem::Label(text) => format!("label {}", text),
                TrayItem::Action { id, label } => format!("{} {}", id, label),
                TrayItem::Separator => "-".to_string(),
                TrayItem::Submenu { label, items } => {
                    format!("{} [{}]", label, labels(items).join(", "))
                }
                TrayItem::Quit => "quit".to_string(),
            })
            .collect()
    }

    #[test]
    fn with_nothing_running_the_menu_offers_the_tasks() {
        let menu = snapshot(None, false, vec![favorite("a"), task("b", false)]).menu();
        assert_eq!(
            labels(&menu.0),
            [
                "label No active timer",
                "-",
                "▶️ Start Timer [start_task_a ★ Task a, start_task_b Task b, -, choose_task Choose Task…]",
                "-",
                "show_app 📊 Show App",
                "-",
                "quit"
            ]
        );
    }

    #[test]
    fn the_next_withdrawal_has_its_own_line_under_the_timer() {
        let mut with = snapshot(None, false, vec![]);
        with.withdrawal = Some("Next withdrawal: Mon, Nov 10, 6:25 PM · $1,100.00".to_string());
        assert_eq!(
            labels(&with.menu().0)[..4],
            [
                "label No active timer",
                "-",
                "label 💰 Next withdrawal: Mon, Nov 10, 6:25 PM · $1,100.00",
                "-"
            ]
        );
    }

    #[test]
    fn without_tasks_the_menu_offers_to_add_one() {
        let menu = snapshot(None, false, vec![]).menu();
        assert_eq!(labels(&menu.0)[2], "add_task ➕ Add a Task…");
    }

    #[test]
    fn a_live_timer_can_be_paused_resumed_and_stopped() {
        let running = labels(&snapshot(Some(live(false)), false, vec![]).menu().0);
        assert_eq!(
            running[..3],
            [
                "label ⏱️ Running: Writing (01:30)",
                "pause_timer ⏸️ Pause Timer",
                "stop_timer ⏹️ Stop Timer"
            ]
        );
        let paused = labels(&snapshot(Some(live(true)), false, vec![]).menu().0);
        assert_eq!(
            paused[..3],
            [
                "label ⏸️ Paused: Writing (01:30)",
                "resume_timer ▶️ Resume Timer",
                "stop_timer ⏹️ Stop Timer"
            ]
        );
    }

    #[test]
    fn a_timer_idle_detection_paused_offers_the_away_choices() {
        let menu = labels(&snapshot(Some(live(true)), true, vec![]).menu().0);
        assert_eq!(
            menu[..4],
            [
                "label ⏸️ Paused while away: Writing (01:30)",
                "idle_discard_resume ▶️ Resume (don't count away time)",
                "idle_keep_resume ↩️ Resume, counting away time",
                "stop_timer ⏹️ Stop Timer"
            ]
        );
    }

    #[test]
    fn the_status_shows_the_live_timer() {
        assert_eq!(
            snapshot(Some(live(false)), false, vec![]).status(),
            TrayStatus {
                tooltip: "⏱️ Writing - 01:30 (Click for menu)".to_string(),
                title: Some("01:30".to_string())
            }
        );
        assert_eq!(
            snapshot(Some(live(true)), false, vec![]).status(),
            TrayStatus {
                tooltip: "⏸️ Writing - 01:30 paused (Click for menu)".to_string(),
                title: Some("⏸ 01:30".to_string())
            }
        );
        assert_eq!(
            snapshot(None, false, vec![]).status(),
            TrayStatus {
                tooltip: "TaskMint - No active timer (Click for menu)".to_string(),
                title: None
            }
        );
    }

    #[test]
    fn a_problem_with_the_server_leads_the_menu_and_the_tooltip() {
        let mut down = snapshot(Some(live(false)), false, vec![]);
        down.server_problem = Some("Can't reach the TaskMint server");
        assert_eq!(
            labels(&down.menu().0)[..3],
            [
                "label ⚠️ Can't reach the TaskMint server",
                "-",
                "label ⏱️ Running: Writing (01:30)"
            ]
        );
        assert_eq!(
            down.status(),
            TrayStatus {
                tooltip: "⚠️ Can't reach the TaskMint server - ⏱️ Writing - 01:30 (Click for menu)"
                    .to_string(),
                title: Some("01:30".to_string())
            }
        );
    }

    #[test]
    fn menu_ids_name_their_actions() {
        for (id, action) in [
            ("stop_timer", TrayAction::StopTimer),
            ("pause_timer", TrayAction::PauseTimer),
            ("resume_timer", TrayAction::ResumeTimer),
            (
                "idle_discard_resume",
                TrayAction::ResolveIdle("discardResume"),
            ),
            ("idle_keep_resume", TrayAction::ResolveIdle("keepResume")),
            ("choose_task", TrayAction::ChooseTask),
            ("add_task", TrayAction::ChooseTask),
            ("show_app", TrayAction::ShowApp),
            ("start_task_t1", TrayAction::StartTask("t1".to_string())),
        ] {
            assert_eq!(TrayAction::from_id(id), Some(action), "{}", id);
        }
        assert_eq!(TrayAction::from_id("quit"), None);
    }

    fn workspace_with(sessions: serde_json::Value, tasks: serde_json::Value) -> Workspace {
        let mut workspace = Workspace {
            sessions: serde_json::from_value(sessions).unwrap(),
            ..Workspace::default()
        };
        workspace.records.insert("predefinedTasks".into(), tasks);
        workspace
    }

    fn paused_session() -> serde_json::Value {
        json!([{
            "id": "s1", "taskId": "a", "taskName": "Writing", "isActive": true, "notes": null,
            "timerInstances": [{
                "id": "i1", "sessionId": "s1", "startTime": "2026-03-02T15:00:00Z",
                "endTime": null, "duration": null, "isPaused": true,
                "pausedAt": "2026-03-02T15:30:00Z", "pausedDuration": 0,
                "resumedAt": null, "notes": null
            }]
        }])
    }

    #[test]
    fn a_snapshot_reads_the_live_timer_and_the_listed_tasks() {
        let workspace = workspace_with(
            paused_session(),
            json!([
                { "id": "a", "name": "Writing", "createdAt": "x", "updatedAt": "x" },
                { "id": "b", "name": "Old", "isArchived": true, "createdAt": "x", "updatedAt": "x" }
            ]),
        );
        let now = Utc.with_ymd_and_hms(2026, 3, 2, 16, 0, 0).unwrap();

        let read = TraySnapshot::read(&workspace, Some("i1"), now);
        assert_eq!(read.live.as_ref().unwrap().elapsed_ms, 30 * 60_000);
        assert!(read.idle_paused);
        assert!(!read.is_running());
        assert_eq!(read.tasks.iter().map(|t| &t.id).collect::<Vec<_>>(), ["a"]);

        // Another timer's pause, or none, isn't this one's
        assert!(!TraySnapshot::read(&workspace, Some("other"), now).idle_paused);
        assert!(!TraySnapshot::read(&workspace, None, now).idle_paused);
        assert!(snapshot(Some(live(false)), false, vec![]).is_running());
        assert!(!snapshot(None, false, vec![]).is_running());
    }

    #[test]
    fn a_running_timer_is_never_idle_paused() {
        let mut sessions = paused_session();
        sessions[0]["timerInstances"][0]["isPaused"] = json!(false);
        sessions[0]["timerInstances"][0]["isRunning"] = json!(true);
        let workspace = workspace_with(sessions, json!([]));
        let now = Utc.with_ymd_and_hms(2026, 3, 2, 16, 0, 0).unwrap();
        assert!(!TraySnapshot::read(&workspace, Some("i1"), now).idle_paused);
    }

    #[test]
    fn visible_tasks_filters_archived() {
        let tasks = vec![task("a", false), task("b", true), task("c", false)];
        assert_eq!(
            ids(&visible_tasks(&tasks, &HashMap::new(), 5)),
            vec!["a", "c"]
        );
    }

    #[test]
    fn visible_tasks_truncates_after_filtering() {
        // Archived tasks at the front of the list must not take slots
        let tasks = vec![
            task("x", true),
            task("y", true),
            task("a", false),
            task("b", false),
            task("c", false),
        ];
        assert_eq!(
            ids(&visible_tasks(&tasks, &HashMap::new(), 2)),
            vec!["a", "b"]
        );
    }

    #[test]
    fn visible_tasks_puts_recently_used_first_then_never_used_by_name() {
        let tasks = vec![
            task("d", false),
            task("b", false),
            task("c", false),
            task("a", false),
        ];
        let last_used = HashMap::from([("c".to_string(), at(200)), ("b".to_string(), at(100))]);
        assert_eq!(
            ids(&visible_tasks(&tasks, &last_used, 5)),
            vec!["c", "b", "a", "d"]
        );
    }

    #[test]
    fn visible_tasks_pins_favorites_ahead_of_recent_ones() {
        let tasks = vec![
            task("a", false),
            favorite("b"),
            task("c", false),
            favorite("d"),
        ];
        // a is the most recent overall, but both favorites come first, each
        // group ordered by recency
        let last_used = HashMap::from([
            ("a".to_string(), at(300)),
            ("d".to_string(), at(200)),
            ("b".to_string(), at(100)),
        ]);
        assert_eq!(
            ids(&visible_tasks(&tasks, &last_used, 3)),
            vec!["d", "b", "a"]
        );
    }

    #[test]
    fn last_used_by_task_takes_each_task_latest_timer_start() {
        let session = |id: &str, task_id: &str, starts: &[i64]| {
            let json = json!({
                "id": id,
                "taskId": task_id,
                "taskName": task_id,
                "timerInstances": starts.iter().enumerate().map(|(n, s)| json!({
                    "id": format!("{}-{}", id, n),
                    "sessionId": id,
                    "startTime": at(*s).to_rfc3339(),
                    "endTime": null,
                    "duration": null,
                    "pausedAt": null,
                    "pausedDuration": null,
                    "resumedAt": null,
                    "notes": null
                })).collect::<Vec<_>>(),
                "notes": null
            });
            serde_json::from_value::<TaskSession>(json).unwrap()
        };
        let sessions = vec![
            session("s1", "a", &[50, 10]),
            session("s2", "a", &[30]),
            session("s3", "b", &[20]),
            session("s4", "c", &[]),
        ];

        let last_used = last_used_by_task(&sessions);

        assert_eq!(last_used.get("a"), Some(&at(50)));
        assert_eq!(last_used.get("b"), Some(&at(20)));
        assert_eq!(last_used.get("c"), None);
    }

    #[test]
    fn last_used_by_task_goes_by_each_timers_own_task() {
        let session: TaskSession = serde_json::from_value(json!({
            "id": "s",
            "taskId": "a",
            "taskName": "a",
            "timerInstances": [
                {
                    "id": "own",
                    "sessionId": "s",
                    "startTime": at(10).to_rfc3339(),
                    "endTime": null,
                    "duration": null,
                    "pausedAt": null,
                    "pausedDuration": null,
                    "resumedAt": null,
                    "notes": null
                },
                {
                    "id": "other",
                    "sessionId": "s",
                    "startTime": at(40).to_rfc3339(),
                    "endTime": null,
                    "duration": null,
                    "pausedAt": null,
                    "pausedDuration": null,
                    "resumedAt": null,
                    "notes": null,
                    "task": { "taskId": "b", "taskName": "b" }
                }
            ],
            "notes": null
        }))
        .unwrap();

        let last_used = last_used_by_task(&[session]);

        assert_eq!(last_used.get("a"), Some(&at(10)));
        assert_eq!(last_used.get("b"), Some(&at(40)));
    }
}
