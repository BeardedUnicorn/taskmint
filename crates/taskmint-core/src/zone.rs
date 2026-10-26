//! The time zone days and clock times are read in.
//!
//! Sessions are dated by the user's local calendar day (the dashboard's
//! today-filter and the calendar compare `date` against it), and some errors
//! name local clock times. Core never assumes a zone: the host says which.

use chrono::{DateTime, Local, Utc};
use chrono_tz::Tz;

/// The desktop app reads days in the machine's zone (`Local`); a server reads
/// them in the zone the client sends (`Named`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DayZone {
    /// The machine's own zone, as `chrono::Local` reads it.
    Local,
    /// An IANA zone, such as `America/New_York`.
    Named(Tz),
}

impl DayZone {
    fn format(self, at: DateTime<Utc>, pattern: &str) -> String {
        match self {
            DayZone::Local => at.with_timezone(&Local).format(pattern).to_string(),
            DayZone::Named(tz) => at.with_timezone(&tz).format(pattern).to_string(),
        }
    }

    /// The calendar day of an instant, as the YYYY-MM-DD sessions use.
    pub fn day(self, at: DateTime<Utc>) -> String {
        self.format(at, "%Y-%m-%d")
    }

    /// A clock time such as "9:05 AM".
    pub fn time_label(self, at: DateTime<Utc>) -> String {
        self.format(at, "%-I:%M %p")
    }

    /// A short date such as "Oct 5".
    pub fn date_label(self, at: DateTime<Utc>) -> String {
        self.format(at, "%b %-d")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, h, mi, s).unwrap()
    }

    const NEW_YORK: DayZone = DayZone::Named(chrono_tz::America::New_York);

    #[test]
    fn local_reads_the_machine_zone_as_before() {
        for at in [
            utc(2026, 1, 1, 0, 0, 0),
            utc(2026, 3, 8, 7, 30, 0),
            utc(2026, 7, 4, 23, 59, 59),
            utc(2026, 11, 1, 5, 30, 0),
        ] {
            let local = at.with_timezone(&Local);
            assert_eq!(DayZone::Local.day(at), local.format("%Y-%m-%d").to_string());
            assert_eq!(
                DayZone::Local.time_label(at),
                local.format("%-I:%M %p").to_string()
            );
            assert_eq!(
                DayZone::Local.date_label(at),
                local.format("%b %-d").to_string()
            );
        }
    }

    #[test]
    fn a_named_zone_dates_by_its_own_midnight() {
        // New York is UTC-5 in winter
        assert_eq!(NEW_YORK.day(utc(2026, 1, 15, 4, 59, 59)), "2026-01-14");
        assert_eq!(NEW_YORK.day(utc(2026, 1, 15, 5, 0, 0)), "2026-01-15");
        assert_eq!(NEW_YORK.time_label(utc(2026, 1, 15, 14, 5, 0)), "9:05 AM");
        assert_eq!(NEW_YORK.date_label(utc(2026, 1, 15, 14, 5, 0)), "Jan 15");
    }

    #[test]
    fn spring_forward_moves_midnight_an_hour_earlier_in_utc() {
        // 2026-03-08: 2:00 EST jumps to 3:00 EDT (07:00Z)
        assert_eq!(NEW_YORK.time_label(utc(2026, 3, 8, 6, 59, 0)), "1:59 AM");
        assert_eq!(NEW_YORK.time_label(utc(2026, 3, 8, 7, 0, 0)), "3:00 AM");
        // The 8th began at 05:00Z (EST); the 9th begins at 04:00Z (EDT)
        assert_eq!(NEW_YORK.day(utc(2026, 3, 8, 5, 0, 0)), "2026-03-08");
        assert_eq!(NEW_YORK.day(utc(2026, 3, 9, 3, 59, 59)), "2026-03-08");
        assert_eq!(NEW_YORK.day(utc(2026, 3, 9, 4, 0, 0)), "2026-03-09");
    }

    #[test]
    fn fall_back_repeats_an_hour_within_the_same_day() {
        // 2026-11-01: 2:00 EDT falls back to 1:00 EST (06:00Z), so 1:30 AM
        // happens twice, an hour apart, both on the 1st
        let first = utc(2026, 11, 1, 5, 30, 0);
        let second = utc(2026, 11, 1, 6, 30, 0);
        assert_eq!(NEW_YORK.time_label(first), "1:30 AM");
        assert_eq!(NEW_YORK.time_label(second), "1:30 AM");
        assert_eq!(NEW_YORK.day(first), "2026-11-01");
        assert_eq!(NEW_YORK.day(second), "2026-11-01");
        // The 1st began at 04:00Z (EDT); the 2nd begins at 05:00Z (EST)
        assert_eq!(NEW_YORK.day(utc(2026, 11, 1, 3, 59, 59)), "2026-10-31");
        assert_eq!(NEW_YORK.day(utc(2026, 11, 2, 4, 59, 59)), "2026-11-01");
        assert_eq!(NEW_YORK.day(utc(2026, 11, 2, 5, 0, 0)), "2026-11-02");
    }

    #[test]
    fn a_day_whose_midnight_is_skipped_starts_at_1_am() {
        // Havana springs forward at midnight: 00:00 CST becomes 01:00 CDT
        let havana = DayZone::Named(chrono_tz::America::Havana);
        assert_eq!(havana.day(utc(2026, 3, 8, 4, 59, 59)), "2026-03-07");
        let first_instant = utc(2026, 3, 8, 5, 0, 0);
        assert_eq!(havana.day(first_instant), "2026-03-08");
        assert_eq!(havana.time_label(first_instant), "1:00 AM");
    }

    #[test]
    fn southern_hemisphere_dst_runs_the_other_way() {
        // Sydney: AEST (UTC+10) until 2026-10-04 2:00, then AEDT (UTC+11)
        let sydney = DayZone::Named(chrono_tz::Australia::Sydney);
        assert_eq!(sydney.day(utc(2026, 10, 2, 13, 59, 59)), "2026-10-02");
        assert_eq!(sydney.day(utc(2026, 10, 2, 14, 0, 0)), "2026-10-03");
        assert_eq!(sydney.day(utc(2026, 10, 4, 12, 59, 59)), "2026-10-04");
        assert_eq!(sydney.day(utc(2026, 10, 4, 13, 0, 0)), "2026-10-05");
    }

    #[test]
    fn fractional_offsets_are_respected() {
        // Kolkata is UTC+5:30 all year
        let kolkata = DayZone::Named(chrono_tz::Asia::Kolkata);
        assert_eq!(kolkata.day(utc(2026, 6, 1, 18, 29, 59)), "2026-06-01");
        assert_eq!(kolkata.day(utc(2026, 6, 1, 18, 30, 0)), "2026-06-02");
        assert_eq!(kolkata.time_label(utc(2026, 6, 1, 18, 30, 0)), "12:00 AM");
    }
}
