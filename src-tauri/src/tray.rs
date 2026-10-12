// System tray functionality

use crate::commands::sessions::{self, LiveTimer};
use crate::config::{get_config, Config};
use crate::error::AppError;
use crate::state::AppState;
use crate::types::{Task, TaskSession};
use crate::utils::{format_duration_hm, is_macos};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// When each task last had a timer start, from the sessions (keyed by task id).
pub(crate) fn last_used_by_task(sessions: &[TaskSession]) -> HashMap<String, DateTime<Utc>> {
    let mut last_used: HashMap<String, DateTime<Utc>> = HashMap::new();
    for session in sessions {
        for instance in &session.timer_instances {
            last_used
                .entry(session.task_id.clone())
                .and_modify(|latest| {
                    if instance.start_time > *latest {
                        *latest = instance.start_time;
                    }
                })
                .or_insert(instance.start_time);
        }
    }
    last_used
}

/// Tasks for the tray's quick-start submenu, in the same order as the app's
/// start pickers (orderTasksForStart in src/utils/taskOrdering.ts): favorites
/// first, then most recently used, then never-used tasks by name. Archived
/// tasks are hidden, and truncation happens after ordering so they never
/// consume visible slots.
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

/// What the tray last rendered for the live timer. A change in any of these
/// fields needs a menu rebuild; elapsed time alone only needs the tooltip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayLiveKey {
    pub instance_id: String,
    pub task_name: String,
    pub is_paused: bool,
}

impl From<&LiveTimer> for TrayLiveKey {
    fn from(live: &LiveTimer) -> Self {
        Self {
            instance_id: live.instance_id.clone(),
            task_name: live.task_name.clone(),
            is_paused: live.is_paused,
        }
    }
}

/// The live timer, read straight from the Rust-owned sessions.
fn current_live_timer(state: &AppState) -> Option<LiveTimer> {
    state
        .with_task_sessions(|sessions| sessions::live_timer(sessions, Utc::now()))
        .ok()
        .flatten()
}

