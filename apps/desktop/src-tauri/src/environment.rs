//! Which TaskMint this build is: production (a release, the installed app)
//! or dev (every other build). build.rs takes it from TASKMINT_ENV
//! (scripts/environment.mjs), the same variable that picks the webview's
//! Firebase project, so the two always agree.
//!
//! A dev build installs beside the real app: tauri.conf.json gives it its
//! own identifier (so its own data folder, webview storage and
//! single-instance lock) and link scheme, and it listens for captures on its
//! own port, so the real extension's captures never reach it.
//! tauri.production.conf.json turns a build back into the real app, and
//! scripts/release.mjs is what applies it.

use taskmint_core::contract::{CAPTURE_SERVER_PORT, DEEP_LINK_SCHEME, UPDATE_FEED_URL};

/// The installed app's identifier (tauri.production.conf.json).
pub const PRODUCTION_IDENTIFIER: &str = "com.taskmint.desktop";
/// A dev build's (tauri.conf.json).
pub const DEV_IDENTIFIER: &str = "com.taskmint.desktop.dev";
/// Where a dev build listens for captures: the extension only knows
/// production's.
pub const DEV_CAPTURE_SERVER_PORT: u16 = 43127;
/// A dev build's links (tauri.conf.json registers it).
pub const DEV_DEEP_LINK_SCHEME: &str = "taskmint-dev";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Production,
    Dev,
}

impl Environment {
    /// This build's.
    pub fn current() -> Environment {
        Environment::named(env!("TASKMINT_ENV"))
    }

    /// build.rs refuses any name but these two.
    fn named(name: &str) -> Environment {
        if name == "production" {
            Environment::Production
        } else {
            Environment::Dev
        }
    }

    /// The port the capture server listens on.
    pub fn capture_port(self) -> u16 {
        match self {
            Environment::Production => CAPTURE_SERVER_PORT,
            Environment::Dev => DEV_CAPTURE_SERVER_PORT,
        }
    }

    /// The scheme of the links the app answers (taskmint://open and the
    /// captures).
    pub fn deep_link_scheme(self) -> &'static str {
        match self {
            Environment::Production => DEEP_LINK_SCHEME,
            Environment::Dev => DEV_DEEP_LINK_SCHEME,
        }
    }

    /// Whether a build of this environment may run as the app with
    /// `identifier`. A production build has to be the installed app, and a
    /// dev build must never be it: either mix would sync one Firebase
    /// project's account into the other's data.
    pub fn check_identifier(self, identifier: &str) -> Result<(), String> {
        match self {
            Environment::Production if identifier != PRODUCTION_IDENTIFIER => Err(format!(
                "This production build (TASKMINT_ENV=production) is {identifier}, not \
                 {PRODUCTION_IDENTIFIER}: build it with --config src-tauri/tauri.production.conf.json, \
                 as scripts/release.mjs does."
            )),
            Environment::Dev if identifier == PRODUCTION_IDENTIFIER => Err(format!(
                "This dev build is {PRODUCTION_IDENTIFIER}, the installed app: build it with \
                 TASKMINT_ENV=production, or without tauri.production.conf.json."
            )),
            _ => Ok(()),
        }
    }

    /// Whether it takes over what TaskMint left under its pre-2.1
    /// identifier: only the real app does.
    pub fn moves_legacy_folders(self) -> bool {
        self == Environment::Production
    }

    /// Where a phone looks for a newer release: only the real app does (a
    /// desktop's updater reads the same feed from tauri.production.conf.json).
    pub fn update_feed(self) -> Option<&'static str> {
        match self {
            Environment::Production => Some(UPDATE_FEED_URL),
            Environment::Dev => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn config(json: &str) -> Value {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_build_is_dev_unless_made_for_production() {
        assert_eq!(Environment::named("production"), Environment::Production);
        assert_eq!(Environment::named("dev"), Environment::Dev);
        // Tests are built as dev (TASKMINT_ENV unset)
        assert_eq!(Environment::current(), Environment::Dev);
    }

    #[test]
    fn dev_has_its_own_port_and_scheme() {
        assert_eq!(Environment::Production.capture_port(), 43117);
        assert_eq!(Environment::Production.deep_link_scheme(), "taskmint");
        assert_eq!(Environment::Dev.capture_port(), 43127);
        assert_eq!(Environment::Dev.deep_link_scheme(), "taskmint-dev");
    }

    #[test]
    fn each_build_runs_only_as_its_own_app() {
        assert_eq!(
            Environment::Production.check_identifier(PRODUCTION_IDENTIFIER),
            Ok(())
        );
        assert!(Environment::Production
            .check_identifier(DEV_IDENTIFIER)
            .unwrap_err()
            .contains("tauri.production.conf.json"));
        assert_eq!(Environment::Dev.check_identifier(DEV_IDENTIFIER), Ok(()));
        // A test build of its own (the update test) is dev too
        assert_eq!(
            Environment::Dev.check_identifier("com.taskmint.updatetest"),
            Ok(())
        );
        assert!(Environment::Dev
            .check_identifier(PRODUCTION_IDENTIFIER)
            .unwrap_err()
            .contains("TASKMINT_ENV=production"));
    }

    #[test]
    fn only_the_real_app_checks_for_updates() {
        assert_eq!(Environment::Production.update_feed(), Some(UPDATE_FEED_URL));
        assert_eq!(Environment::Dev.update_feed(), None);
    }

    #[test]
    fn only_the_real_app_takes_the_old_folders() {
        assert!(Environment::Production.moves_legacy_folders());
        assert!(!Environment::Dev.moves_legacy_folders());
    }

    #[test]
    fn the_tauri_configs_match() {
        let base = config(include_str!("../tauri.conf.json"));
        let production = config(include_str!("../tauri.production.conf.json"));
        let scheme = |config: &Value| config["plugins"]["deep-link"]["desktop"]["schemes"].clone();

        assert_eq!(base["identifier"], DEV_IDENTIFIER);
        assert_eq!(base["productName"], "TaskMint Dev");
        assert_eq!(scheme(&base), serde_json::json!([DEV_DEEP_LINK_SCHEME]));
        // A dev build has no update feed
        assert_eq!(
            base["plugins"]["updater"]["endpoints"],
            serde_json::json!([])
        );

        assert_eq!(production["identifier"], PRODUCTION_IDENTIFIER);
        assert_eq!(production["productName"], "TaskMint");
        assert_eq!(scheme(&production), serde_json::json!([DEEP_LINK_SCHEME]));
        // The phone's feed is the desktop's
        assert_eq!(
            production["plugins"]["updater"]["endpoints"],
            serde_json::json!([UPDATE_FEED_URL])
        );
    }
}
