//! A phone's updates. The Android app isn't in a store, so it reads the same
//! release feed as a desktop's updater (latest.json) and, for a newer
//! version, downloads that release's APK in the browser for the user to
//! install (Android asks first). The decisions are here; fetching the feed
//! and opening the browser are platform/os.rs's.

use crate::platform::AvailableUpdate;
use serde::Deserialize;
use taskmint_core::contract::RELEASES_URL;

/// The parts of latest.json a phone reads.
#[derive(Debug, Deserialize)]
struct Feed {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
}

/// A version's numbers ("4.4.1", or "v4.4.1"); None for anything else.
fn numbers(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.trim_start_matches('v').split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let found = (next()?, next()?, next()?);
    parts.next().is_none().then_some(found)
}

/// The release the feed announces, if it's newer than `current`.
pub fn newer(feed: &str, current: &str) -> Result<Option<AvailableUpdate>, String> {
    let feed: Feed = serde_json::from_str(feed)
        .map_err(|error| format!("the release feed couldn't be read ({})", error))?;
    let latest = numbers(&feed.version).ok_or_else(|| {
        format!(
            "the release feed names no version TaskMint knows ({})",
            feed.version
        )
    })?;
    let running =
        numbers(current).ok_or_else(|| format!("this version ({}) can't be compared", current))?;
    let version = feed.version.trim_start_matches('v').to_string();
    Ok((latest > running).then(|| AvailableUpdate {
        version,
        current_version: current.to_string(),
        notes: feed.notes,
        date: feed.pub_date,
    }))
}

/// Where a release's APK downloads from (scripts/release/lib.mjs names it).
pub fn download_url(version: &str) -> String {
    format!(
        "{}/download/v{}/TaskMint-{}-android-arm64.apk",
        RELEASES_URL, version, version
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn feed(version: &str) -> String {
        json!({
            "version": version,
            "notes": "### Added\n- Widgets",
            "pub_date": "2026-11-20T10:00:00Z",
            "platforms": { "darwin-aarch64": { "url": "x", "signature": "y" } }
        })
        .to_string()
    }

    #[test]
    fn a_newer_release_is_announced_with_its_notes() {
        assert_eq!(
            newer(&feed("4.5.0"), "4.4.1"),
            Ok(Some(AvailableUpdate {
                version: "4.5.0".to_string(),
                current_version: "4.4.1".to_string(),
                notes: Some("### Added\n- Widgets".to_string()),
                date: Some("2026-11-20T10:00:00Z".to_string()),
            }))
        );
        // A tag-style version, and a newer major with smaller minor numbers
        assert_eq!(
            newer(&feed("v4.4.2"), "4.4.1").unwrap().unwrap().version,
            "4.4.2"
        );
        assert!(newer(&feed("5.0.0"), "4.12.3").unwrap().is_some());
    }

    #[test]
    fn the_same_or_an_older_release_is_nothing_to_do() {
        assert_eq!(newer(&feed("4.4.1"), "4.4.1"), Ok(None));
        assert_eq!(newer(&feed("4.3.9"), "4.4.1"), Ok(None));
        // Notes and a date are optional
        assert_eq!(newer(r#"{"version":"4.4.1"}"#, "4.4.1"), Ok(None));
    }

    #[test]
    fn a_feed_or_version_it_cant_read_is_an_error() {
        assert!(newer("not json", "4.4.1")
            .unwrap_err()
            .starts_with("the release feed couldn't be read"));
        assert_eq!(
            newer(&feed("4.5"), "4.4.1"),
            Err("the release feed names no version TaskMint knows (4.5)".to_string())
        );
        assert!(newer(&feed("4.5.0.1"), "4.4.1").is_err());
        assert!(newer(&feed("4.x.0"), "4.4.1").is_err());
        assert_eq!(
            newer(&feed("4.5.0"), "dev"),
            Err("this version (dev) can't be compared".to_string())
        );
    }

    #[test]
    fn the_apk_downloads_from_its_release() {
        assert_eq!(
            download_url("4.5.0"),
            "https://github.com/BeardedUnicorn/taskmint/releases/download/v4.5.0/TaskMint-4.5.0-android-arm64.apk"
        );
    }
}