pub fn create_tray_menu(
    app: &AppHandle,
    state: &AppState,
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let config = get_config();
    log::debug!("Creating tray menu...");
    let menu = Menu::new(app)?;

    // Timer status section
    match current_live_timer(state) {
        Some(live) => {
            let elapsed_text = format_duration_hm(live.elapsed_ms);
            let status_text = if live.is_paused {
                format!("⏸️ Paused: {} ({})", live.task_name, elapsed_text)
            } else {
                format!("⏱️ Running: {} ({})", live.task_name, elapsed_text)
            };
            let status_item = MenuItem::new(app, status_text, false, None::<&str>)?;
            menu.append(&status_item)?;

            if live.is_paused {
                let resume_item =
                    MenuItem::with_id(app, "resume_timer", "▶️ Resume Timer", true, None::<&str>)?;
                menu.append(&resume_item)?;
            } else {
                let pause_item =
                    MenuItem::with_id(app, "pause_timer", "⏸️ Pause Timer", true, None::<&str>)?;
                menu.append(&pause_item)?;
            }
            let stop_item =
                MenuItem::with_id(app, "stop_timer", "⏹️ Stop Timer", true, None::<&str>)?;
            menu.append(&stop_item)?;
        }
        None => {
            let status_item = MenuItem::new(app, "No active timer", false, None::<&str>)?;
            menu.append(&status_item)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Quick start tasks section (archived tasks are not listed). Recency comes
    // from the sessions; read it before taking the tasks lock (never nested).
    let last_used = state
        .with_task_sessions(|sessions| last_used_by_task(sessions))
        .unwrap_or_default();
    let has_tasks = state
        .with_tasks(|tasks| {
            !visible_tasks(tasks, &last_used, config.tray_max_recent_tasks).is_empty()
        })
        .unwrap_or(false);

    if has_tasks {
        let start_submenu = Submenu::new(app, "▶️ Start Timer", true)?;
        log::debug!("Created start timer submenu");

        // Add recent/favorite tasks (limit to configured max)
        state
            .with_tasks(|tasks| {
                for task in visible_tasks(tasks, &last_used, config.tray_max_recent_tasks) {
                    let menu_id = format!("start_task_{}", task.id);
                    let label = if task.is_favorite {
                        format!("★ {}", task.name)
                    } else {
                        task.name.clone()
                    };
                    let task_item = MenuItem::with_id(app, &menu_id, &label, true, None::<&str>)?;
                    start_submenu.append(&task_item)?;
                    log::debug!("Added task item: '{}' with ID: '{}'", task.name, menu_id);
                }
                Ok::<_, tauri::Error>(())
            })
            .unwrap_or(Ok(()))?;

        // Every task, not just the ones listed above, in the app's start dialog
        start_submenu.append(&PredefinedMenuItem::separator(app)?)?;
        let choose_item =
            MenuItem::with_id(app, "choose_task", "Choose Task…", true, None::<&str>)?;
        start_submenu.append(&choose_item)?;

        menu.append(&start_submenu)?;
        log::debug!("Added start timer submenu to main menu");
    } else {
        // Work starts from existing tasks only; the app opens on Tasks.
        let add_item = MenuItem::with_id(app, "add_task", "➕ Add a Task…", true, None::<&str>)?;
        menu.append(&add_item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // App controls
    let show_item = MenuItem::with_id(app, "show_app", "📊 Show App", true, None::<&str>)?;
    menu.append(&show_item)?;
    log::debug!("Added show app item with ID: 'show_app'");

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&PredefinedMenuItem::quit(app, Some("Quit"))?)?;
    log::debug!("Added quit item");

    log::debug!("Tray menu creation completed successfully");
    Ok(menu)
}

fn handle_tray_click_event(event: TrayIconEvent, app: &AppHandle) {
    match event {
        TrayIconEvent::Click {
            button,
            button_state,
            position: _,
            rect: _,
            id: _,
        } => {
            log::debug!(
                "Tray click event - button: {:?}, state: {:?}",
                button,
                button_state
            );
            // The context menu should appear automatically on left-click due to the menu configuration
        }
        TrayIconEvent::DoubleClick {
            button: _,
            position: _,
            rect: _,
            id: _,
        } => {
            log::debug!("Tray double-click event - showing app window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}

pub fn handle_menu_event(id: &str, app: &AppHandle, state: &AppState) {
    log::debug!("Tray menu item clicked: '{}'", id);

    match id {
        "stop_timer" => {
            if let Err(e) = sessions::tray_stop_timer(app, state) {
                log::error!("Failed to stop timer from tray: {}", e);
            }
            sync_tray(app, state);
        }
        "pause_timer" => {
            if let Err(e) = sessions::tray_pause_timer(app, state) {
                log::error!("Failed to pause timer from tray: {}", e);
            }
            sync_tray(app, state);
        }
        "resume_timer" => {
            // Starting the paused timer's own task resumes it.
            if let Some(live) = current_live_timer(state).filter(|l| l.is_paused) {
                if let Err(e) = sessions::start_task_now(app, state, &live.task_id, &live.task_name)
                {
                    log::error!("Failed to resume timer from tray: {}", e);
                }
            }
            sync_tray(app, state);
        }
        // The app picks: its start dialog, or the Tasks page when there are
        // no tasks to start yet.
        "choose_task" | "add_task" => {
            if let Err(e) = app.emit("show-start-task-dialog", ()) {
                log::error!("Failed to emit show-start-task-dialog event: {}", e);
            }
            show_main_window(app);
        }
        "show_app" => {
            show_main_window(app);
        }
        id if id.starts_with("start_task_") => {
            let task_id = &id["start_task_".len()..];
            let task_name = state
                .with_tasks(|tasks| {
                    tasks
                        .iter()
                        .find(|t| t.id == task_id)
                        .map(|task| task.name.clone())
                })
                .unwrap_or(None);

            match task_name {
                Some(task_name) => {
                    if let Err(e) = sessions::start_task_now(app, state, task_id, &task_name) {
                        log::error!("Failed to start timer from tray: {}", e);
                    }
                    sync_tray(app, state);
                }
                None => log::error!("Tray start: task not found for id '{}'", task_id),
            }
        }
        _ => {
            log::debug!("Unhandled menu item: '{}'", id);
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            log::error!("Failed to show window: {}", e);
        } else {
            log::debug!("Window shown successfully");
        }
        if let Err(e) = window.set_focus() {
            log::error!("Failed to focus window: {}", e);
        } else {
            log::debug!("Window focused successfully");
        }
    } else {
        log::error!("Main window not found");
    }
}

pub fn update_tray_menu(app: &AppHandle, state: &AppState) -> Result<(), tauri::Error> {
    let rendered = current_live_timer(state).as_ref().map(TrayLiveKey::from);
    state
        .with_tray_icon(|tray_option| {
            if let Some(ref tray) = tray_option {
                let new_menu = create_tray_menu(app, state)?;
                tray.set_menu(Some(new_menu))?;
            }
            Ok::<(), tauri::Error>(())
        })
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e)))??;
    let _ = state.with_tray_rendered_mut(|slot| *slot = rendered);
    Ok(())
}

/// Bring the tray in line with the sessions: rebuild the menu only when the
/// live timer changed (a rebuild closes an open menu, so no-op rebuilds must
/// not happen), and refresh the tooltip/title. Called after tray actions and
/// by the update thread, so changes made in the app show within a tick.
pub fn sync_tray(app: &AppHandle, state: &AppState) {
    let live = current_live_timer(state).as_ref().map(TrayLiveKey::from);
    let changed = state
        .with_tray_rendered(|rendered| *rendered != live)
        .unwrap_or(true);
    if changed {
        if let Err(e) = update_tray_menu(app, state) {
            log::error!("Failed to update tray menu: {:?}", e);
        }
    }
    if let Err(e) = update_tray_tooltip_only(state) {
        log::error!("Failed to update tray tooltip: {:?}", e);
    }
}

pub fn setup_system_tray(app: &AppHandle, state: &AppState) -> Result<(), tauri::Error> {
    let config = get_config();
    log::debug!("Starting system tray setup...");

    // Check if tray icon already exists to prevent duplicates
    let already_exists = state
        .with_tray_icon(|tray_option| tray_option.is_some())
        .unwrap_or(false);

    if already_exists {
        log::debug!("System tray already initialized, skipping setup to prevent duplicates");
        return Ok(());
    }

    // Clean up any existing tray icon
    let _ = state.with_tray_icon_mut(|tray_option| {
        if let Some(existing_tray) = tray_option.take() {
            log::debug!("Cleaning up existing tray icon to prevent duplicates...");
            drop(existing_tray);
            log::debug!("Existing tray icon cleaned up");
        }
    });

    // Load the tray icon with fallback
    let icon = load_tray_icon()?;
    let menu = create_tray_menu(app, state)?;

    // Build the tray icon
    log::debug!("Building new tray icon...");
    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip(&config.tray_tooltip_app_name)
        .on_tray_icon_event({
            let app_handle = app.clone();
            move |_tray, event| {
                log::trace!("Tray icon event received: {:?}", event);
                handle_tray_click_event(event, &app_handle);
            }
        })
        .build(app)
        .map_err(|e| {
            log::error!("Failed to build tray icon: {:?}", e);
            e
        })?;

    log::info!("Successfully built new tray icon");

    // Store the new tray icon in shared state
    state
        .with_tray_icon_mut(|tray_option| {
            *tray_option = Some(tray);
        })
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e)))?;

    log::info!("System tray setup completed successfully");
    Ok(())
}

fn load_tray_icon() -> Result<Image<'static>, tauri::Error> {
    let config = get_config();

    // Try primary icon first
    let primary_icon_bytes = include_bytes!("../icons/32x32.png");
    log::debug!(
        "Loaded primary icon bytes, size: {} bytes",
        primary_icon_bytes.len()
    );

    match Image::from_bytes(primary_icon_bytes) {
        Ok(icon) => {
            log::debug!(
                "Successfully created icon from primary {}",
                config.icon_tray_primary
            );
            Ok(icon)
        }
        Err(e) => {
            log::error!(
                "Failed to create icon from {}: {:?}",
                config.icon_tray_primary,
                e
            );
            log::debug!("Trying fallback icon...");

            // Try fallback icon
            let fallback_icon_bytes = include_bytes!("../icons/icon.png");
            log::debug!(
                "Loaded fallback icon bytes, size: {} bytes",
                fallback_icon_bytes.len()
            );

            Image::from_bytes(fallback_icon_bytes).map_err(|e2| {
                log::error!(
                    "Failed to create icon from fallback {}: {:?}",
                    config.icon_tray_fallback,
                    e2
                );
                log::error!("Both primary and fallback icons failed!");
                e2
            })
        }
    }
}

