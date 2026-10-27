//! The system tray. What it shows is in `model`; this keeps it in line with
//! the data and runs its menu's actions through the same commands the app
//! uses (the session context reloads on the events they publish), so it
//! works whatever state the window is in.

pub mod model;

use crate::config::TRAY_STATUS_UPDATE_INTERVAL;
use crate::events::{emit_quiet, SHOW_START_TASK_DIALOG};
use crate::state::AppState;
use crate::ticker::Ticker;
use model::{TrayAction, TraySnapshot};
use taskmint_core::command::{Command, NoArgs, StartTaskArgs};

/// The tray as the data stands now.
fn snapshot(state: &AppState) -> TraySnapshot {
    let idle_paused = state.with_idle(|idle| idle.pause.as_ref().map(|p| p.instance_id.clone()));
    let now = (state.clock)();
    state
        .backend
        .read(|workspace| TraySnapshot::read(workspace, idle_paused.as_deref(), now))
}

/// Creates the tray icon and its menu. False when that failed: there's no
/// tray this session, and the window closes normally.
pub fn start(state: &AppState) -> bool {
    let menu = snapshot(state).menu();
    if let Err(e) = state.platform.render_tray(&menu) {
        log::error!(
            "Failed to set up the system tray; no tray icon this session: {}",
            e
        );
        return false;
    }
    state.with_tray_mut(|shown| {
        shown.enabled = true;
        shown.menu = Some(menu);
    });
    sync(state);
    true
}

/// Brings the tray in line with the data. The menu is rebuilt only when it
/// changed (a rebuild closes a menu the user has open), and the status only
/// when it did. Runs after every saved change to sessions or tasks, after
/// tray actions, and every second while the app runs.
pub fn sync(state: &AppState) {
    if !state.with_tray(|shown| shown.enabled) {
        return;
    }
    let snapshot = snapshot(state);
    let menu = snapshot.menu();
    if state.with_tray(|shown| shown.menu.as_ref() != Some(&menu)) {
        match state.platform.render_tray(&menu) {
            Ok(()) => state.with_tray_mut(|shown| shown.menu = Some(menu)),
            Err(e) => log::error!("Failed to update the tray menu: {}", e),
        }
    }
    let status = snapshot.status();
    if state.with_tray(|shown| shown.status.as_ref() != Some(&status)) {
        match state.platform.set_tray_status(&status) {
            Ok(()) => state.with_tray_mut(|shown| shown.status = Some(status)),
            Err(e) => log::error!("Failed to update the tray tooltip: {}", e),
        }
    }
}

/// Keeps the tray's clock current (the menu and tooltip show elapsed time),
/// and catches anything a saved change didn't already sync.
pub fn start_ticker(state: &AppState) -> Ticker {
    let state = state.clone();
    Ticker::start("tray", TRAY_STATUS_UPDATE_INTERVAL, move || sync(&state))
}

/// Runs a tray action; a failure is logged (the tray has nowhere to show it).
fn act(state: &AppState, what: &str, command: Command) {
    if let Err(e) = state.backend.call(command) {
        log::error!("Failed to {} from the tray: {}", what, e);
    }
}

fn start_task(state: &AppState, task_id: String, task_name: String) {
    act(
        state,
        "start a timer",
        Command::StartTask(StartTaskArgs { task_id, task_name }),
    );
}

