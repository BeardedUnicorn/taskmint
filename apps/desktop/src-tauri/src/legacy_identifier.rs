//! TaskMint's identifier was `com.taskmint.app` until 2.1, when it became
//! `com.taskmint.desktop` (one ending in `.app` clashes with the macOS bundle
//! extension). The OS keeps the data folder, the webview's storage (where the
//! settings live) and the keychain items under the identifier, so the first
//! launch with the new one moves them over. A folder moves only when the old
//! one is there and the new one isn't, so it happens once.

use crate::platform::SecretStore;
use crate::server::TOKEN_SECRET;
use std::fs;
use std::path::{Path, PathBuf};

/// The identifier TaskMint had before 2.1.
pub const LEGACY_IDENTIFIER: &str = "com.taskmint.app";

/// The platforms whose folders move.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    MacOs,
    Windows,
    /// Linux isn't bundled, and its log folder (written before setup runs)
    /// sits inside the data folder, so there's nothing to move there.
    Other,
}

/// The OS's base folders, which each app's folders sit in.
pub struct Dirs {
    pub home: PathBuf,
    pub data: PathBuf,
    pub local_data: PathBuf,
}

/// The folders to move, each as (old, new): the data folder first, then the
/// webview's storage.
pub fn folders(os: Os, dirs: &Dirs, identifier: &str) -> Vec<(PathBuf, PathBuf)> {
    let data = (
        dirs.data.join(LEGACY_IDENTIFIER),
        dirs.data.join(identifier),
    );
    match os {
        Os::MacOs => {
            let webkit = dirs.home.join("Library").join("WebKit");
            vec![
                data,
                (webkit.join(LEGACY_IDENTIFIER), webkit.join(identifier)),
            ]
        }
        // WebView2's folder is inside the local data folder, next to the logs
        Os::Windows => vec![
            data,
            (
                dirs.local_data.join(LEGACY_IDENTIFIER).join("EBWebView"),
                dirs.local_data.join(identifier).join("EBWebView"),
            ),
        ],
        Os::Other => Vec::new(),
    }
}

/// Renames `from` to `to` when `from` is there and `to` isn't (both there
/// means the old version ran again since; that's left alone). Whether it
/// moved.
pub fn move_folder(from: &Path, to: &Path) -> Result<bool, String> {
    if !from.exists() {
        return Ok(false);
    }
    if to.exists() {
        log::warn!(
            "Not moving {} to {}: both are there",
            from.display(),
            to.display()
        );
        return Ok(false);
    }
    to.parent()
        .map_or(Ok(()), fs::create_dir_all)
        .and_then(|()| fs::rename(from, to))
        .map_err(|e| {
            format!(
                "Couldn't move {} to {}: {}",
                from.display(),
                to.display(),
                e
            )
        })?;
    log::info!("Moved {} to {}", from.display(), to.display());
    Ok(true)
}

/// Moves the secret `name` from one store to the other, unless the other
/// already has one. Whether it moved.
pub fn move_secret(
    from: &dyn SecretStore,
    to: &dyn SecretStore,
    name: &str,
) -> Result<bool, String> {
    if to.get(name)?.is_some() {
        return Ok(false);
    }
    let Some(secret) = from.get(name)? else {
        return Ok(false);
    };
    to.set(name, &secret).and_then(|()| from.delete(name))?;
    Ok(true)
}

