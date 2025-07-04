// System tray functionality

use crate::config::{Config, get_config};
use crate::error::{AppError};
use crate::state::AppState;
use crate::timer;
use crate::utils::{format_duration_hm, get_current_elapsed_ms, is_macos};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

pub fn create_tray_menu(app: &AppHandle, state: &AppState) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let config = get_config();
    println!("🔧 Creating tray menu...");
    let menu = Menu::new(app)?;

    // Get current timer state and tasks
    let (is_running, current_task, elapsed_text) = state
        .with_timer_state(|timer_state| {
            let elapsed = if let Some(ref start_time) = timer_state.start_time {
                get_current_elapsed_ms(start_time)
            } else {
                timer_state.elapsed_ms
            };
            (
                timer_state.is_running,
                timer_state.task_name.clone(),
                format_duration_hm(elapsed),
            )
        })
        .unwrap_or((false, String::new(), String::new()));

    // Timer status section
    if is_running {
        let status_text = format!("⏱️ Running: {} ({})", current_task, elapsed_text);
        let status_item = MenuItem::new(app, status_text.clone(), false, None::<&str>)?;
        menu.append(&status_item)?;
        println!("✅ Added timer status item: '{}'", status_text);

        let stop_item = MenuItem::new(app, "⏹️ Stop Timer", true, Some("stop_timer"))?;
        menu.append(&stop_item)?;
        println!("✅ Added stop timer item with ID: 'stop_timer'");
    } else {
        let status_item = MenuItem::new(app, "⏸️ No active timer", false, None::<&str>)?;
        menu.append(&status_item)?;
        println!("✅ Added no active timer status item");
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Quick start tasks section
    let has_tasks = state.with_tasks(|tasks| !tasks.is_empty()).unwrap_or(false);

    if has_tasks {
        let start_submenu = Submenu::new(app, "▶️ Start Timer", true)?;
        println!("✅ Created start timer submenu");

        // Add recent/favorite tasks (limit to configured max)
        state
            .with_tasks(|tasks| {
                for task in tasks.iter().take(config.tray_max_recent_tasks) {
                    let menu_id = format!("start_task_{}", task.id);
                    let task_item = MenuItem::new(app, &task.name, true, Some(&menu_id))?;
                    start_submenu.append(&task_item)?;
                    println!("✅ Added task item: '{}' with ID: '{}'", task.name, menu_id);
                }
                Ok::<_, tauri::Error>(())
            })
            .unwrap_or(Ok(()))?;

        start_submenu.append(&PredefinedMenuItem::separator(app)?)?;
        let new_task_item = MenuItem::new(app, "➕ New Task...", true, Some("new_task"))?;
        start_submenu.append(&new_task_item)?;
        println!("✅ Added new task item to submenu with ID: 'new_task'");

        menu.append(&start_submenu)?;
        println!("✅ Added start timer submenu to main menu");
    } else {
        let start_item = MenuItem::new(app, "▶️ Start New Task...", true, Some("new_task"))?;
        menu.append(&start_item)?;
        println!("✅ Added start new task item with ID: 'new_task' (no existing tasks)");
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // App controls
    let show_item = MenuItem::new(app, "📊 Show App", true, Some("show_app"))?;
    menu.append(&show_item)?;
    println!("✅ Added show app item with ID: 'show_app'");

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&PredefinedMenuItem::quit(app, Some("Quit"))?)?;
    println!("✅ Added quit item");

    println!("🎉 Tray menu creation completed successfully");
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
            println!(
                "Tray click event - button: {:?}, state: {:?}",
                button, button_state
            );
            // The context menu should appear automatically on left-click due to the menu configuration
        }
        TrayIconEvent::DoubleClick {
            button: _,
            position: _,
            rect: _,
            id: _,
        } => {
            println!("Tray double-click event - showing app window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}

pub fn handle_menu_event(id: &str, app: &AppHandle, state: &AppState) {
    println!("🎯 Menu item clicked: '{}' (length: {})", id, id.len());
    println!("🔍 Menu item bytes: {:?}", id.as_bytes());

    match id {
        "stop_timer" => {
            println!("✅ Handling stop_timer menu item");
            if let Err(e) = timer::stop_timer_from_tray(app, state) {
                eprintln!("❌ Failed to stop timer from tray: {}", e);
            } else {
                println!("✅ Timer stopped successfully from tray");
                let _ = update_tray_menu(app, state);
            }
        }
        "new_task" => {
            println!("✅ Handling new_task menu item");
            if let Err(e) = app.emit("show-new-task-dialog", ()) {
                eprintln!("❌ Failed to emit show-new-task-dialog event: {}", e);
            } else {
                println!("✅ Successfully emitted show-new-task-dialog event");
            }
            show_main_window(app);
        }
        "show_app" => {
            println!("✅ Handling show_app menu item");
            show_main_window(app);
        }
        "quit" => {
            println!("✅ Handling quit menu item");
            app.exit(0);
        }
        id if id.starts_with("start_task_") => {
            let task_id = &id[11..]; // Remove "start_task_" prefix
            println!(
                "✅ Handling start_task menu item for task_id: '{}'",
                task_id
            );

            // Find and start the task
            let task_name = state
                .with_tasks(|tasks| {
                    tasks
                        .iter()
                        .find(|t| t.id == task_id)
                        .map(|task| task.name.clone())
                })
                .unwrap_or(None);

            if let Some(task_name) = task_name {
                println!("✅ Found task: '{}'", task_name);
                if let Err(e) = timer::start_timer_from_tray(app, state, task_name.clone()) {
                    eprintln!("❌ Failed to start timer from tray: {}", e);
                } else {
                    println!(
                        "✅ Timer started successfully from tray for task: '{}'",
                        task_name
                    );
                    let _ = update_tray_menu(app, state);
                }
            } else {
                eprintln!("❌ Task not found for id: '{}'", task_id);
            }
        }
        _ => {
            println!("⚠️  Unhandled menu item: '{}'", id);
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            eprintln!("❌ Failed to show window: {}", e);
        } else {
            println!("✅ Window shown successfully");
        }
        if let Err(e) = window.set_focus() {
            eprintln!("❌ Failed to focus window: {}", e);
        } else {
            println!("✅ Window focused successfully");
        }
    } else {
        eprintln!("❌ Main window not found");
    }
}

pub fn update_tray_menu(app: &AppHandle, state: &AppState) -> Result<(), tauri::Error> {
    state.with_tray_icon(|tray_option| {
        if let Some(ref tray) = tray_option {
            let new_menu = create_tray_menu(app, state)?;
            tray.set_menu(Some(new_menu))?;
        }
        Ok(())
    }).map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e)))?
}

