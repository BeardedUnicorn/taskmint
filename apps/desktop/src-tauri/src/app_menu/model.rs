//! The menu bar as plain data: macOS's (in the system menu bar, with its
//! own menus: Services, Edit, Window) and Windows' (across the top of the
//! window). The platform draws it once (platform/os.rs); after that only
//! the Timer menu's two items change. Nothing here touches Tauri.
//!
//! Shortcuts: the app handles every one itself (useKeyboardShortcuts) and
//! takes the key, so a macOS item's real shortcut fires only when the page
//! doesn't (a dialog is open, or the window isn't focused). On Windows the
//! menu bar's shortcuts would never see a key the page has, so its items
//! only show theirs in the label.

use crate::config::APP_MENU_MAX_TASK_NAME;
use crate::utils::menu_text;
use taskmint_core::sessions::start::LiveTimer;
use taskmint_core::shell::{AppFolder, AppLink, MenuCommand, MenuView};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuOs {
    MacOs,
    Windows,
}

/// The system's own items.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Predefined {
    Services,
    Hide,
    HideOthers,
    ShowAll,
    Quit,
    CloseWindow,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Fullscreen,
    Minimize,
    /// macOS's Zoom (the window's maximize).
    Zoom,
    BringAllToFront,
}

/// A menu macOS fills in itself: the window list, or Help's search field.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubmenuRole {
    Window,
    Help,
}

