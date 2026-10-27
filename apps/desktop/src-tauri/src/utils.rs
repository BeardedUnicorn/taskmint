// Utility functions used throughout the application

use chrono::{Datelike, NaiveDateTime};

pub fn format_duration_hm(ms: u64) -> String {
    let total_minutes = ms / 60_000;
    format!("{:02}:{:02}", total_minutes / 60, total_minutes % 60)
}

/// Whether a backup file's stamp is a real `YYYYMMDD_HHMMSS` time (in a
/// plausible year), so only TaskMint's own backups are ever pruned.
pub fn is_valid_backup_timestamp(timestamp: &str) -> bool {
    timestamp.len() == 15
        && NaiveDateTime::parse_from_str(timestamp, "%Y%m%d_%H%M%S")
            .is_ok_and(|at| (2020..=2100).contains(&at.year()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_hours_and_minutes() {
        assert_eq!(format_duration_hm(0), "00:00");
        assert_eq!(format_duration_hm(59_999), "00:00");
        assert_eq!(format_duration_hm(90 * 60_000), "01:30");
        assert_eq!(format_duration_hm(26 * 3_600_000 + 5 * 60_000), "26:05");
    }

    #[test]
    fn accepts_only_real_backup_stamps() {
        assert!(is_valid_backup_timestamp("20261013_235959"));
        assert!(!is_valid_backup_timestamp("20261313_120000")); // month 13
        assert!(!is_valid_backup_timestamp("20260230_120000")); // Feb 30
        assert!(!is_valid_backup_timestamp("19991013_120000")); // too early
        assert!(!is_valid_backup_timestamp("20261013-120000"));
        assert!(!is_valid_backup_timestamp("20261013_1200"));
    }
}
