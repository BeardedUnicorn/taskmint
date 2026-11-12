//! Fixed values the backend uses. (They used to be generated from a
//! config.toml at build time, though nothing ever changed them at run time.)

use std::time::Duration;

/// How often the tray re-reads the live timer. Its menu and tooltip show
/// minutes, so they change about once a minute while a timer runs.
pub const TRAY_STATUS_UPDATE_INTERVAL: Duration = Duration::from_secs(1);
/// Shown in the tray tooltip.
pub const TRAY_TOOLTIP_APP_NAME: &str = "TaskMint";
/// Most tasks listed in the tray's Start submenu.
pub const TRAY_MAX_RECENT_TASKS: usize = 5;
/// Longest task name the menu bar's Timer items show before cutting it short.
pub const APP_MENU_MAX_TASK_NAME: usize = 32;

/// Backup file names: `<prefix><YYYYMMDD_HHMMSS><extension>`. The prefix
/// predates the TaskMint name; existing backups are found (and pruned) by it,
/// so it stays.
pub const BACKUP_FILENAME_PREFIX: &str = "time_tracker_backup_";
pub const BACKUP_FILENAME_EXTENSION: &str = ".json";
/// Automatic backups go here, inside Documents, until the user picks a
/// folder.
pub const DEFAULT_BACKUP_FOLDER_NAME: &str = "TaskMint Backups";
/// Written and removed to check a backup folder is writable.
pub const BACKUP_WRITE_TEST_FILENAME: &str = ".taskmint_write_test";

/// Tray icon files, named in the log when one fails to load (the images are
/// compiled in). macOS uses the template, which the menu bar tints for its
/// light or dark look; the others the app icon.
pub const ICON_TRAY_TEMPLATE: &str = "icons/tray-template.png";
pub const ICON_TRAY_PRIMARY: &str = "icons/32x32.png";
pub const ICON_TRAY_FALLBACK: &str = "icons/icon.png";