pub(crate) fn update_tray_tooltip_only(state: &AppState) -> Result<(), AppError> {
    let config = get_config();
    let live = current_live_timer(state);

    let (tooltip, title) = match &live {
        Some(live) => {
            let elapsed = format_duration_hm(live.elapsed_ms);
            if live.is_paused {
                (
                    format!(
                        "⏸️ {} - {} paused (Click for menu)",
                        live.task_name, elapsed
                    ),
                    format!("⏸ {}", elapsed),
                )
            } else {
                (
                    format!("⏱️ {} - {} (Click for menu)", live.task_name, elapsed),
                    elapsed,
                )
            }
        }
        None => (
            format!(
                "{} - No active timer (Click for menu)",
                config.tray_tooltip_app_name
            ),
            // tray-icon's macOS set_title(None) is a no-op (it only calls
            // setTitle for Some), so an empty string is what clears it.
            String::new(),
        ),
    };

    state.with_tray_icon(|tray_option| {
        let tray = tray_option
            .as_ref()
            .ok_or_else(|| AppError::new("Tray icon not available"))?;
        tray.set_tooltip(Some(&tooltip))
            .map_err(|e| AppError::new(format!("Failed to set tooltip: {}", e)))?;
        if is_macos() {
            tray.set_title(Some(&title))
                .map_err(|e| AppError::new(format!("Failed to set title: {}", e)))?;
        }
        Ok(())
    })?
}

