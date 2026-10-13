use serde::{Deserialize, Serialize};

include!(concat!(env!("OUT_DIR"), "/generated_config.rs"));
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    /// Interval in seconds for updating the tray tooltip status
    pub tray_status_update_interval: u64,

    /// Interval in seconds for refreshing the tray menu
    pub tray_menu_refresh_interval: u64,

    /// Application name shown in tray tooltip
    pub tray_tooltip_app_name: String,

    /// Maximum number of recent tasks to show in tray menu
    pub tray_max_recent_tasks: usize,

    /// Time configuration
    pub ms_per_second: u64,
    pub seconds_per_minute: u64,
    pub seconds_per_hour: u64,

    /// Backup configuration
    pub backup_filename_prefix: String,
    pub backup_filename_extension: String,
    pub backup_write_test_filename: String,

    /// Validation configuration
    pub validation_timestamp_length: usize,
    pub validation_min_year: u32,
    pub validation_max_year: u32,
    pub validation_max_month: u32,
    pub validation_max_day: u32,
    pub validation_max_hour: u32,
    pub validation_max_minute: u32,
    pub validation_max_second: u32,

    /// Icon configuration
    pub icon_tray_primary: String,
    pub icon_tray_fallback: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            tray_status_update_interval: TRAY_STATUS_UPDATE_INTERVAL,
            tray_menu_refresh_interval: TRAY_MENU_REFRESH_INTERVAL,
            tray_tooltip_app_name: TRAY_TOOLTIP_APP_NAME.to_string(),
            tray_max_recent_tasks: TRAY_MAX_RECENT_TASKS,
            ms_per_second: MS_PER_SECOND,
            seconds_per_minute: SECONDS_PER_MINUTE,
            seconds_per_hour: SECONDS_PER_HOUR,
            backup_filename_prefix: BACKUP_FILENAME_PREFIX.to_string(),
            backup_filename_extension: BACKUP_FILENAME_EXTENSION.to_string(),
            backup_write_test_filename: BACKUP_WRITE_TEST_FILENAME.to_string(),
            validation_timestamp_length: VALIDATION_TIMESTAMP_LENGTH,
            validation_min_year: VALIDATION_MIN_YEAR,
            validation_max_year: VALIDATION_MAX_YEAR,
            validation_max_month: VALIDATION_MAX_MONTH,
            validation_max_day: VALIDATION_MAX_DAY,
            validation_max_hour: VALIDATION_MAX_HOUR,
            validation_max_minute: VALIDATION_MAX_MINUTE,
            validation_max_second: VALIDATION_MAX_SECOND,
            icon_tray_primary: ICON_TRAY_PRIMARY.to_string(),
            icon_tray_fallback: ICON_TRAY_FALLBACK.to_string(),
        }
    }
}

impl Config {
    /// Get tray status update duration
    pub fn tray_status_update_duration(&self) -> Duration {
        Duration::from_secs(self.tray_status_update_interval)
    }

    /// Get tray menu refresh duration
    pub fn tray_menu_refresh_duration(&self) -> Duration {
        Duration::from_secs(self.tray_menu_refresh_interval)
    }
}

/// Get the global configuration instance
pub fn get_config() -> Config {
    Config::default()
}