/// Moves what the legacy identifier left behind: the folders, then, when the
/// data folder moved, the server token (so the keychain is only read when
/// there could be one). Errors are logged: the app starts either way.
pub fn run(
    os: Os,
    dirs: &Dirs,
    identifier: &str,
    legacy_secrets: &dyn SecretStore,
    secrets: &dyn SecretStore,
) {
    let moved: Vec<bool> = folders(os, dirs, identifier)
        .iter()
        .map(|(from, to)| {
            move_folder(from, to).unwrap_or_else(|e| {
                log::error!("{}", e);
                false
            })
        })
        .collect();
    if moved.first() != Some(&true) {
        return;
    }
    match move_secret(legacy_secrets, secrets, TOKEN_SECRET) {
        Ok(true) => log::info!("Moved the server token to the new keychain item"),
        Ok(false) => {}
        Err(e) => log::error!("Couldn't move the server token: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::fake::MemorySecrets;
    use crate::store::json_file::tests::TempDir;
    use std::collections::HashMap;
    use std::sync::Mutex;

    const ID: &str = "com.taskmint.desktop";

    fn dirs(root: &Path) -> Dirs {
        Dirs {
            home: root.join("home"),
            data: root.join("data"),
            local_data: root.join("local"),
        }
    }

    /// A folder with one file in it.
    fn folder_with_file(dir: &Path, file: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(file), file).unwrap();
    }

    /// A keychain whose calls of the named kinds fail.
    #[derive(Default)]
    struct Secrets {
        items: Mutex<HashMap<String, String>>,
        failing: Vec<&'static str>,
    }

    impl Secrets {
        fn failing(calls: &[&'static str]) -> Self {
            Self {
                failing: calls.to_vec(),
                ..Self::default()
            }
        }

        fn check(&self, call: &str) -> Result<(), String> {
            match self.failing.contains(&call) {
                true => Err(format!("{} failed", call)),
                false => Ok(()),
            }
        }
    }

    impl SecretStore for Secrets {
        fn get(&self, name: &str) -> Result<Option<String>, String> {
            self.check("get")?;
            Ok(self.items.lock().unwrap().get(name).cloned())
        }

        fn set(&self, name: &str, secret: &str) -> Result<(), String> {
            self.check("set")?;
            self.items
                .lock()
                .unwrap()
                .insert(name.to_string(), secret.to_string());
            Ok(())
        }

        fn delete(&self, name: &str) -> Result<(), String> {
            self.check("delete")?;
            self.items.lock().unwrap().remove(name);
            Ok(())
        }
    }

    #[test]
    fn macos_moves_the_data_folder_and_the_webkit_storage() {
        let d = dirs(Path::new("/r"));
        assert_eq!(
            folders(Os::MacOs, &d, ID),
            vec![
                (
                    PathBuf::from("/r/data/com.taskmint.app"),
                    PathBuf::from("/r/data/com.taskmint.desktop")
                ),
                (
                    PathBuf::from("/r/home/Library/WebKit/com.taskmint.app"),
                    PathBuf::from("/r/home/Library/WebKit/com.taskmint.desktop")
                ),
            ]
        );
    }

    #[test]
    fn windows_moves_the_data_folder_and_the_webview2_folder() {
        let d = dirs(Path::new("/r"));
        assert_eq!(
            folders(Os::Windows, &d, ID),
            vec![
                (
                    PathBuf::from("/r/data/com.taskmint.app"),
                    PathBuf::from("/r/data/com.taskmint.desktop")
                ),
                (
                    PathBuf::from("/r/local/com.taskmint.app/EBWebView"),
                    PathBuf::from("/r/local/com.taskmint.desktop/EBWebView")
                ),
            ]
        );
    }

    #[test]
    fn other_platforms_move_nothing() {
        assert!(folders(Os::Other, &dirs(Path::new("/r")), ID).is_empty());
    }

    #[test]
    fn a_folder_moves_with_its_contents_and_its_new_parent_is_made() {
        let root = TempDir::new("legacy-move");
        let (from, to) = (root.0.join("old"), root.0.join("new/parent/here"));
        folder_with_file(&from, "sessions.json");
        assert_eq!(move_folder(&from, &to), Ok(true));
        assert!(!from.exists());
        assert_eq!(
            fs::read_to_string(to.join("sessions.json")).unwrap(),
            "sessions.json"
        );
    }

    #[test]
    fn nothing_moves_without_an_old_folder() {
        let root = TempDir::new("legacy-none");
        let to = root.0.join("new");
        assert_eq!(move_folder(&root.0.join("old"), &to), Ok(false));
        assert!(!to.exists());
    }

    #[test]
    fn nothing_moves_when_both_folders_are_there() {
        let root = TempDir::new("legacy-both");
        let (from, to) = (root.0.join("old"), root.0.join("new"));
        folder_with_file(&from, "old.json");
        folder_with_file(&to, "new.json");
        assert_eq!(move_folder(&from, &to), Ok(false));
        assert!(from.join("old.json").exists());
        assert!(!to.join("old.json").exists());
    }

    #[test]
    fn a_move_that_fails_says_which_folders() {
        let root = TempDir::new("legacy-fails");
        let from = root.0.join("old");
        folder_with_file(&from, "old.json");
        // The new folder's parent is a file, so it can't be made
        fs::write(root.0.join("file"), "").unwrap();
        let to = root.0.join("file/new");
        let error = move_folder(&from, &to).unwrap_err();
        assert!(error.starts_with(&format!(
            "Couldn't move {} to {}: ",
            from.display(),
            to.display()
        )));
        assert!(from.join("old.json").exists());
    }

    #[test]
    fn a_secret_moves_to_the_new_store() {
        let (old, new) = (MemorySecrets::default(), MemorySecrets::default());
        old.set("token", "secret").unwrap();
        assert_eq!(move_secret(&old, &new, "token"), Ok(true));
        assert_eq!(new.get("token"), Ok(Some("secret".to_string())));
        assert_eq!(old.get("token"), Ok(None));
    }

    #[test]
    fn a_secret_already_in_the_new_store_stays() {
        let (old, new) = (MemorySecrets::default(), MemorySecrets::default());
        old.set("token", "old").unwrap();
        new.set("token", "new").unwrap();
        assert_eq!(move_secret(&old, &new, "token"), Ok(false));
        assert_eq!(new.get("token"), Ok(Some("new".to_string())));
        assert_eq!(old.get("token"), Ok(Some("old".to_string())));
    }

    #[test]
    fn no_secret_moves_nothing() {
        let (old, new) = (MemorySecrets::default(), MemorySecrets::default());
        assert_eq!(move_secret(&old, &new, "token"), Ok(false));
        assert_eq!(new.get("token"), Ok(None));
    }

    #[test]
    fn each_keychain_failure_is_returned() {
        let filled = |store: Secrets| {
            store
                .items
                .lock()
                .unwrap()
                .insert("token".to_string(), "secret".to_string());
            store
        };
        let cases = [
            // The new store can't be read
            (Secrets::default(), Secrets::failing(&["get"]), "get failed"),
            // The old one can't be read
            (Secrets::failing(&["get"]), Secrets::default(), "get failed"),
            // The new one can't be written
            (
                filled(Secrets::default()),
                Secrets::failing(&["set"]),
                "set failed",
            ),
            // The old one can't be cleared
            (
                filled(Secrets::failing(&["delete"])),
                Secrets::default(),
                "delete failed",
            ),
        ];
        for (old, new, error) in cases {
            assert_eq!(move_secret(&old, &new, "token"), Err(error.to_string()));
        }
        // and with nothing failing, it moves
        let (old, new) = (filled(Secrets::default()), Secrets::default());
        assert_eq!(move_secret(&old, &new, "token"), Ok(true));
        assert_eq!(old.get("token"), Ok(None));
    }

    #[test]
    fn a_run_moves_the_folders_and_then_the_token() {
        let root = TempDir::new("legacy-run");
        let d = dirs(&root.0);
        folder_with_file(&d.data.join(LEGACY_IDENTIFIER), "sessions.json");
        folder_with_file(
            &d.home.join("Library/WebKit").join(LEGACY_IDENTIFIER),
            "localstorage.sqlite3",
        );
        let (old, new) = (MemorySecrets::default(), MemorySecrets::default());
        old.set(TOKEN_SECRET, "secret").unwrap();

        run(Os::MacOs, &d, ID, &old, &new);

        assert!(d.data.join(ID).join("sessions.json").exists());
        assert!(d
            .home
            .join("Library/WebKit")
            .join(ID)
            .join("localstorage.sqlite3")
            .exists());
        assert_eq!(new.get(TOKEN_SECRET), Ok(Some("secret".to_string())));
        assert_eq!(old.get(TOKEN_SECRET), Ok(None));
    }

    #[test]
    fn a_run_without_a_token_moves_only_the_folders() {
        let root = TempDir::new("legacy-no-token");
        let d = dirs(&root.0);
        folder_with_file(&d.data.join(LEGACY_IDENTIFIER), "sessions.json");
        let new = MemorySecrets::default();

        run(Os::MacOs, &d, ID, &MemorySecrets::default(), &new);

        assert!(d.data.join(ID).join("sessions.json").exists());
        assert_eq!(new.get(TOKEN_SECRET), Ok(None));
    }

    #[test]
    fn a_run_with_nothing_to_move_leaves_the_keychain_alone() {
        let root = TempDir::new("legacy-stays");
        let (old, new) = (MemorySecrets::default(), MemorySecrets::default());
        old.set(TOKEN_SECRET, "secret").unwrap();

        run(Os::MacOs, &dirs(&root.0), ID, &old, &new);

        assert_eq!(old.get(TOKEN_SECRET), Ok(Some("secret".to_string())));
        assert_eq!(new.get(TOKEN_SECRET), Ok(None));
    }

    #[test]
    fn a_run_logs_what_fails_and_carries_on() {
        let root = TempDir::new("legacy-logged");
        let d = dirs(&root.0);
        folder_with_file(&d.data.join(LEGACY_IDENTIFIER), "sessions.json");
        folder_with_file(
            &d.local_data.join(LEGACY_IDENTIFIER).join("EBWebView"),
            "Local State",
        );
        // The WebView2 folder's new parent is a file, so that move fails
        fs::write(d.local_data.join(ID), "").unwrap();
        // and so does the token's: the old keychain can't be read
        let (old, new) = (Secrets::failing(&["get"]), MemorySecrets::default());

        run(Os::Windows, &d, ID, &old, &new);

        assert!(d.data.join(ID).join("sessions.json").exists());
        assert!(d
            .local_data
            .join(LEGACY_IDENTIFIER)
            .join("EBWebView/Local State")
            .exists());
        assert_eq!(new.get(TOKEN_SECRET), Ok(None));
    }
}