pub fn setup_system_tray(app: &AppHandle, state: &AppState) -> Result<(), tauri::Error> {
    let config = get_config();
    println!("Starting system tray setup...");

    // Check if tray icon already exists to prevent duplicates
    let already_exists = state
        .with_tray_icon(|tray_option| tray_option.is_some())
        .unwrap_or(false);

    if already_exists {
        println!("System tray already initialized, skipping setup to prevent duplicates");
        return Ok(());
    }

    // Clean up any existing tray icon
    let _ = state.with_tray_icon_mut(|tray_option| {
        if let Some(existing_tray) = tray_option.take() {
            println!("Cleaning up existing tray icon to prevent duplicates...");
            drop(existing_tray);
            println!("Existing tray icon cleaned up");
        }
    });

    // Load the tray icon with fallback
    let icon = load_tray_icon()?;
    let menu = create_tray_menu(app, state)?;

    // Build the tray icon
    println!("Building new tray icon...");
    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip(&config.tray_tooltip_app_name)
        .on_tray_icon_event({
            let app_handle = app.clone();
            move |_tray, event| {
                println!("Tray icon event received: {:?}", event);
                handle_tray_click_event(event, &app_handle);
            }
        })
        .build(app)
        .map_err(|e| {
            eprintln!("Failed to build tray icon: {:?}", e);
            e
        })?;

    println!("Successfully built new tray icon");

    // Store the new tray icon in shared state
    state
        .with_tray_icon_mut(|tray_option| {
            *tray_option = Some(tray);
        })
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e)))?;

    println!("System tray setup completed successfully");
    Ok(())
}

