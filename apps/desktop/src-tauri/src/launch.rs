//! What a launcher shortcut or a home-screen widget's button asks for, on a
//! phone (contract::launch). Android opens the app with it, MainActivity
//! keeps it for the page, and the page sends it here (launch_action): it
//! runs the tray's timer actions, or opens a page or dialog as a tapped
//! notification does.

use crate::notifications;
use crate::state::AppState;
use crate::tray::{self, model::TrayAction};
use taskmint_core::contract::launch::{
    ADD_TIME, HOME, PAUSE, PAYOUTS, RESUME, START_TASK, START_WORK,
};
use taskmint_core::shell::{MenuCommand, MenuView};

fn page(view: MenuView) -> MenuCommand {
    MenuCommand::ShowView { view }
}

pub fn run(state: &AppState, action: &str) {
    state.platform.show_main_window();
    match action {
        START_WORK => notifications::open(state, MenuCommand::StartWork),
        ADD_TIME => notifications::open(state, MenuCommand::AddTime),
        HOME => notifications::open(state, page(MenuView::Home)),
        PAYOUTS => notifications::open(state, page(MenuView::Payouts)),
        PAUSE => tray::run(state, TrayAction::PauseTimer),
        RESUME => tray::run(state, TrayAction::ResumeTimer),
        _ => match action.strip_prefix(START_TASK) {
            // Home then shows it running
            Some(task_id) => {
                tray::run(state, TrayAction::StartTask(task_id.to_string()));
                notifications::open(state, page(MenuView::Home));
            }
            None => log::warn!("Unknown launch action '{}'", action),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{fixture, Fixture};
    use serde_json::json;
    use taskmint_core::sessions::start::live_timer;

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

    fn live_is_paused(f: &Fixture) -> Option<bool> {
        let now = (f.state.clock)();
        f.state
            .backend
            .read(|w| live_timer(&w.sessions, now))
            .map(|live| live.is_paused)
    }

    #[test]
    fn shortcuts_open_their_dialog_or_page() {
        let f = fixture();
        let cases = [
            (START_WORK, MenuCommand::StartWork),
            (ADD_TIME, MenuCommand::AddTime),
            (HOME, page(MenuView::Home)),
            (PAYOUTS, page(MenuView::Payouts)),
        ];
        for (action, command) in cases {
            run(&f.state, action);
            assert_eq!(notifications::take_opened(&f.state), Some(command));
        }
        assert_eq!(f.platform.recorded().windows_shown, 4);
    }

    #[test]
    fn a_task_shortcut_starts_it_and_a_widget_pauses_and_resumes_it() {
        let f = with_task();
        run(&f.state, "start-task:t1");
        assert_eq!(live_is_paused(&f), Some(false));
        assert_eq!(
            notifications::take_opened(&f.state),
            Some(page(MenuView::Home))
        );

        run(&f.state, PAUSE);
        assert_eq!(live_is_paused(&f), Some(true));
        run(&f.state, RESUME);
        assert_eq!(live_is_paused(&f), Some(false));
    }

    #[test]
    fn an_unknown_action_only_brings_the_app_forward() {
        let f = fixture();
        run(&f.state, "launch-rockets");
        assert_eq!(f.platform.recorded().windows_shown, 1);
        assert_eq!(notifications::take_opened(&f.state), None);
    }
}
