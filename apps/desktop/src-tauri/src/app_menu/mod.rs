//! The menu bar (macOS) or window menu (Windows). What it shows is in
//! `model`; this puts it up once, keeps the Timer items in step with the
//! data (after every saved change, as the tray does), and answers clicks:
//! the app's pages and dialogs go to the webview as `menu-command` events,
//! links and folders open here, and the timer's pause and stop run the
//! tray's own actions. Menu clicks the menu bar doesn't know are the tray's.

pub mod model;

use crate::events::{emit_quiet, MENU_COMMAND};
use crate::state::AppState;
use crate::tray::{self, model::TrayAction};
use model::{AppMenu, AppMenuAction, MenuOs};

/// The Timer items' state: the live timer, if any.
fn build(state: &AppState, os: MenuOs) -> AppMenu {
    AppMenu::build(os, tray::snapshot(state).live.as_ref())
}

/// Puts the menu bar up. False when that failed: the system's default menu
/// stays (macOS), or there's none (Windows).
pub fn start(state: &AppState, os: MenuOs) -> bool {
    let menu = build(state, os);
    match state.platform.render_app_menu(&menu) {
        Ok(()) => {
            state.with_app_menu_mut(|shown| *shown = Some(menu));
            true
        }
        Err(e) => {
            log::error!(
                "Failed to set up the menu bar; keeping the default menu: {}",
                e
            );
            false
        }
    }
}

/// Brings the Timer items in line with the data, changing only what did
/// (in place: an open menu stays open).
pub fn sync(state: &AppState) {
    let Some(shown) = state.with_app_menu(|shown| shown.clone()) else {
        return;
    };
    let menu = build(state, shown.os);
    let changed = menu.changed_actions(&shown);
    if changed.is_empty() {
        return;
    }
    match state.platform.update_app_menu(&changed) {
        Ok(()) => state.with_app_menu_mut(|shown| *shown = Some(menu)),
        Err(e) => log::error!("Failed to update the menu bar: {}", e),
    }
}

/// Every menu click, the menu bar's and the tray's.
pub fn handle_menu_event(state: &AppState, id: &str) {
    match AppMenuAction::from_id(id) {
        Some(action) => run(state, action),
        None => tray::handle_menu_event(state, id),
    }
}

fn run(state: &AppState, action: AppMenuAction) {
    match action {
        AppMenuAction::Command(command) => {
            emit_quiet(state, MENU_COMMAND, command);
            // It may be hidden to the tray
            state.platform.show_main_window();
        }
        AppMenuAction::Link(link) => {
            if let Err(e) = crate::about::open_link(state, link) {
                log::error!("Failed to open {:?} from the menu bar: {}", link, e);
            }
        }
        AppMenuAction::Folder(folder) => {
            if let Err(e) = crate::about::open_folder(state, folder) {
                log::error!(
                    "Failed to show the {:?} folder from the menu bar: {}",
                    folder,
                    e
                );
            }
        }
        AppMenuAction::PauseResume => {
            let snapshot = tray::snapshot(state);
            match snapshot.live {
                // Idle detection paused it: the app asks whether the away
                // time counts before it resumes
                Some(_) if snapshot.idle_paused => state.platform.show_main_window(),
                Some(live) if live.is_paused => tray::run(state, TrayAction::ResumeTimer),
                Some(_) => tray::run(state, TrayAction::PauseTimer),
                None => {}
            }
        }
        AppMenuAction::StopTimer => tray::run(state, TrayAction::StopTimer),
    }
}

#[cfg(test)]
mod tests {
    use super::model::Action;
    use super::*;
    use crate::testing::{fixture, Fixture};
    use serde_json::json;
    use taskmint_core::contract::{HELP_URL, ISSUES_URL};
    use taskmint_core::idle::IdlePause;

