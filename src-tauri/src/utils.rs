// Utility functions used throughout the application

use chrono::{DateTime, Utc};

// Time formatting utilities
pub fn get_current_elapsed_ms(start_time: &DateTime<Utc>) -> u64 {
    (Utc::now() - *start_time).num_milliseconds() as u64
}

pub fn format_duration(ms: u64) -> String {
    let total_seconds = ms / 1000;
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("{:02}:{:02}", minutes, seconds)
}

pub fn format_duration_hm(ms: u64) -> String {
    let total_seconds = ms / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    format!("{:02}:{:02}", hours, minutes)
}

// Platform detection
pub fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

// Validation utilities
pub fn is_valid_backup_timestamp(timestamp: &str) -> bool {
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

    year >= 2020
        && year <= 2100
        && month >= 1
        && month <= 12
        && day >= 1
        && day <= 31
        && hour <= 23
        && minute <= 59
        && second <= 59
}