pub fn start_tray_update_timer(app: &AppHandle, state: &AppState) {
    let app_clone = app.clone();
    let state_clone = state.clone();
    let config = Config::default();

    std::thread::spawn(move || {
        let mut last_menu_update = std::time::Instant::now();

        loop {
            std::thread::sleep(config.tray_status_update_duration());

            // Picks up starts/stops made anywhere (app UI, tray, imports) and
            // keeps the running clock in the tooltip/title current.
            let live = current_live_timer(&state_clone);
            let changed = state_clone
                .with_tray_rendered(|rendered| *rendered != live.as_ref().map(TrayLiveKey::from))
                .unwrap_or(false);
            let running = live.as_ref().is_some_and(|l| !l.is_paused);

            if changed || running {
                sync_tray(&app_clone, &state_clone);
            }

            // The menu's status line shows elapsed time too; refresh it
            // occasionally while running (sync_tray only rebuilds on change).
            if changed {
                last_menu_update = std::time::Instant::now();
            } else if running && last_menu_update.elapsed() >= config.tray_menu_refresh_duration() {
                if let Err(e) = update_tray_menu(&app_clone, &state_clone) {
                    log::error!("Failed to update tray menu: {:?}", e);
                }
                last_menu_update = std::time::Instant::now();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

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
        // Archived tasks at the front of the list must not consume slots
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
    fn visible_tasks_empty_when_all_archived() {
        let tasks = vec![task("a", true), task("b", true)];
        assert!(visible_tasks(&tasks, &HashMap::new(), 5).is_empty());
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
            let json = serde_json::json!({
                "id": id,
                "taskId": task_id,
                "taskName": task_id,
                "timerInstances": starts.iter().enumerate().map(|(n, s)| serde_json::json!({
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
            session("s1", "a", &[10, 50]),
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
    fn task_without_is_favorite_deserializes_as_not_favorite() {
        let json = serde_json::json!({
            "id": "t1",
            "name": "Task",
            "hourlyRate": null,
            "defaultNoteTemplateId": null,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        });
        let task: Task = serde_json::from_value(json).unwrap();
        assert!(!task.is_favorite);
        assert!(!task.is_archived);
    }
}
