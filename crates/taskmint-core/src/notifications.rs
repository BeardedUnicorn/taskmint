//! Which OS notifications the user allows. Hosts show them; this decides.

use serde::{Deserialize, Serialize};

/// What a notification is about (camelCase, as the frontend sends it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
    General,
    GoalMilestone,
    LongRun,
    IdlePause,
    WorkLogCapture,
    BackupFailure,
    BackupSuccess,
    DailySummary,
    Error,
    /// Settings' "Send test notification": always shown.
    Test,
}

/// The user's choices (camelCase; missing fields keep their defaults, unknown
/// ones such as the summary time are ignored). Until the app sends them, the
/// defaults keep reminders working.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationPrefs {
    pub desktop_enabled: bool,
    pub sound: bool,
    pub goal_milestones: bool,
    pub long_run_reminder: bool,
    pub idle_pause: bool,
    pub work_log_capture: bool,
    pub backup_failure: bool,
    pub backup_success: bool,
    pub daily_summary: bool,
    pub errors_while_away: bool,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            desktop_enabled: true,
            sound: false,
            goal_milestones: true,
            long_run_reminder: true,
            idle_pause: true,
            work_log_capture: true,
            backup_failure: true,
            backup_success: false,
            daily_summary: true,
            errors_while_away: true,
        }
    }
}

impl NotificationPrefs {
    /// Whether a notification of `kind` may be shown.
    pub fn allows(&self, kind: NotificationKind) -> bool {
        if kind == NotificationKind::Test {
            return true;
        }
        if !self.desktop_enabled {
            return false;
        }
        match kind {
            NotificationKind::General | NotificationKind::Test => true,
            NotificationKind::GoalMilestone => self.goal_milestones,
            NotificationKind::LongRun => self.long_run_reminder,
            NotificationKind::IdlePause => self.idle_pause,
            NotificationKind::WorkLogCapture => self.work_log_capture,
            NotificationKind::BackupFailure => self.backup_failure,
            NotificationKind::BackupSuccess => self.backup_success,
            NotificationKind::DailySummary => self.daily_summary,
            NotificationKind::Error => self.errors_while_away,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_keep_reminders_and_failures_but_not_backup_successes() {
        let prefs = NotificationPrefs::default();
        assert!(prefs.allows(NotificationKind::LongRun));
        assert!(prefs.allows(NotificationKind::IdlePause));
        assert!(prefs.allows(NotificationKind::BackupFailure));
        assert!(!prefs.allows(NotificationKind::BackupSuccess));
        assert!(!prefs.sound);
    }

    #[test]
    fn each_category_follows_its_own_switch() {
        let prefs = NotificationPrefs {
            long_run_reminder: false,
            ..NotificationPrefs::default()
        };
        assert!(!prefs.allows(NotificationKind::LongRun));
        assert!(prefs.allows(NotificationKind::IdlePause));
    }

    #[test]
    fn the_master_switch_silences_everything_but_the_test() {
        let prefs = NotificationPrefs {
            desktop_enabled: false,
            ..NotificationPrefs::default()
        };
        assert!(!prefs.allows(NotificationKind::GoalMilestone));
        assert!(!prefs.allows(NotificationKind::General));
        assert!(prefs.allows(NotificationKind::Test));
    }

    #[test]
    fn a_partial_payload_keeps_the_other_defaults() {
        let prefs: NotificationPrefs =
            serde_json::from_str(r#"{"sound": true, "dailySummaryTime": "18:30"}"#).unwrap();
        assert!(prefs.sound);
        assert!(prefs.desktop_enabled);
        assert!(!prefs.backup_success);
    }

    #[test]
    fn kinds_use_the_frontends_names() {
        let kind: NotificationKind = serde_json::from_str(r#""workLogCapture""#).unwrap();
        assert_eq!(kind, NotificationKind::WorkLogCapture);
        assert_eq!(
            serde_json::to_string(&NotificationKind::IdlePause).unwrap(),
            r#""idlePause""#
        );
    }

    #[test]
    fn every_kind_is_allowed_while_its_switch_is_on() {
        let prefs = NotificationPrefs {
            backup_success: true,
            ..NotificationPrefs::default()
        };
        for kind in [
            NotificationKind::General,
            NotificationKind::GoalMilestone,
            NotificationKind::LongRun,
            NotificationKind::IdlePause,
            NotificationKind::WorkLogCapture,
            NotificationKind::BackupFailure,
            NotificationKind::BackupSuccess,
            NotificationKind::DailySummary,
            NotificationKind::Error,
            NotificationKind::Test,
        ] {
            assert!(prefs.allows(kind), "{:?}", kind);
        }
    }
}
