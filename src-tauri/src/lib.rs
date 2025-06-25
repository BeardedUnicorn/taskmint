// TaskMint Tauri app with system tray and timer functionality
use tauri::{AppHandle, State, Manager, Emitter};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::image::Image;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use anyhow;

mod google_drive;
use google_drive::{GoogleDriveClient, GoogleDriveConfig, DriveFileMetadata};

// Type aliases for shared state
type SharedTimerState = Arc<Mutex<TimerState>>;
type SharedTasks = Arc<Mutex<Vec<Task>>>;
type SharedTrayIcon = Arc<Mutex<Option<tauri::tray::TrayIcon>>>;
type SharedGoogleDriveClient = Arc<Mutex<Option<GoogleDriveClient>>>;

// Timer state structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub is_running: bool,
    pub task_name: String,
    pub start_time: Option<DateTime<Utc>>,
    pub elapsed_ms: u64,
}

// Task structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub hourly_rate: Option<f64>,
    pub default_note_template_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// Daily total structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTotal {
    pub total_duration_ms: u64,
    pub task_count: usize,
}

// Backup result structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub timestamp: String,
    pub file_size: Option<u64>,
}

// Google Drive authentication result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDriveAuthResult {
    pub success: bool,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<String>,
    pub error: Option<String>,
}

// Google Drive sync result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDriveSyncResult {
    pub success: bool,
    pub operation: String, // "upload", "download", "conflict"
    pub timestamp: String,
    pub error: Option<String>,
    pub conflict_resolution: Option<String>,
    pub data_changed: bool,
}

// Error recovery utilities

fn retry_sync_operation<T, F>(
    operation: F,
    max_retries: u32,
    delay_ms: u64,
) -> Result<T, String>
where
    F: Fn() -> Result<T, String>,
{
    let mut attempts = 0;
    loop {
        match operation() {
            Ok(result) => return Ok(result),
            Err(e) if attempts < max_retries => {
                attempts += 1;
                eprintln!("Sync operation failed (attempt {}/{}): {}", attempts, max_retries + 1, e);
                std::thread::sleep(Duration::from_millis(delay_ms * attempts as u64));
            }
            Err(e) => return Err(format!("Sync operation failed after {} attempts: {}", max_retries + 1, e)),
        }
    }
}



// Basic command functions
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn log_to_terminal(message: String) {
    println!("Frontend log: {}", message);
}

#[tauri::command]
fn update_timer_state(
    timer_state: State<SharedTimerState>,
    is_running: bool,
    task_name: String,
    start_time: Option<String>,
    elapsed_ms: u64,
) -> Result<(), String> {
    let mut state = timer_state.lock().map_err(|e| format!("Failed to lock timer state: {}", e))?;

    state.is_running = is_running;
    state.task_name = task_name;
    state.start_time = if let Some(time_str) = start_time {
        DateTime::parse_from_rfc3339(&time_str)
            .map(|dt| dt.with_timezone(&Utc))
            .ok()
    } else {
        None
    };
    state.elapsed_ms = elapsed_ms;

    Ok(())
}

#[tauri::command]
fn get_timer_state(timer_state: State<SharedTimerState>) -> Result<TimerState, String> {
    let state = timer_state.lock().map_err(|e| format!("Failed to lock timer state: {}", e))?;
    Ok(state.clone())
}

#[tauri::command]
fn update_tasks(tasks: State<SharedTasks>, new_tasks: Vec<Task>) -> Result<(), String> {
    let mut tasks_guard = tasks.lock().map_err(|e| format!("Failed to lock tasks: {}", e))?;
    *tasks_guard = new_tasks;
    Ok(())
}

#[tauri::command]
fn get_tasks(tasks: State<SharedTasks>) -> Result<Vec<Task>, String> {
    let tasks_guard = tasks.lock().map_err(|e| format!("Failed to lock tasks: {}", e))?;
    Ok(tasks_guard.clone())
}

#[tauri::command]
fn get_daily_total(time_entries: Vec<serde_json::Value>) -> Result<DailyTotal, String> {
    let mut total_duration_ms = 0u64;
    let task_count = time_entries.len();

    for entry in time_entries {
        if let Some(duration) = entry.get("duration").and_then(|d| d.as_u64()) {
            total_duration_ms += duration;
        }
    }

    Ok(DailyTotal {
        total_duration_ms,
        task_count,
    })
}

