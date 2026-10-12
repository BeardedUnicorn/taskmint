// Utility functions used throughout the application

use crate::config::get_config;

pub fn format_duration_hm(ms: u64) -> String {
    let config = get_config();
    let total_seconds = ms / config.ms_per_second;
    let hours = total_seconds / config.seconds_per_hour;
    let minutes = (total_seconds % config.seconds_per_hour) / config.seconds_per_minute;
    format!("{:02}:{:02}", hours, minutes)
}

// Platform detection
pub fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

// Validation utilities
pub fn is_valid_backup_timestamp(timestamp: &str) -> bool {
    let config = get_config();

    if timestamp.len() != config.validation_timestamp_length {
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

    year >= config.validation_min_year
        && year <= config.validation_max_year
        && month >= 1
        && month <= config.validation_max_month
        && day >= 1
        && day <= config.validation_max_day
        && hour <= config.validation_max_hour
        && minute <= config.validation_max_minute
        && second <= config.validation_max_second
}