pub fn handle_menu_event(state: &AppState, id: &str) {
    log::debug!("Tray menu item clicked: '{}'", id);
    let Some(action) = TrayAction::from_id(id) else {
        log::debug!("Unhandled menu item: '{}'", id);
        return;
    };
    match action {
        TrayAction::StopTimer => act(state, "stop the timer", Command::StopLiveTimer(NoArgs {})),
        TrayAction::PauseTimer => act(state, "pause the timer", Command::PauseLiveTimer(NoArgs {})),
        TrayAction::ResumeTimer => {
            if let Some(live) = snapshot(state).live.filter(|live| live.is_paused) {
                start_task(state, live.task_id, live.task_name);
            }
        }
        TrayAction::ResolveIdle(choice) => {
            if let Err(e) = crate::idle::resolve(state, choice) {
                log::error!("Failed to resume after idle from the tray: {}", e);
            }
        }
        TrayAction::ChooseTask => {
            emit_quiet(state, SHOW_START_TASK_DIALOG, ());
            state.platform.show_main_window();
        }
        TrayAction::ShowApp => state.platform.show_main_window(),
        TrayAction::StartTask(task_id) => {
            let task_name = state.backend.read(|workspace| {
                workspace
                    .tasks()
                    .into_iter()
                    .find(|task| task.id == task_id)
                    .map(|task| task.name)
            });
            match task_name {
                Some(task_name) => start_task(state, task_id, task_name),
                None => log::error!("Tray start: no task with id '{}'", task_id),
            }
        }
    }
    sync(state);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::Platform;
    use crate::testing::{fixture, Fixture};
    use model::{TrayItem, TrayMenu};
    use serde_json::json;
    use taskmint_core::idle::IdlePause;

    fn with_tasks() -> Fixture {
        let f = fixture();
        f.state
            .backend
            .call_named(
                "set_app_record",
                json!({ "key": "predefinedTasks", "value": [
                    { "id": "t1", "name": "Writing", "createdAt": "x", "updatedAt": "x" }
                ] }),
            )
            .unwrap();
        f
    }

    /// The menu's first line, which says what the timer is doing.
    fn first_label(menu: &TrayMenu) -> TrayItem {
        menu.0[0].clone()
    }

    fn label(text: &str) -> TrayItem {
        TrayItem::Label(text.to_string())
    }

    fn last_menu(f: &Fixture) -> TrayMenu {
        f.platform.recorded().menus.last().cloned().unwrap()
    }

    #[test]
    fn the_tray_starts_with_the_menu_and_follows_saved_changes() {
        let f = with_tasks();
        assert!(start(&f.state));
        assert!(f.platform.has_tray());
        assert_eq!(first_label(&last_menu(&f)), label("No active timer"));
        assert_eq!(f.platform.recorded().statuses.len(), 1);

        // Starting in the app rebuilds the menu once
        f.state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();
        assert_eq!(
            first_label(&last_menu(&f)),
            label("⏱️ Running: Writing (00:00)")
        );
        let menus = f.platform.recorded().menus.len();

        // Nothing new: nothing redrawn
        sync(&f.state);
        assert_eq!(f.platform.recorded().menus.len(), menus);
        // A minute on: the elapsed time changed
        f.advance_ms(60_000);
        sync(&f.state);
        assert_eq!(
            first_label(&last_menu(&f)),
            label("⏱️ Running: Writing (00:01)")
        );
    }

    #[test]
    fn without_a_tray_nothing_is_drawn() {
        let f = fixture();
        f.platform.fail("tray");
        assert!(!start(&f.state));
        sync(&f.state);
        assert!(f.platform.recorded().statuses.is_empty());
    }

    #[test]
    fn a_failed_redraw_is_tried_again_on_the_next_sync() {
        let f = with_tasks();
        assert!(start(&f.state));
        f.platform.fail("tray");
        f.platform.fail("status");
        f.state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();

        // What was last shown stays recorded, so the next sync redraws
        let shown = f.state.with_tray(|shown| shown.menu.clone().unwrap());
        assert_eq!(first_label(&shown), label("No active timer"));
        assert!(f.state.with_tray(|shown| shown.status.is_some()));
        assert_ne!(
            f.state.with_tray(|shown| shown.status.clone()),
            Some(snapshot(&f.state).status())
        );
    }

    #[test]
    fn the_menu_starts_pauses_resumes_and_stops_the_timer() {
        let f = with_tasks();
        assert!(start(&f.state));

        handle_menu_event(&f.state, "start_task_t1");
        assert_eq!(
            first_label(&last_menu(&f)),
            label("⏱️ Running: Writing (00:00)")
        );
        handle_menu_event(&f.state, "pause_timer");
        assert_eq!(
            first_label(&last_menu(&f)),
            label("⏸️ Paused: Writing (00:00)")
        );
        handle_menu_event(&f.state, "resume_timer");
        assert_eq!(
            first_label(&last_menu(&f)),
            label("⏱️ Running: Writing (00:00)")
        );
        // Resuming a running timer does nothing
        handle_menu_event(&f.state, "resume_timer");
        handle_menu_event(&f.state, "stop_timer");
        assert_eq!(first_label(&last_menu(&f)), label("No active timer"));
        assert_eq!(
            f.platform.event_names(),
            [
                // with_tasks saved the tasks
                "app-records-changed",
                "timer-instance-started",
                "timer-instance-paused",
                "timer-instance-resumed",
                "timer-instance-stopped"
            ]
        );
    }

    #[test]
    fn a_task_that_cant_start_is_logged() {
        let f = fixture();
        f.state
            .backend
            .call_named(
                "set_app_record",
                json!({ "key": "predefinedTasks", "value": [
                    { "id": "blank", "name": " ", "createdAt": "x", "updatedAt": "x" }
                ] }),
            )
            .unwrap();
        handle_menu_event(&f.state, "start_task_blank");
        handle_menu_event(&f.state, "start_task_gone");
        assert!(f.state.backend.read(|w| w.sessions.is_empty()));
    }

    #[test]
    fn choosing_a_task_or_showing_the_app_brings_the_window_forward() {
        let f = fixture();
        handle_menu_event(&f.state, "add_task");
        handle_menu_event(&f.state, "show_app");
        handle_menu_event(&f.state, "something_else");
        assert_eq!(f.platform.event_names(), ["show-start-task-dialog"]);
        assert_eq!(f.platform.recorded().windows_shown, 2);
    }

    #[test]
    fn the_away_choices_answer_the_idle_question() {
        let f = with_tasks();
        assert!(start(&f.state));
        let started = f
            .state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();
        let instance_id = started["instanceId"].as_str().unwrap().to_string();
        f.state
            .backend
            .call_named(
                "pause_timer_at",
                json!({ "instanceId": instance_id, "idleSince": "2026-03-02T14:59:00Z" }),
            )
            .unwrap();
        f.state.with_idle_mut(|idle| {
            idle.pause = Some(IdlePause {
                instance_id: instance_id.clone(),
                task_name: "Writing".to_string(),
                idle_since: crate::testing::start(),
                returned_at: None,
            })
        });

        handle_menu_event(&f.state, "idle_keep_resume");
        assert!(f.state.with_idle(|idle| idle.pause.is_none()));

        // With no question pending, the timer can't be resumed that way
        f.state.with_idle_mut(|idle| {
            idle.pause = Some(IdlePause {
                instance_id: "gone".to_string(),
                task_name: "Writing".to_string(),
                idle_since: crate::testing::start(),
                returned_at: None,
            })
        });
        handle_menu_event(&f.state, "idle_discard_resume");
        assert!(f.state.with_idle(|idle| idle.pause.is_some()));
    }

    #[test]
    fn the_ticker_keeps_the_tray_current() {
        let f = with_tasks();
        assert!(start(&f.state));
        f.state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();
        f.advance_ms(120_000);
        let ticker = start_ticker(&f.state);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while first_label(&last_menu(&f)) != label("⏱️ Running: Writing (00:02)") {
            assert!(
                std::time::Instant::now() < deadline,
                "the ticker never synced"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        ticker.stop();
    }
}