fn start_timer_from_tray_internal(
    app: AppHandle,
    timer_state: &SharedTimerState,
    task_name: String,
) -> Result<(), String> {
    let start_time = Utc::now();

    // Update timer state with retry
    retry_sync_operation(|| {
        let mut state = timer_state.lock().map_err(|e| format!("Failed to lock timer state: {}", e))?;
        state.is_running = true;
        state.task_name = task_name.clone();
        state.start_time = Some(start_time);
        state.elapsed_ms = 0;
        Ok(())
    }, 3, 100)?;

    // Emit event to frontend with retry
    retry_sync_operation(|| {
        app.emit("timer-started-from-tray", serde_json::json!({
            "taskName": task_name,
            "startTime": start_time.to_rfc3339()
        })).map_err(|e| format!("Failed to emit timer started event: {}", e))
    }, 3, 100)?;

    Ok(())
}

fn stop_timer_from_tray_internal(
    app: AppHandle,
    timer_state: &SharedTimerState,
) -> Result<(), String> {
    let (task_name, start_time, elapsed_ms) = retry_sync_operation(|| {
        let mut state = timer_state.lock().map_err(|e| format!("Failed to lock timer state: {}", e))?;
        let task_name = state.task_name.clone();
        let start_time = state.start_time;
        let elapsed_ms = if let Some(start) = state.start_time {
            (Utc::now() - start).num_milliseconds() as u64
        } else {
            state.elapsed_ms
        };

        state.is_running = false;
        state.start_time = None;
        state.elapsed_ms = 0;

        Ok((task_name, start_time, elapsed_ms))
    }, 3, 100)?;

    // Emit event to frontend with retry
    retry_sync_operation(|| {
        app.emit("timer-stopped-from-tray", serde_json::json!({
            "taskName": task_name,
            "startTime": start_time.map(|t| t.to_rfc3339()),
            "elapsedMs": elapsed_ms
        })).map_err(|e| format!("Failed to emit timer stopped event: {}", e))
    }, 3, 100)?;

    Ok(())
}

#[tauri::command]
fn start_timer_from_tray(
    app: AppHandle,
    timer_state: State<SharedTimerState>,
    task_name: String,
) -> Result<(), String> {
    start_timer_from_tray_internal(app, &*timer_state, task_name)
}

#[tauri::command]
fn stop_timer_from_tray(
    app: AppHandle,
    timer_state: State<SharedTimerState>,
) -> Result<(), String> {
    stop_timer_from_tray_internal(app, &*timer_state)
}

// Utility functions
fn get_current_elapsed_ms(start_time: &DateTime<Utc>) -> u64 {
    (Utc::now() - *start_time).num_milliseconds() as u64
}

fn format_duration(ms: u64) -> String {
    let total_seconds = ms / 1000;
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("{:02}:{:02}", minutes, seconds)
}

fn format_duration_hm(ms: u64) -> String {
    let total_seconds = ms / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    format!("{:02}:{:02}", hours, minutes)
}

fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

