//! About TaskMint: its pages in the browser, its folders in the file
//! manager, and what this copy is. Shared by the webview's About dialog
//! (dispatch) and the menu bar's Help menu.

use crate::state::AppState;
use std::fs;
use taskmint_core::shell::{AppFolder, AppInfo, AppLink};

/// Opens one of TaskMint's pages in the browser.
pub fn open_link(state: &AppState, link: AppLink) -> Result<(), String> {
    state.platform.open_url(link.url())
}

/// Shows one of the app's folders in the file manager, making it first (a
/// fresh install may have written nothing there yet).
pub fn open_folder(state: &AppState, folder: AppFolder) -> Result<(), String> {
    let path = match folder {
        AppFolder::Data => state.store.dir().to_path_buf(),
        AppFolder::Logs => state.platform.log_dir()?,
    };
    fs::create_dir_all(&path).map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;
    state.platform.open_dir(&path)
}

pub fn app_info(state: &AppState) -> AppInfo {
    AppInfo {
        version: state.platform.app_version(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: state.store.dir().display().to_string(),
        log_dir: state
            .platform
            .log_dir()
            .ok()
            .map(|dir| dir.display().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::fixture;
    use taskmint_core::contract::{ISSUES_URL, REPOSITORY_URL};

    #[test]
    fn links_open_taskmints_pages() {
        let f = fixture();
        open_link(&f.state, AppLink::Issues).unwrap();
        open_link(&f.state, AppLink::Repository).unwrap();
        assert_eq!(
            f.platform.recorded().opened_urls,
            [ISSUES_URL, REPOSITORY_URL]
        );

        f.platform.fail("open_url");
        assert_eq!(
            open_link(&f.state, AppLink::Help),
            Err("open_url failed".to_string())
        );
    }

    #[test]
    fn folders_are_made_if_need_be_and_shown() {
        let f = fixture();
        let logs = f.dir.0.join("logs");
        open_folder(&f.state, AppFolder::Data).unwrap();
        assert_eq!(
            open_folder(&f.state, AppFolder::Logs),
            Err("no log folder".to_string())
        );
        f.platform.set_log_dir(&logs);
        open_folder(&f.state, AppFolder::Logs).unwrap();
        assert!(logs.is_dir());
        assert_eq!(f.platform.recorded().opened, [f.dir.0.clone(), logs]);
    }

    #[test]
    fn a_folder_that_cant_be_made_or_shown_says_so() {
        let f = fixture();
        let file = f.dir.0.join("logs");
        fs::write(&file, "not a folder").unwrap();
        f.platform.set_log_dir(&file);
        assert!(open_folder(&f.state, AppFolder::Logs)
            .unwrap_err()
            .starts_with("Failed to open"));

        f.platform.fail("open_dir");
        assert_eq!(
            open_folder(&f.state, AppFolder::Data),
            Err("open_dir failed".to_string())
        );
    }

    #[test]
    fn info_says_what_this_copy_is_and_where_its_files_are() {
        let f = fixture();
        let info = app_info(&f.state);
        assert_eq!(info.version, "1.2.3");
        assert_eq!(info.os, std::env::consts::OS);
        assert_eq!(info.arch, std::env::consts::ARCH);
        assert_eq!(info.data_dir, f.dir.0.display().to_string());
        assert_eq!(info.log_dir, None);

        f.platform.set_log_dir(&f.dir.0.join("logs"));
        assert_eq!(
            app_info(&f.state).log_dir,
            Some(f.dir.0.join("logs").display().to_string())
        );
    }
}