fn load_tray_icon() -> Result<Image<'static>, tauri::Error> {
    let config = get_config();
    
    // Try primary icon first
    let primary_icon_bytes = include_bytes!("../icons/32x32.png");
    println!(
        "Loaded primary icon bytes, size: {} bytes",
        primary_icon_bytes.len()
    );

    match Image::from_bytes(primary_icon_bytes) {
        Ok(icon) => {
            println!("Successfully created icon from primary {}", config.icon_tray_primary);
            Ok(icon)
        }
        Err(e) => {
            eprintln!("Failed to create icon from {}: {:?}", config.icon_tray_primary, e);
            println!("Trying fallback icon...");

            // Try fallback icon
            let fallback_icon_bytes = include_bytes!("../icons/icon.png");
            println!(
                "Loaded fallback icon bytes, size: {} bytes",
                fallback_icon_bytes.len()
            );

            Image::from_bytes(fallback_icon_bytes).map_err(|e2| {
                eprintln!("Failed to create icon from fallback {}: {:?}", config.icon_tray_fallback, e2);
                eprintln!("Both primary and fallback icons failed!");
                e2
            })
        }
    }
}

fn update_tray_tooltip_only(state: &AppState) -> Result<(), AppError> {
    let config = get_config();
    
    state.with_tray_icon(|tray_option| {
        if let Some(ref tray) = tray_option {
            let (tooltip, should_show_title, title_text) = state
                .with_timer_state(|timer_state| {
                    if timer_state.is_running {
                        let current_elapsed = if let Some(ref start_time) =
                            timer_state.start_time
                        {
                            get_current_elapsed_ms(start_time)
                        } else {
                            timer_state.elapsed_ms
                        };
                        let duration_text_tooltip = format_duration_hm(current_elapsed);
                        let duration_text_title = format_duration_hm(current_elapsed);
                        let tooltip = format!(
                            "⏱️ {} - {} (Click for menu)",
                            timer_state.task_name, duration_text_tooltip
                        );
                        (tooltip, true, duration_text_title)
                    } else {
                        let tooltip =
                            format!("{} - No active timer (Click for menu)", config.tray_tooltip_app_name);
                        (tooltip, false, String::new())
                    }
                })?;

            // Set tooltip with timer info
            tray.set_tooltip(Some(&tooltip))
                .map_err(|e| AppError::new(format!("Failed to set tooltip: {}", e)))?;

            // Set or clear title for macOS based on timer state
            if is_macos() {
                if should_show_title {
                    tray.set_title(Some(&title_text))
                        .map_err(|e| AppError::new(format!("Failed to set title: {}", e)))?;
                } else {
                    tray.set_title(None::<&str>)
                        .map_err(|e| AppError::new(format!("Failed to clear title: {}", e)))?;
                }
            }
        } else {
            return Err(AppError::new("Tray icon not available"));
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

            // Check if timer is running
            let is_running = state_clone
                .with_timer_state(|timer_state| timer_state.is_running)
                .unwrap_or(false);

            // Always update tooltip when timer is running
            if is_running {
                if let Err(e) = update_tray_tooltip_only(&state_clone) {
                    eprintln!("Failed to update tray tooltip: {:?}", e);
                }

                // Update menu periodically to refresh the elapsed time display
                if last_menu_update.elapsed() >= config.tray_menu_refresh_duration() {
                    if let Err(e) = update_tray_menu(&app_clone, &state_clone) {
                        eprintln!("Failed to update tray menu: {:?}", e);
                    }
                    last_menu_update = std::time::Instant::now();
                }
            }
        }
    });
}