fn create_tray_menu(
    app: &AppHandle,
    timer_state: &SharedTimerState,
    tasks: &SharedTasks,
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    println!("🔧 Creating tray menu...");
    let menu = Menu::new(app)?;

    // Get current timer state
    let (is_running, current_task, elapsed_text) = {
        let state = timer_state.lock().unwrap();
        let elapsed = if let Some(ref start_time) = state.start_time {
            get_current_elapsed_ms(start_time)
        } else {
            state.elapsed_ms
        };
        (state.is_running, state.task_name.clone(), format_duration_hm(elapsed))
    };

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
    let tasks_guard = tasks.lock().unwrap();
    if !tasks_guard.is_empty() {
        let start_submenu = Submenu::new(app, "▶️ Start Timer", true)?;
        println!("✅ Created start timer submenu");

        // Add recent/favorite tasks (limit to 5 for menu size)
        for task in tasks_guard.iter().take(5) {
            let menu_id = format!("start_task_{}", task.id);
            let task_item = MenuItem::new(app, &task.name, true, Some(&menu_id))?;
            start_submenu.append(&task_item)?;
            println!("✅ Added task item: '{}' with ID: '{}'", task.name, menu_id);
        }

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

fn handle_tray_event_simple(
    event: TrayIconEvent,
    app: &AppHandle,
) {
    match event {
        TrayIconEvent::Click { button, button_state, position: _, rect: _, id: _ } => {
            println!("Tray click event - button: {:?}, state: {:?}", button, button_state);
            // The context menu should appear automatically on left-click due to the menu configuration
            // We don't need to manually handle menu display here as Tauri handles it

            // Optional: Double-click to show app window
            // For now, let the menu handle all interactions
        }
        TrayIconEvent::DoubleClick { button: _, position: _, rect: _, id: _ } => {
            println!("Tray double-click event - showing app window");
            // Handle double-click - show app
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        // Menu events are handled through the app's global menu event handler
        _ => {}
    }
}

fn handle_menu_item_click(
    id: &str,
    app: &AppHandle,
    timer_state: &SharedTimerState,
    tasks: &SharedTasks,
    tray_icon: &SharedTrayIcon,
) {
    println!("🎯 Menu item clicked: '{}' (length: {})", id, id.len());
    println!("🔍 Menu item bytes: {:?}", id.as_bytes());

    match id {
        "stop_timer" => {
            println!("✅ Handling stop_timer menu item");
            // Create a temporary timer state for the command call
            let timer_state_for_command = timer_state.clone();
            if let Err(e) = stop_timer_from_tray_internal(app.clone(), &timer_state_for_command) {
                eprintln!("❌ Failed to stop timer from tray: {}", e);
            } else {
                println!("✅ Timer stopped successfully from tray");
            }
            let _ = update_tray_menu_real_time(app, tray_icon, timer_state, tasks, 0);
        }
        "new_task" => {
            println!("✅ Handling new_task menu item");
            // Emit event to show new task dialog
            if let Err(e) = app.emit("show-new-task-dialog", ()) {
                eprintln!("❌ Failed to emit show-new-task-dialog event: {}", e);
            } else {
                println!("✅ Successfully emitted show-new-task-dialog event");
            }
            // Show the main window
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
        "show_app" => {
            println!("✅ Handling show_app menu item");
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
        "quit" => {
            println!("✅ Handling quit menu item");
            app.exit(0);
        }
        id if id.starts_with("start_task_") => {
            let task_id = &id[11..]; // Remove "start_task_" prefix
            println!("✅ Handling start_task menu item for task_id: '{}'", task_id);
            let tasks_guard = tasks.lock().unwrap();
            if let Some(task) = tasks_guard.iter().find(|t| t.id == task_id) {
                println!("✅ Found task: '{}'", task.name);
                if let Err(e) = start_timer_from_tray_internal(app.clone(), timer_state, task.name.clone()) {
                    eprintln!("❌ Failed to start timer from tray: {}", e);
                } else {
                    println!("✅ Timer started successfully from tray for task: '{}'", task.name);
                }
                let _ = update_tray_menu_real_time(app, tray_icon, timer_state, tasks, 0);
            } else {
                eprintln!("❌ Task not found for id: '{}'", task_id);
            }
        }
        _ => {
            println!("⚠️  Unhandled menu item: '{}'", id);
        }
    }
}

fn update_tray_menu_real_time(
    app: &AppHandle,
    tray_icon: &SharedTrayIcon,
    timer_state: &SharedTimerState,
    tasks: &SharedTasks,
    _daily_total_ms: u64,
) -> Result<(), tauri::Error> {
    if let Ok(tray_guard) = tray_icon.lock() {
        if let Some(ref tray) = *tray_guard {
            // Create updated menu
            let new_menu = create_tray_menu(app, timer_state, tasks)?;
            tray.set_menu(Some(new_menu))?;
        }
    }
    Ok(())
}

fn setup_system_tray(
    app_handle: AppHandle,
    timer_state: SharedTimerState,
    tasks: SharedTasks,
    tray_icon: SharedTrayIcon,
) -> Result<(), tauri::Error> {
    println!("Starting system tray setup...");

    // Check if tray icon already exists to prevent duplicates
    {
        let tray_guard = tray_icon.lock()
            .map_err(|e| {
                eprintln!("Failed to acquire tray icon lock for check: {:?}", e);
                tauri::Error::Anyhow(anyhow::anyhow!("Failed to acquire tray icon lock for check"))
            })?;

        if tray_guard.is_some() {
            println!("System tray already initialized, skipping setup to prevent duplicates");
            return Ok(());
        }
    }

    // Clean up any existing tray icon to prevent duplicates
    {
        let mut tray_guard = tray_icon.lock()
            .map_err(|e| {
                eprintln!("Failed to acquire tray icon lock for cleanup: {:?}", e);
                tauri::Error::Anyhow(anyhow::anyhow!("Failed to acquire tray icon lock for cleanup"))
            })?;

        if let Some(existing_tray) = tray_guard.take() {
            println!("Cleaning up existing tray icon to prevent duplicates...");
            // The tray icon will be automatically cleaned up when dropped
            drop(existing_tray);
            println!("Existing tray icon cleaned up");
        }
    }

    // Load the tray icon with better error handling and fallback
    let icon = {
        // Try primary icon first
        let primary_icon_bytes = include_bytes!("../icons/32x32.png");
        println!("Loaded primary icon bytes, size: {} bytes", primary_icon_bytes.len());

        match Image::from_bytes(primary_icon_bytes) {
            Ok(icon) => {
                println!("Successfully created icon from primary 32x32.png");
                icon
            }
            Err(e) => {
                eprintln!("Failed to create icon from 32x32.png: {:?}", e);
                println!("Trying fallback icon...");

                // Try fallback icon
                let fallback_icon_bytes = include_bytes!("../icons/icon.png");
                println!("Loaded fallback icon bytes, size: {} bytes", fallback_icon_bytes.len());

                Image::from_bytes(fallback_icon_bytes)
                    .map_err(|e2| {
                        eprintln!("Failed to create icon from fallback icon.png: {:?}", e2);
                        eprintln!("Both primary and fallback icons failed!");
                        e2
                    })?
            }
        }
    };

    // Create initial menu with error handling
    let menu = create_tray_menu(&app_handle, &timer_state, &tasks)
        .map_err(|e| {
            eprintln!("Failed to create tray menu: {:?}", e);
            e
        })?;
    println!("Successfully created tray menu");

    // Build the tray icon with detailed error handling
    println!("Building new tray icon...");
    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("TaskMint")
        .on_tray_icon_event({
            let app_handle = app_handle.clone();
            move |_tray, event| {
                println!("Tray icon event received: {:?}", event);
                handle_tray_event_simple(event, &app_handle);
            }
        })
        .build(&app_handle)
        .map_err(|e| {
            eprintln!("Failed to build tray icon: {:?}", e);
            e
        })?;

    println!("Successfully built new tray icon");

    // Store the new tray icon in shared state
    {
        let mut tray_guard = tray_icon.lock()
            .map_err(|e| {
                eprintln!("Failed to acquire tray icon lock: {:?}", e);
                tauri::Error::Anyhow(anyhow::anyhow!("Failed to acquire tray icon lock"))
            })?;
        *tray_guard = Some(tray);
    }

    println!("System tray setup completed successfully - single icon should now be visible in system tray");
    Ok(())
}



#[tauri::command]
fn update_tray_menu_command(
    app: AppHandle,
    timer_state: State<SharedTimerState>,
    tasks: State<SharedTasks>,
    tray_icon: State<SharedTrayIcon>,
    time_entries: Vec<serde_json::Value>,
) -> Result<(), String> {
    // Calculate daily total
    let daily_total = get_daily_total(time_entries).unwrap_or(DailyTotal {
        total_duration_ms: 0,
        task_count: 0,
    });

    update_tray_menu_real_time(&app, &*tray_icon, &*timer_state, &*tasks, daily_total.total_duration_ms)
        .map_err(|e| format!("Failed to update tray menu: {:?}", e))
}

#[tauri::command]
async fn execute_cli_command(command: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("sh")
        .arg("-c")
        .arg(&command)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[derive(serde::Serialize)]
struct PathValidationResult {
    is_valid: bool,
    error: Option<String>,
}

#[tauri::command]
async fn validate_backup_path(path: String) -> Result<PathValidationResult, String> {
    let backup_path = Path::new(&path);

    // Check if path is empty
    if path.trim().is_empty() {
        return Ok(PathValidationResult {
            is_valid: false,
            error: Some("Backup path cannot be empty".to_string()),
        });
    }

    // Check if path exists
    if !backup_path.exists() {
        // Try to create the directory to test if it's writable
        match fs::create_dir_all(&backup_path) {
            Ok(_) => {
                // Successfully created, path is valid
                return Ok(PathValidationResult {
                    is_valid: true,
                    error: None,
                });
            }
            Err(e) => {
                return Ok(PathValidationResult {
                    is_valid: false,
                    error: Some(format!("Cannot create backup directory: {}", e)),
                });
            }
        }
    }

    // Path exists, check if it's a directory
    if !backup_path.is_dir() {
        return Ok(PathValidationResult {
            is_valid: false,
            error: Some("Backup path must be a directory, not a file".to_string()),
        });
    }

    // Test write permissions by creating a temporary file
    let test_file_path = backup_path.join(".taskmint_write_test");
    match fs::write(&test_file_path, "test") {
        Ok(_) => {
            // Clean up test file
            let _ = fs::remove_file(&test_file_path);
            Ok(PathValidationResult {
                is_valid: true,
                error: None,
            })
        }
        Err(e) => {
            Ok(PathValidationResult {
                is_valid: false,
                error: Some(format!("Directory is not writable: {}", e)),
            })
        }
    }
}

#[tauri::command]
async fn perform_automatic_backup(
    backup_path: String,
    current_data_json: String,
    max_backups: u32,
) -> Result<BackupResult, String> {
    let timestamp = Utc::now();
    let timestamp_str = timestamp.format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("time_tracker_backup_{}.json", timestamp_str);
    let file_path = Path::new(&backup_path).join(&filename);

    // Ensure backup directory exists
    if let Some(parent) = file_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Ok(BackupResult {
                success: false,
                file_path: None,
                error: Some(format!("Failed to create backup directory: {}", e)),
                timestamp: timestamp.to_rfc3339(),
                file_size: None,
            });
        }
    }

    // Write backup file
    match fs::write(&file_path, ¤t_data_json) {
        Ok(_) => {
            // Get file size
            let file_size = fs::metadata(&file_path)
                .map(|metadata| metadata.len())
                .ok();

            // Clean up old backups
            if let Err(e) = cleanup_old_backups(&backup_path, max_backups) {
                eprintln!("Warning: Failed to cleanup old backups: {}", e);
            }

            Ok(BackupResult {
                success: true,
                file_path: Some(file_path.to_string_lossy().to_string()),
                error: None,
                timestamp: timestamp.to_rfc3339(),
                file_size,
            })
        }
        Err(e) => Ok(BackupResult {
            success: false,
            file_path: None,
            error: Some(format!("Failed to write backup file: {}", e)),
            timestamp: timestamp.to_rfc3339(),
            file_size: None,
        }),
    }
}

// Helper function to validate backup timestamp format (YYYYMMDD_HHMMSS)
fn is_valid_backup_timestamp(timestamp: &str) -> bool {
    if timestamp.len() != 15 {
        return false;
    }

    let parts: Vec<&str> = timestamp.split('_').collect();
    if parts.len() != 2 {
        return false;
    }

    let date_part = parts[0];
    let time_part = parts[1];

    // Check date part (YYYYMMDD)
    if date_part.len() != 8 || !date_part.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    // Check time part (HHMMSS)
    if time_part.len() != 6 || !time_part.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    // Basic range validation
    let year: u32 = date_part[0..4].parse().unwrap_or(0);
    let month: u32 = date_part[4..6].parse().unwrap_or(0);
    let day: u32 = date_part[6..8].parse().unwrap_or(0);
    let hour: u32 = time_part[0..2].parse().unwrap_or(0);
    let minute: u32 = time_part[2..4].parse().unwrap_or(0);
    let second: u32 = time_part[4..6].parse().unwrap_or(0);

    year >= 2020 && year <= 2100 &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= 31 &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
}

// Helper function to cleanup old backup files
fn cleanup_old_backups(backup_path: &str, max_backups: u32) -> Result<(), String> {
    let backup_dir = Path::new(backup_path);

    if !backup_dir.exists() {
        return Ok(());
    }

    let entries = match fs::read_dir(backup_dir) {
        Ok(e) => e,
        Err(err) => return Err(format!("Failed to read backup directory: {}", err)),
    };

    let mut backup_files: Vec<String> = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if filename.starts_with("time_tracker_backup_") && filename.ends_with(".json") {
                    if let Some(timestamp_part) = filename.strip_prefix("time_tracker_backup_").and_then(|s| s.strip_suffix(".json")) {
                        if is_valid_backup_timestamp(timestamp_part) {
                            backup_files.push(path.to_string_lossy().to_string());
                        } else {
                            println!("Skipping file with invalid timestamp format: {}", filename);
                        }
                    } else {
                        println!("Skipping file with unexpected name format: {}", filename);
                    }
                }
            }
        }
    }

    // Sort by filename descending (newest first)
    backup_files.sort_by(|a, b| b.cmp(a));

    if backup_files.len() > max_backups as usize {
        let files_to_remove = backup_files.iter().skip(max_backups as usize);

        for path_str in files_to_remove {
            if let Err(e) = fs::remove_file(path_str) {
                eprintln!("Warning: Failed to remove old backup file {}: {}", path_str, e);
            } else {
                println!("Removed old backup file: {}", path_str);
            }
        }
    } else {
        println!("No cleanup needed: {} backup files found (max: {})", backup_files.len(), max_backups);
    }

    Ok(())
}





#[tauri::command]
fn test_new_task_dialog(app: AppHandle) -> Result<(), String> {
    println!("Test command: test_new_task_dialog called");
    // Emit event to show new task dialog
    if let Err(e) = app.emit("show-new-task-dialog", ()) {
        eprintln!("Failed to emit show-new-task-dialog event: {}", e);
        return Err(format!("Failed to emit event: {}", e));
    } else {
        println!("Successfully emitted show-new-task-dialog event");
    }

    // Show the main window
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            eprintln!("Failed to show window: {}", e);
        }
        if let Err(e) = window.set_focus() {
            eprintln!("Failed to focus window: {}", e);
        }
        println!("Window shown and focused");
    } else {
        eprintln!("Main window not found");
    }

    Ok(())
}

