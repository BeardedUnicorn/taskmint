use serde::Deserialize;
use std::env;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct TrayConfig {
    status_update_interval: u64,
    menu_refresh_interval: u64,
    tooltip_app_name: String,
    max_recent_tasks: usize,
}

#[derive(Debug, Deserialize)]
struct RetryConfig {
    max_attempts: u32,
    base_delay_ms: u64,
}

#[derive(Debug, Deserialize)]
struct TimeConfig {
    ms_per_second: u64,
    seconds_per_minute: u64,
    seconds_per_hour: u64,
    minutes_per_hour: u64,
}

#[derive(Debug, Deserialize)]
struct BackupConfig {
    default_max_backups: u32,
    filename_prefix: String,
    filename_extension: String,
    write_test_filename: String,
}

#[derive(Debug, Deserialize)]
struct ValidationConfig {
    timestamp_length: usize,
    min_year: u32,
    max_year: u32,
    max_month: u32,
    max_day: u32,
    max_hour: u32,
    max_minute: u32,
    max_second: u32,
}

#[derive(Debug, Deserialize)]
struct IconConfig {
    tray_primary: String,
    tray_fallback: String,
}

#[derive(Debug, Deserialize)]
struct BuildTimeConfig {
    tray: TrayConfig,
    retry: RetryConfig,
    time: TimeConfig,
    backup: BackupConfig,
    validation: ValidationConfig,
    icons: IconConfig,
}

fn main() {
    // Tell Cargo that if the given file changes, to rerun this build script.
    println!("cargo:rerun-if-changed=config.toml");

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let config_path = Path::new(&manifest_dir).join("config.toml");
    let config_content = fs::read_to_string(config_path).expect("Failed to read config.toml");
    let config: BuildTimeConfig =
        toml::from_str(&config_content).expect("Failed to parse config.toml");

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("generated_config.rs");

    let generated_code = format!(
        r#"// GENERATED CODE - DO NOT EDIT MANUALLY
// This file is generated from config.toml during build

// Tray Configuration
pub const TRAY_STATUS_UPDATE_INTERVAL: u64 = {};
pub const TRAY_MENU_REFRESH_INTERVAL: u64 = {};
pub const TRAY_TOOLTIP_APP_NAME: &str = "{}";
pub const TRAY_MAX_RECENT_TASKS: usize = {};

// Retry Configuration
pub const RETRY_MAX_ATTEMPTS: u32 = {};
pub const RETRY_BASE_DELAY_MS: u64 = {};

// Time Configuration
pub const MS_PER_SECOND: u64 = {};
pub const SECONDS_PER_MINUTE: u64 = {};
pub const SECONDS_PER_HOUR: u64 = {};
pub const MINUTES_PER_HOUR: u64 = {};

// Backup Configuration
pub const BACKUP_DEFAULT_MAX_BACKUPS: u32 = {};
pub const BACKUP_FILENAME_PREFIX: &str = "{}";
pub const BACKUP_FILENAME_EXTENSION: &str = "{}";
pub const BACKUP_WRITE_TEST_FILENAME: &str = "{}";

// Validation Configuration
pub const VALIDATION_TIMESTAMP_LENGTH: usize = {};
pub const VALIDATION_MIN_YEAR: u32 = {};
pub const VALIDATION_MAX_YEAR: u32 = {};
pub const VALIDATION_MAX_MONTH: u32 = {};
pub const VALIDATION_MAX_DAY: u32 = {};
pub const VALIDATION_MAX_HOUR: u32 = {};
pub const VALIDATION_MAX_MINUTE: u32 = {};
pub const VALIDATION_MAX_SECOND: u32 = {};

// Icon Configuration
pub const ICON_TRAY_PRIMARY: &str = "{}";
pub const ICON_TRAY_FALLBACK: &str = "{}";
"#,
        config.tray.status_update_interval,
        config.tray.menu_refresh_interval,
        config.tray.tooltip_app_name,
        config.tray.max_recent_tasks,
        config.retry.max_attempts,
        config.retry.base_delay_ms,
        config.time.ms_per_second,
        config.time.seconds_per_minute,
        config.time.seconds_per_hour,
        config.time.minutes_per_hour,
        config.backup.default_max_backups,
        config.backup.filename_prefix,
        config.backup.filename_extension,
        config.backup.write_test_filename,
        config.validation.timestamp_length,
        config.validation.min_year,
        config.validation.max_year,
        config.validation.max_month,
        config.validation.max_day,
        config.validation.max_hour,
        config.validation.max_minute,
        config.validation.max_second,
        config.icons.tray_primary,
        config.icons.tray_fallback,
    );

    fs::write(&dest_path, generated_code).expect("Failed to write generated_config.rs");

    tauri_build::build()
}