    fn with_task() -> Fixture {
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

    fn timer_labels(updates: &[Vec<Action>]) -> Vec<Vec<String>> {
        updates
            .iter()
            .map(|update| update.iter().map(|action| action.label.clone()).collect())
            .collect()
    }

    fn start_writing(f: &Fixture) {
        f.state
            .backend
            .call_named(
                "start_task",
                json!({ "taskId": "t1", "taskName": "Writing" }),
            )
            .unwrap();
    }

    fn live_is_paused(f: &Fixture) -> Option<bool> {
        tray::snapshot(&f.state).live.map(|live| live.is_paused)
    }

    #[test]
    fn it_goes_up_once_and_its_timer_items_follow_the_data() {
        let f = with_task();
        assert!(start(&f.state, MenuOs::MacOs));
        assert_eq!(f.platform.recorded().app_menus.len(), 1);

        start_writing(&f);
        assert_eq!(
            timer_labels(&f.platform.recorded().app_menu_updates),
            [["Pause “Writing”", "Stop “Writing”"]]
        );
        // Nothing changed: nothing redrawn (the menu has no clock)
        f.advance_ms(60_000);
        sync(&f.state);
        assert_eq!(f.platform.recorded().app_menu_updates.len(), 1);
        assert_eq!(f.platform.recorded().app_menus.len(), 1);
    }

    #[test]
    fn without_a_menu_bar_nothing_follows() {
        let f = with_task();
        f.platform.fail("app_menu");
        assert!(!start(&f.state, MenuOs::Windows));
        start_writing(&f);
        assert!(f.platform.recorded().app_menu_updates.is_empty());
    }

    #[test]
    fn an_update_that_fails_is_tried_again_with_the_next_change() {
        let f = with_task();
        start(&f.state, MenuOs::MacOs);
        f.platform.fail("app_menu_update");
        start_writing(&f);
        assert!(f.platform.recorded().app_menu_updates.is_empty());
        f.platform.heal("app_menu_update");
        sync(&f.state);
        assert_eq!(
            timer_labels(&f.platform.recorded().app_menu_updates),
            [["Pause “Writing”", "Stop “Writing”"]]
        );
    }

    #[test]
    fn the_apps_items_go_to_the_window_and_bring_it_forward() {
        let f = fixture();
        for (id, payload) in [
            (
                "app.view.home",
                json!({ "type": "showView", "view": "home" }),
            ),
            (
                "app.view.payouts",
                json!({ "type": "showView", "view": "payouts" }),
            ),
            ("app.new_task", json!({ "type": "newTask" })),
            ("app.start_work", json!({ "type": "startWork" })),
            ("app.add_time", json!({ "type": "addTime" })),
            ("app.import_work_logs", json!({ "type": "importWorkLogs" })),
            ("app.command_palette", json!({ "type": "commandPalette" })),
            ("app.settings", json!({ "type": "settings" })),
            ("app.cloud_sync", json!({ "type": "cloudSync" })),
            ("app.about", json!({ "type": "about" })),
            ("app.check_updates", json!({ "type": "checkForUpdates" })),
            ("app.whats_new", json!({ "type": "whatsNew" })),
            (
                "app.keyboard_shortcuts",
                json!({ "type": "keyboardShortcuts" }),
            ),
        ] {
            handle_menu_event(&f.state, id);
            assert_eq!(
                f.platform.recorded().events.last(),
                Some(&("menu-command".to_string(), payload)),
                "{}",
                id
            );
        }
        assert_eq!(f.platform.recorded().windows_shown, 13);
    }

    #[test]
    fn links_and_folders_open_here_and_a_failure_is_only_logged() {
        let f = fixture();
        let logs = f.dir.0.join("logs");
        f.platform.set_log_dir(&logs);
        handle_menu_event(&f.state, "app.help");
        handle_menu_event(&f.state, "app.report_problem");
        handle_menu_event(&f.state, "app.data_folder");
        handle_menu_event(&f.state, "app.logs_folder");
        assert_eq!(f.platform.recorded().opened_urls, [HELP_URL, ISSUES_URL]);
        assert_eq!(f.platform.recorded().opened, [f.dir.0.clone(), logs]);

        f.platform.fail("open_url");
        f.platform.fail("open_dir");
        handle_menu_event(&f.state, "app.help");
        handle_menu_event(&f.state, "app.data_folder");
        assert_eq!(f.platform.recorded().opened_urls.len(), 2);
        assert!(f.platform.recorded().events.is_empty());
    }

    #[test]
    fn the_timer_items_pause_resume_and_stop_the_live_timer() {
        let f = with_task();
        // Nothing live: nothing to do
        handle_menu_event(&f.state, "app.timer.pause_resume");
        assert_eq!(live_is_paused(&f), None);

        start_writing(&f);
        handle_menu_event(&f.state, "app.timer.pause_resume");
        assert_eq!(live_is_paused(&f), Some(true));
        handle_menu_event(&f.state, "app.timer.pause_resume");
        assert_eq!(live_is_paused(&f), Some(false));
        handle_menu_event(&f.state, "app.timer.stop");
        assert_eq!(live_is_paused(&f), None);
    }

    #[test]
    fn resuming_a_timer_idle_detection_paused_asks_in_the_window_first() {
        let f = with_task();
        start_writing(&f);
        handle_menu_event(&f.state, "app.timer.pause_resume");
        let instance_id = tray::snapshot(&f.state).live.unwrap().instance_id;
        f.state.with_idle_mut(|idle| {
            idle.pause = Some(IdlePause {
                instance_id,
                task_name: "Writing".into(),
                idle_since: crate::testing::start(),
                returned_at: Some(crate::testing::start()),
            })
        });
        let shown = f.platform.recorded().windows_shown;
        handle_menu_event(&f.state, "app.timer.pause_resume");
        assert_eq!(live_is_paused(&f), Some(true));
        assert_eq!(f.platform.recorded().windows_shown, shown + 1);
    }

    #[test]
    fn the_trays_items_are_still_the_trays() {
        let f = fixture();
        handle_menu_event(&f.state, "show_app");
        assert_eq!(f.platform.recorded().windows_shown, 1);
    }
}