// Google Drive Cloud Sync Commands

#[tauri::command]
async fn google_drive_get_auth_url(
    client_id: String,
    redirect_uri: String,
) -> Result<String, String> {
    let config = GoogleDriveConfig {
        client_id,
        client_secret: String::new(), // Not needed for auth URL
        redirect_uri,
    };

    let client = GoogleDriveClient::new(config);
    let state = uuid::Uuid::new_v4().to_string();

    client.get_auth_url(&state)
        .map_err(|e| format!("Failed to generate auth URL: {}", e))
}

#[tauri::command]
async fn google_drive_authenticate(
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    auth_code: String,
    google_drive_client: State<'_, SharedGoogleDriveClient>,
) -> Result<GoogleDriveAuthResult, String> {
    let config = GoogleDriveConfig {
        client_id,
        client_secret,
        redirect_uri,
    };

    let mut client = GoogleDriveClient::new(config);

    match client.exchange_code_for_tokens(&auth_code).await {
        Ok(tokens) => {
            // Store the client with tokens in shared state
            {
                let mut client_guard = google_drive_client.lock()
                    .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;
                *client_guard = Some(client);
            }

            Ok(GoogleDriveAuthResult {
                success: true,
                access_token: Some(tokens.access_token),
                refresh_token: tokens.refresh_token,
                expires_at: Some(tokens.expires_at.to_rfc3339()),
                error: None,
            })
        }
        Err(e) => Ok(GoogleDriveAuthResult {
            success: false,
            access_token: None,
            refresh_token: None,
            expires_at: None,
            error: Some(format!("Authentication failed: {}", e)),
        })
    }
}

