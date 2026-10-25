//! Fixed values the backend uses. (They used to be generated from a
//! config.toml at build time, though nothing ever changed them at run time.)

use std::time::Duration;

/// How often the tray re-reads the live timer to update its title and tooltip.
pub const TRAY_STATUS_UPDATE_INTERVAL: Duration = Duration::from_secs(1);
/// How often the tray menu is rebuilt while a timer runs (its elapsed label).
pub const TRAY_MENU_REFRESH_INTERVAL: Duration = Duration::from_secs(60);
/// Shown in the tray tooltip.
pub const TRAY_TOOLTIP_APP_NAME: &str = "TaskMint";
/// Most tasks listed in the tray's Start submenu.
pub const TRAY_MAX_RECENT_TASKS: usize = 5;

/// Backup file names: `<prefix><YYYYMMDD_HHMMSS><extension>`. The prefix
/// predates the TaskMint name; existing backups are found (and pruned) by it,
/// so it stays.
pub const BACKUP_FILENAME_PREFIX: &str = "time_tracker_backup_";
pub const BACKUP_FILENAME_EXTENSION: &str = ".json";
/// Written and removed to check a backup folder is writable.
pub const BACKUP_WRITE_TEST_FILENAME: &str = ".taskmint_write_test";

/// Tray icon files (relative to the binary in dev builds; the bundled icon is
/// used when neither loads).
pub const ICON_TRAY_PRIMARY: &str = "../icons/32x32.png";
pub const ICON_TRAY_FALLBACK: &str = "../icons/icon.png";
