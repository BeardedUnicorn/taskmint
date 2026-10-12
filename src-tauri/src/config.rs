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

    /// Retry configuration
    pub retry_max_attempts: u32,
    pub retry_base_delay_ms: u64,

    /// Time configuration
    pub ms_per_second: u64,
    pub seconds_per_minute: u64,
    pub seconds_per_hour: u64,
    pub minutes_per_hour: u64,

    /// Backup configuration
    pub backup_default_max_backups: u32,
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

    /// Inactivity detection configuration
    pub inactivity_enabled: bool,
    pub inactivity_threshold_minutes: u32,
    pub inactivity_show_warning_before_pause: bool,
    pub inactivity_warning_duration_seconds: u32,
    pub inactivity_resume_on_activity: bool,
    pub inactivity_activity_check_interval_ms: u64,

    /// Session management configuration
    pub sessions_max_timer_instances_per_session: usize,
    pub sessions_max_session_name_length: usize,
    pub sessions_max_session_notes_length: usize,
    pub sessions_max_timer_notes_length: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            tray_status_update_interval: TRAY_STATUS_UPDATE_INTERVAL,
            tray_menu_refresh_interval: TRAY_MENU_REFRESH_INTERVAL,
            tray_tooltip_app_name: TRAY_TOOLTIP_APP_NAME.to_string(),
            tray_max_recent_tasks: TRAY_MAX_RECENT_TASKS,
            retry_max_attempts: RETRY_MAX_ATTEMPTS,
            retry_base_delay_ms: RETRY_BASE_DELAY_MS,
            ms_per_second: MS_PER_SECOND,
            seconds_per_minute: SECONDS_PER_MINUTE,
            seconds_per_hour: SECONDS_PER_HOUR,
            minutes_per_hour: MINUTES_PER_HOUR,
            backup_default_max_backups: BACKUP_DEFAULT_MAX_BACKUPS,
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
            // Default values for new configuration options (constants will be generated from config.toml)
            inactivity_enabled: true,
            inactivity_threshold_minutes: 15,
            inactivity_show_warning_before_pause: true,
            inactivity_warning_duration_seconds: 30,
            inactivity_resume_on_activity: false,
            inactivity_activity_check_interval_ms: 1000,
            sessions_max_timer_instances_per_session: 50,
            sessions_max_session_name_length: 100,
            sessions_max_session_notes_length: 1000,
            sessions_max_timer_notes_length: 500,
        }
    }
}

impl Config {
    /// Create a new configuration instance with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Get tray status update duration
    pub fn tray_status_update_duration(&self) -> Duration {
        Duration::from_secs(self.tray_status_update_interval)
    }

    /// Get tray menu refresh duration
    pub fn tray_menu_refresh_duration(&self) -> Duration {
        Duration::from_secs(self.tray_menu_refresh_interval)
    }

    /// Get retry delay duration for a given attempt number
    pub fn retry_delay_duration(&self, attempt: u32) -> Duration {
        Duration::from_millis(self.retry_base_delay_ms * attempt as u64)
    }

    /// Get inactivity threshold duration
    pub fn inactivity_threshold_duration(&self) -> Duration {
        Duration::from_secs(self.inactivity_threshold_minutes as u64 * 60)
    }

    /// Get inactivity warning duration
    pub fn inactivity_warning_duration(&self) -> Duration {
        Duration::from_secs(self.inactivity_warning_duration_seconds as u64)
    }

    /// Get activity check interval duration
    pub fn inactivity_activity_check_duration(&self) -> Duration {
        Duration::from_millis(self.inactivity_activity_check_interval_ms)
    }
}

/// Get the global configuration instance
pub fn get_config() -> Config {
    Config::default()
}