#[tauri::command]
async fn google_drive_list_files(
    query: Option<String>,
    google_drive_client: State<'_, SharedGoogleDriveClient>,
) -> Result<Vec<DriveFileMetadata>, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = {
        let mut client_guard = google_drive_client.lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;

        client_guard.as_mut()
            .ok_or_else(|| "Google Drive client not authenticated".to_string())?
            .clone()
    };

    client.list_files(query.as_deref()).await
        .map_err(|e| format!("Failed to list files: {}", e))
}

#[tauri::command]
async fn google_drive_get_file_metadata(
    file_id: String,
    google_drive_client: State<'_, SharedGoogleDriveClient>,
) -> Result<DriveFileMetadata, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = {
        let mut client_guard = google_drive_client.lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;

        client_guard.as_mut()
            .ok_or_else(|| "Google Drive client not authenticated".to_string())?
            .clone()
    };

    client.get_file_metadata(&file_id).await
        .map_err(|e| format!("Failed to get file metadata: {}", e))
}

#[tauri::command]
async fn google_drive_download_file(
    file_id: String,
    google_drive_client: State<'_, SharedGoogleDriveClient>,
) -> Result<String, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = {
        let mut client_guard = google_drive_client.lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;

        client_guard.as_mut()
            .ok_or_else(|| "Google Drive client not authenticated".to_string())?
            .clone()
    };

    client.download_file(&file_id).await
        .map_err(|e| format!("Failed to download file: {}", e))
}