/// An item the app answers. Its id never changes; its label and whether
/// it's enabled can (the Timer menu's).
#[derive(Debug, Clone, PartialEq)]
pub struct Action {
    pub id: &'static str,
    pub label: String,
    /// In Tauri's spelling ("CmdOrCtrl+Shift+N"); macOS only.
    pub accelerator: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AppMenuItem {
    Action(Action),
    /// `label`: in place of the system's own words.
    Predefined {
        kind: Predefined,
        label: Option<&'static str>,
    },
    Separator,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Submenu {
    pub label: &'static str,
    pub role: Option<SubmenuRole>,
    pub items: Vec<AppMenuItem>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AppMenu {
    pub os: MenuOs,
    pub submenus: Vec<Submenu>,
}

/// What an item asks for.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AppMenuAction {
    /// The app's to do: a page or a dialog.
    Command(MenuCommand),
    Link(AppLink),
    Folder(AppFolder),
    /// Pauses the live timer, or resumes it when it's paused.
    PauseResume,
    StopTimer,
}

const PAUSE_RESUME: &str = "app.timer.pause_resume";
const STOP: &str = "app.timer.stop";

/// Every item the app answers, by id. Ids start with "app.", so none can be
/// taken for one of the tray's.
const ACTIONS: [(&str, AppMenuAction); 24] = [
    ("app.about", AppMenuAction::Command(MenuCommand::About)),
    (
        "app.check_updates",
        AppMenuAction::Command(MenuCommand::CheckForUpdates),
    ),
    (
        "app.settings",
        AppMenuAction::Command(MenuCommand::Settings),
    ),
    (
        "app.cloud_sync",
        AppMenuAction::Command(MenuCommand::CloudSync),
    ),
    ("app.new_task", AppMenuAction::Command(MenuCommand::NewTask)),
    (
        "app.start_work",
        AppMenuAction::Command(MenuCommand::StartWork),
    ),
    ("app.add_time", AppMenuAction::Command(MenuCommand::AddTime)),
    (
        "app.import_work_logs",
        AppMenuAction::Command(MenuCommand::ImportWorkLogs),
    ),
    ("app.view.home", view(MenuView::Home)),
    ("app.view.sessions", view(MenuView::Sessions)),
    ("app.view.tasks", view(MenuView::Tasks)),
    ("app.view.notes", view(MenuView::Notes)),
    ("app.view.history", view(MenuView::History)),
    ("app.view.calendar", view(MenuView::Calendar)),
    ("app.view.payouts", view(MenuView::Payouts)),
    (
        "app.command_palette",
        AppMenuAction::Command(MenuCommand::CommandPalette),
    ),
    (
        "app.whats_new",
        AppMenuAction::Command(MenuCommand::WhatsNew),
    ),
    (
        "app.keyboard_shortcuts",
        AppMenuAction::Command(MenuCommand::KeyboardShortcuts),
    ),
    ("app.help", AppMenuAction::Link(AppLink::Help)),
    ("app.report_problem", AppMenuAction::Link(AppLink::Issues)),
    ("app.data_folder", AppMenuAction::Folder(AppFolder::Data)),
    ("app.logs_folder", AppMenuAction::Folder(AppFolder::Logs)),
    (PAUSE_RESUME, AppMenuAction::PauseResume),
    (STOP, AppMenuAction::StopTimer),
];

const fn view(view: MenuView) -> AppMenuAction {
    AppMenuAction::Command(MenuCommand::ShowView { view })
}

impl AppMenuAction {
    pub fn from_id(id: &str) -> Option<AppMenuAction> {
        ACTIONS
            .iter()
            .find(|(action_id, _)| *action_id == id)
            .map(|(_, action)| *action)
    }
}

/// A shortcut: ⌘ or Ctrl, Shift if asked, and the key.
#[derive(Clone, Copy)]
struct Keys {
    shift: bool,
    key: &'static str,
}

const fn keys(key: &'static str) -> Option<Keys> {
    Some(Keys { shift: false, key })
}

const fn shift_keys(key: &'static str) -> Option<Keys> {
    Some(Keys { shift: true, key })
}

/// A task's name as a Timer item shows it: as it is (see menu_text), with
/// a tab (which would start the shortcut column) made a space, and a long
/// name cut short.
pub fn literal(name: &str) -> String {
    let flat = name.replace('\t', " ");
    let short = match flat.char_indices().nth(APP_MENU_MAX_TASK_NAME) {
        Some((at, _)) => format!("{}…", flat[..at].trim_end()),
        None => flat,
    };
    menu_text(&short)
}

/// Builds one OS's items: the same words, its own way of showing shortcuts.
struct Items {
    os: MenuOs,
}

impl Items {
    fn action(
        &self,
        id: &'static str,
        label: &str,
        keys: Option<Keys>,
        enabled: bool,
    ) -> AppMenuItem {
        let shortcut = |modifier: &str| {
            keys.map(|keys| {
                let shift = if keys.shift { "Shift+" } else { "" };
                format!("{}+{}{}", modifier, shift, keys.key)
            })
        };
        let (label, accelerator) = match self.os {
            MenuOs::MacOs => (label.to_string(), shortcut("CmdOrCtrl")),
            MenuOs::Windows => match shortcut("Ctrl") {
                Some(hint) => (format!("{}\t{}", label, hint), None),
                None => (label.to_string(), None),
            },
        };
        AppMenuItem::Action(Action {
            id,
            label,
            accelerator,
            enabled,
        })
    }

    fn command(&self, id: &'static str, label: &str, keys: Option<Keys>) -> AppMenuItem {
        self.action(id, label, keys, true)
    }

    fn pages(&self) -> Vec<AppMenuItem> {
        [
            ("app.view.home", "Home", "1"),
            ("app.view.sessions", "Sessions", "2"),
            ("app.view.tasks", "Tasks", "3"),
            ("app.view.notes", "Notes", "4"),
            ("app.view.history", "History", "5"),
            ("app.view.calendar", "Calendar", "6"),
            ("app.view.payouts", "Payouts", "7"),
        ]
        .into_iter()
        .map(|(id, label, key)| self.command(id, label, keys(key)))
        .collect()
    }

    /// Pause or Resume, and Stop, for the live timer (the menu's only
    /// changing items).
    fn timer(&self, live: Option<&LiveTimer>) -> Vec<AppMenuItem> {
        let (pause_resume, stop) = match live {
            Some(live) => {
                let name = literal(&live.task_name);
                let verb = if live.is_paused { "Resume" } else { "Pause" };
                (format!("{} “{}”", verb, name), format!("Stop “{}”", name))
            }
            None => ("Pause Timer".to_string(), "Stop Timer".to_string()),
        };
        vec![
            self.action(PAUSE_RESUME, &pause_resume, shift_keys("P"), live.is_some()),
            self.action(STOP, &stop, None, live.is_some()),
        ]
    }

    fn help(&self) -> Vec<AppMenuItem> {
        vec![
            self.command("app.help", "TaskMint Help", None),
            self.command("app.whats_new", "What's New in TaskMint", None),
            self.command("app.keyboard_shortcuts", "Keyboard Shortcuts", None),
            AppMenuItem::Separator,
            self.command("app.report_problem", "Report a Problem…", None),
            AppMenuItem::Separator,
            self.command("app.data_folder", "Show Data Folder", None),
            self.command("app.logs_folder", "Show Logs Folder", None),
        ]
    }
}

fn system(kind: Predefined) -> AppMenuItem {
    AppMenuItem::Predefined { kind, label: None }
}

fn labelled(kind: Predefined, label: &'static str) -> AppMenuItem {
    AppMenuItem::Predefined {
        kind,
        label: Some(label),
    }
}

fn submenu(label: &'static str, items: Vec<AppMenuItem>) -> Submenu {
    Submenu {
        label,
        role: None,
        items,
    }
}

impl AppMenu {
    /// The menu bar for `os`, with the Timer menu for `live`.
    pub fn build(os: MenuOs, live: Option<&LiveTimer>) -> AppMenu {
        let items = Items { os };
        let sep = || AppMenuItem::Separator;
        let submenus = match os {
            MenuOs::MacOs => vec![
                submenu(
                    "TaskMint",
                    vec![
                        items.command("app.about", "About TaskMint", None),
                        items.command("app.check_updates", "Check for Updates…", None),
                        sep(),
                        items.command("app.settings", "Settings…", keys(",")),
                        items.command("app.cloud_sync", "Cloud Sync…", None),
                        sep(),
                        system(Predefined::Services),
                        sep(),
                        labelled(Predefined::Hide, "Hide TaskMint"),
                        system(Predefined::HideOthers),
                        system(Predefined::ShowAll),
                        sep(),
                        labelled(Predefined::Quit, "Quit TaskMint"),
                    ],
                ),
                submenu(
                    "File",
                    vec![
                        items.command("app.new_task", "New Task", keys("N")),
                        items.command("app.start_work", "Start Work…", shift_keys("N")),
                        items.command("app.add_time", "Add Time…", None),
                        items.command("app.import_work_logs", "Import Work Logs…", None),
                        sep(),
                        system(Predefined::CloseWindow),
                    ],
                ),
                submenu(
                    "Edit",
                    vec![
                        system(Predefined::Undo),
                        system(Predefined::Redo),
                        sep(),
                        system(Predefined::Cut),
                        system(Predefined::Copy),
                        system(Predefined::Paste),
                        system(Predefined::SelectAll),
                    ],
                ),
                submenu(
                    "View",
                    [
                        items.pages(),
                        vec![
                            sep(),
                            items.command("app.command_palette", "Command Palette…", keys("K")),
                            sep(),
                            labelled(Predefined::Fullscreen, "Enter Full Screen"),
                        ],
                    ]
                    .concat(),
                ),
                submenu("Timer", items.timer(live)),
                Submenu {
                    label: "Window",
                    role: Some(SubmenuRole::Window),
                    items: vec![
                        system(Predefined::Minimize),
                        system(Predefined::Zoom),
                        sep(),
                        system(Predefined::BringAllToFront),
                    ],
                },
                Submenu {
                    label: "Help",
                    role: Some(SubmenuRole::Help),
                    items: items.help(),
                },
            ],
            MenuOs::Windows => vec![
                submenu(
                    "&File",
                    vec![
                        items.command("app.new_task", "New Task", keys("N")),
                        items.command("app.start_work", "Start Work…", shift_keys("N")),
                        items.command("app.add_time", "Add Time…", None),
                        items.command("app.import_work_logs", "Import Work Logs…", None),
                        sep(),
                        items.command("app.settings", "Settings", keys(",")),
                        items.command("app.cloud_sync", "Cloud Sync…", None),
                        sep(),
                        labelled(Predefined::Quit, "E&xit"),
                    ],
                ),
                submenu(
                    "&View",
                    [
                        items.pages(),
                        vec![
                            sep(),
                            items.command("app.command_palette", "Command Palette…", keys("K")),
                        ],
                    ]
                    .concat(),
                ),
                submenu("&Timer", items.timer(live)),
                submenu(
                    "&Help",
                    [
                        items.help(),
                        vec![
                            sep(),
                            items.command("app.check_updates", "Check for Updates…", None),
                            items.command("app.about", "About TaskMint", None),
                        ],
                    ]
                    .concat(),
                ),
            ],
        };
        AppMenu { os, submenus }
    }

    /// Every item the app answers, in menu order.
    pub fn actions(&self) -> impl Iterator<Item = &Action> {
        self.submenus
            .iter()
            .flat_map(|submenu| &submenu.items)
            .filter_map(|item| match item {
                AppMenuItem::Action(action) => Some(action),
                _ => None,
            })
    }

    /// The items whose label or state differ from `shown`'s (the same menu
    /// for another moment: only the Timer items ever do).
    pub fn changed_actions(&self, shown: &AppMenu) -> Vec<Action> {
        self.actions()
            .zip(shown.actions())
            .filter(|(now, before)| now != before)
            .map(|(now, _)| now.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tray::model::TrayAction;
    use std::collections::BTreeSet;
    use std::str::FromStr;

    fn live(name: &str, is_paused: bool) -> LiveTimer {
        LiveTimer {
            instance_id: "i".into(),
            task_id: "t".into(),
            task_name: name.into(),
            is_paused,
            elapsed_ms: 0,
        }
    }

    /// A menu as lines: "Submenu: item | item…", shortcuts in brackets.
    fn describe(menu: &AppMenu) -> Vec<String> {
        menu.submenus
            .iter()
            .map(|submenu| {
                let items: Vec<String> = submenu
                    .items
                    .iter()
                    .map(|item| match item {
                        AppMenuItem::Action(action) => {
                            let keys = action
                                .accelerator
                                .as_ref()
                                .map(|keys| format!(" [{}]", keys))
                                .unwrap_or_default();
                            let off = if action.enabled { "" } else { " (off)" };
                            format!("{}{}{}", action.label, keys, off)
                        }
                        AppMenuItem::Predefined {
                            kind,
                            label: Some(label),
                        } => format!("<{:?}: {}>", kind, label),
                        AppMenuItem::Predefined { kind, label: None } => format!("<{:?}>", kind),
                        AppMenuItem::Separator => "—".to_string(),
                    })
                    .collect();
                format!("{}: {}", submenu.label, items.join(" | "))
            })
            .collect()
    }

    #[test]
    fn macos_has_the_app_file_edit_view_timer_window_and_help_menus() {
        assert_eq!(
            describe(&AppMenu::build(MenuOs::MacOs, None)),
            [
                "TaskMint: About TaskMint | Check for Updates… | — | Settings… [CmdOrCtrl+,] | Cloud Sync… | — \
                 | <Services> | — | <Hide: Hide TaskMint> | <HideOthers> | <ShowAll> | — | <Quit: Quit TaskMint>",
                "File: New Task [CmdOrCtrl+N] | Start Work… [CmdOrCtrl+Shift+N] | Add Time… | Import Work Logs… \
                 | — | <CloseWindow>",
                "Edit: <Undo> | <Redo> | — | <Cut> | <Copy> | <Paste> | <SelectAll>",
                "View: Home [CmdOrCtrl+1] | Sessions [CmdOrCtrl+2] | Tasks [CmdOrCtrl+3] | Notes [CmdOrCtrl+4] \
                 | History [CmdOrCtrl+5] | Calendar [CmdOrCtrl+6] | Payouts [CmdOrCtrl+7] | — \
                 | Command Palette… [CmdOrCtrl+K] | — | <Fullscreen: Enter Full Screen>",
                "Timer: Pause Timer [CmdOrCtrl+Shift+P] (off) | Stop Timer (off)",
                "Window: <Minimize> | <Zoom> | — | <BringAllToFront>",
                "Help: TaskMint Help | What's New in TaskMint | Keyboard Shortcuts | — | Report a Problem… | — \
                 | Show Data Folder | Show Logs Folder",
            ]
        );
        let roles: Vec<_> = AppMenu::build(MenuOs::MacOs, None)
            .submenus
            .iter()
            .map(|submenu| submenu.role)
            .collect();
        assert_eq!(
            roles,
            [
                None,
                None,
                None,
                None,
                None,
                Some(SubmenuRole::Window),
                Some(SubmenuRole::Help)
            ]
        );
    }

    #[test]
    fn windows_shows_its_shortcuts_without_taking_them_and_has_only_its_own_items() {
        let menu = AppMenu::build(MenuOs::Windows, None);
        assert_eq!(
            describe(&menu),
            [
                "&File: New Task\tCtrl+N | Start Work…\tCtrl+Shift+N | Add Time… | Import Work Logs… | — \
                 | Settings\tCtrl+, | Cloud Sync… | — | <Quit: E&xit>",
                "&View: Home\tCtrl+1 | Sessions\tCtrl+2 | Tasks\tCtrl+3 | Notes\tCtrl+4 | History\tCtrl+5 \
                 | Calendar\tCtrl+6 | Payouts\tCtrl+7 | — | Command Palette…\tCtrl+K",
                "&Timer: Pause Timer\tCtrl+Shift+P (off) | Stop Timer (off)",
                "&Help: TaskMint Help | What's New in TaskMint | Keyboard Shortcuts | — | Report a Problem… | — \
                 | Show Data Folder | Show Logs Folder | — | Check for Updates… | About TaskMint",
            ]
        );
        assert!(menu.submenus.iter().all(|submenu| submenu.role.is_none()));
    }

    #[test]
    fn the_timer_items_follow_the_live_timer() {
        for os in [MenuOs::MacOs, MenuOs::Windows] {
            let timer = |live: Option<&LiveTimer>| {
                let menu = AppMenu::build(os, live);
                let timer = menu
                    .submenus
                    .iter()
                    .find(|submenu| submenu.label.ends_with("Timer"))
                    .unwrap();
                describe(&AppMenu {
                    os,
                    submenus: vec![timer.clone()],
                })[0]
                    .clone()
            };
            let hint = |text: &str| match os {
                MenuOs::MacOs => format!("{} [CmdOrCtrl+Shift+P]", text),
                MenuOs::Windows => format!("{}\tCtrl+Shift+P", text),
            };
            assert!(timer(Some(&live("Writing", false)))
                .ends_with(&format!("{} | Stop “Writing”", hint("Pause “Writing”"))));
            assert!(timer(Some(&live("Writing", true)))
                .ends_with(&format!("{} | Stop “Writing”", hint("Resume “Writing”"))));
        }
    }

    #[test]
    fn only_the_timer_items_change_and_the_rest_stays_put() {
        let idle = AppMenu::build(MenuOs::MacOs, None);
        let running = AppMenu::build(MenuOs::MacOs, Some(&live("R&D", false)));
        assert!(idle.changed_actions(&idle).is_empty());
        let changed = running.changed_actions(&idle);
        assert_eq!(
            changed,
            [
                Action {
                    id: PAUSE_RESUME,
                    label: "Pause “R&&D”".into(),
                    accelerator: Some("CmdOrCtrl+Shift+P".into()),
                    enabled: true,
                },
                Action {
                    id: STOP,
                    label: "Stop “R&&D”".into(),
                    accelerator: None,
                    enabled: true,
                },
            ]
        );
        // The same items in the same places, whatever the timer does
        let ids = |menu: &AppMenu| menu.actions().map(|action| action.id).collect::<Vec<_>>();
        assert_eq!(ids(&idle), ids(&running));
    }

    #[test]
    fn task_names_show_as_they_are_and_long_ones_are_cut_short() {
        assert_eq!(literal("R&D"), "R&&D");
        assert_eq!(literal("Tab\there"), "Tab here");
        let long = "A".repeat(APP_MENU_MAX_TASK_NAME + 5);
        assert_eq!(
            literal(&long),
            format!("{}…", "A".repeat(APP_MENU_MAX_TASK_NAME))
        );
        assert_eq!(
            literal(&"é".repeat(APP_MENU_MAX_TASK_NAME)),
            "é".repeat(APP_MENU_MAX_TASK_NAME)
        );
    }

    #[test]
    fn every_item_is_answered_and_never_mistaken_for_the_trays() {
        for os in [MenuOs::MacOs, MenuOs::Windows] {
            let menu = AppMenu::build(os, None);
            let ids: Vec<_> = menu.actions().map(|action| action.id).collect();
            assert_eq!(
                ids.len(),
                ids.iter().collect::<BTreeSet<_>>().len(),
                "unique ids"
            );
            for id in ids {
                assert!(id.starts_with("app."), "{}", id);
                assert!(AppMenuAction::from_id(id).is_some(), "{}", id);
                assert_eq!(TrayAction::from_id(id), None, "{}", id);
            }
        }
        for tray in ["stop_timer", "start_task_t1", "show_app", "app.nope"] {
            assert_eq!(AppMenuAction::from_id(tray), None, "{}", tray);
        }
        assert_eq!(AppMenuAction::from_id(STOP), Some(AppMenuAction::StopTimer));
        assert_eq!(
            AppMenuAction::from_id("app.view.calendar"),
            Some(AppMenuAction::Command(MenuCommand::ShowView {
                view: MenuView::Calendar
            }))
        );
    }

    #[test]
    fn every_macos_shortcut_is_one_the_menu_takes() {
        // Tauri drops a shortcut it can't read without saying so
        for action in AppMenu::build(MenuOs::MacOs, None).actions() {
            if let Some(keys) = &action.accelerator {
                assert!(
                    muda::accelerator::Accelerator::from_str(keys).is_ok(),
                    "{}",
                    keys
                );
            }
        }
    }

    #[test]
    fn windows_has_no_shortcut_of_its_own_and_only_exit_from_the_system() {
        let menu = AppMenu::build(MenuOs::Windows, None);
        assert!(menu.actions().all(|action| action.accelerator.is_none()));
        let system: Vec<_> = menu
            .submenus
            .iter()
            .flat_map(|submenu| &submenu.items)
            .filter_map(|item| match item {
                AppMenuItem::Predefined { kind, .. } => Some(*kind),
                _ => None,
            })
            .collect();
        assert_eq!(system, [Predefined::Quit]);
    }
}