#[tauri::command]
async fn google_drive_upload_file(
    filename: String,
    content: String,
    parent_folder_id: Option<String>,
    google_drive_client: State<'_, SharedGoogleDriveClient>,
) -> Result<DriveFileMetadata, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = {
        let mut client_guard = google_drive_client.lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;

        client_guard.as_mut()
            .ok_or_else(|| "Google Drive client not authenticated".to_string())?
            .clone()
    };

    client.upload_file(&filename, &content, parent_folder_id.as_deref()).await
        .map_err(|e| format!("Failed to upload file: {}", e))
}

#[tauri::command]
async fn google_drive_update_file(
    file_id: String,
    content: String,
    google_drive_client: State<'_, SharedGoogleDriveClient>,
) -> Result<DriveFileMetadata, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = {
        let mut client_guard = google_drive_client.lock()
            .map_err(|e| format!("Failed to lock Google Drive client: {}", e))?;

        client_guard.as_mut()
            .ok_or_else(|| "Google Drive client not authenticated".to_string())?
            .clone()
    };

    client.update_file(&file_id, &content).await
        .map_err(|e| format!("Failed to update file: {}", e))
}



// System tray functionality
fn update_tray_tooltip_only(
    tray_icon: &SharedTrayIcon,
    timer_state: &SharedTimerState,
) -> Result<(), tauri::Error> {
    retry_sync_operation(|| {
        if let Ok(tray_guard) = tray_icon.lock() {
            if let Some(ref tray) = *tray_guard {
                // Update tooltip and title with current timer status
                let (tooltip, should_show_title, title_text) = {
                    let state = timer_state.lock().map_err(|e| format!("Failed to lock timer state: {}", e))?;
                    if state.is_running {
                        let current_elapsed = if let Some(ref start_time) = state.start_time {
                            get_current_elapsed_ms(start_time)
                        } else {
                            state.elapsed_ms
                        };
                        let duration_text_tooltip = format_duration(current_elapsed); // MM:SS for tooltip
                        let duration_text_title = format_duration_hm(current_elapsed); // HH:MM for title
                        let tooltip = format!("⏱️ {} - {} (Click for menu)", state.task_name, duration_text_tooltip);
                        (tooltip, true, duration_text_title)
                    } else {
                        let tooltip = "TaskMint - No active timer (Click for menu)".to_string();
                        (tooltip, false, String::new())
                    }
                };

                // Set tooltip with timer info
                tray.set_tooltip(Some(&tooltip)).map_err(|e| format!("Failed to set tooltip: {}", e))?;

                // Set or clear title for macOS based on timer state
                if is_macos() {
                    if should_show_title {
                        tray.set_title(Some(&title_text)).map_err(|e| format!("Failed to set title: {}", e))?;
                    } else {
                        tray.set_title(None::<&str>).map_err(|e| format!("Failed to clear title: {}", e))?;
                    }
                }
            } else {
                return Err("Tray icon not available".to_string());
            }
        } else {
            return Err("Failed to acquire tray lock".to_string());
        }
        Ok(())
    }, 3, 100).map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e)))
}

fn start_tray_update_timer(
    app: AppHandle,
    timer_state: SharedTimerState,
    tasks: SharedTasks,
    tray_icon: SharedTrayIcon,
) {
    let timer_state_clone = timer_state.clone();
    let tasks_clone = tasks.clone();
    let tray_icon_clone = tray_icon.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let mut last_menu_update = std::time::Instant::now();

        loop {
            std::thread::sleep(Duration::from_secs(1));

            // Check if timer is running
            let is_running = {
                if let Ok(state) = timer_state_clone.lock() {
                    state.is_running
                } else {
                    false
                }
            };

            // Always update tooltip when timer is running
            if is_running {
                if let Err(e) = update_tray_tooltip_only(
                    &tray_icon_clone,
                    &timer_state_clone,
                ) {
                    eprintln!("Failed to update tray tooltip: {:?}", e);
                }

                // Update menu every 30 seconds to refresh the elapsed time display
                if last_menu_update.elapsed() >= Duration::from_secs(30) {
                    if let Err(e) = update_tray_menu_real_time(
                        &app_clone,
                        &tray_icon_clone,
                        &timer_state_clone,
                        &tasks_clone,
                        0,
                    ) {
                        eprintln!("Failed to update tray menu: {:?}", e);
                    }
                    last_menu_update = std::time::Instant::now();
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let timer_state: SharedTimerState = Arc::new(Mutex::new(TimerState {
        is_running: false,
        task_name: String::new(),
        start_time: None,
        elapsed_ms: 0,
    }));

    let tasks: SharedTasks = Arc::new(Mutex::new(Vec::new()));
    let tray_icon: SharedTrayIcon = Arc::new(Mutex::new(None));
    let google_drive_client: SharedGoogleDriveClient = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(timer_state.clone())
        .manage(tasks.clone())
        .manage(tray_icon.clone())
        .manage(google_drive_client.clone())
        .setup({
            let timer_state = timer_state.clone();
            let tasks = tasks.clone();
            let tray_icon = tray_icon.clone();
            move |app| {
                // Set up menu event handling
                let app_handle = app.handle().clone();
                let timer_state_for_menu = timer_state.clone();
                let tasks_for_menu = tasks.clone();
                let tray_icon_for_menu = tray_icon.clone();

                app.on_menu_event(move |app, event| {
                    println!("🎯 Menu event received: {:?}", event.id());
                    println!("🔍 Event details: {:?}", event);
                    handle_menu_item_click(
                        &event.id().as_ref(),
                        app,
                        &timer_state_for_menu,
                        &tasks_for_menu,
                        &tray_icon_for_menu,
                    );
                });
                println!("✅ Menu event handler registered successfully");

                match setup_system_tray(app_handle.clone(), timer_state.clone(), tasks.clone(), tray_icon.clone()) {
                    Ok(()) => {
                        println!("System tray setup successful, starting update timer...");
                        // Start the real-time tray update timer
                        start_tray_update_timer(app_handle.clone(), timer_state.clone(), tasks.clone(), tray_icon.clone());
                    }
                    Err(e) => {
                        eprintln!("CRITICAL ERROR: Failed to setup system tray: {:?}", e);
                        eprintln!("This means the system tray icon will not appear!");
                        eprintln!("Please check:");
                        eprintln!("1. System tray permissions");
                        eprintln!("2. Icon file exists at src-tauri/icons/32x32.png");
                        eprintln!("3. Platform-specific tray support");

                        // Continue running the app even if tray setup fails
                        // but log the error prominently
                    }
                }
                Ok(())
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            log_to_terminal,
            update_timer_state,
            get_timer_state,
            update_tasks,
            get_tasks,
            get_daily_total,
            start_timer_from_tray,
            stop_timer_from_tray,
            update_tray_menu_command,
            test_new_task_dialog,
            execute_cli_command,
            validate_backup_path,
            perform_automatic_backup,
            google_drive_get_auth_url,
            google_drive_authenticate,
            google_drive_list_files,
            google_drive_get_file_metadata,
            google_drive_download_file,
            google_drive_upload_file,
            google_drive_update_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
