//! The OS keychain as the SecretStore: the macOS Keychain, the Windows
//! Credential Manager, or the Linux kernel keyring. The OS may prompt the
//! user for it, so the coverage policy leaves it to the manual QA
//! checklist: keep it to calls.
//!
//! keyring has no Android or iOS store (it would keep secrets in memory and
//! lose them), so on a phone or tablet nothing is kept and saving one is
//! refused: the app has no server mode there.

use super::SecretStore;
#[cfg(desktop)]
use keyring::{Entry, Error};

pub struct Keychain {
    /// The app's identifier: each secret is an item of this service.
    #[cfg_attr(mobile, allow(dead_code))]
    service: String,
}

impl Keychain {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    #[cfg(desktop)]
    fn entry(&self, name: &str) -> Result<Entry, Error> {
        Entry::new(&self.service, name)
    }
}

#[cfg(desktop)]
impl SecretStore for Keychain {
    fn get(&self, name: &str) -> Result<Option<String>, String> {
        match self.entry(name).and_then(|entry| entry.get_password()) {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("The keychain couldn't be read: {}", e)),
        }
    }

    fn set(&self, name: &str, secret: &str) -> Result<(), String> {
        self.entry(name)
            .and_then(|entry| entry.set_password(secret))
            .map_err(|e| format!("The keychain couldn't be written: {}", e))
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        match self.entry(name).and_then(|entry| entry.delete_credential()) {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("The keychain item couldn't be deleted: {}", e)),
        }
    }
}

#[cfg(mobile)]
impl SecretStore for Keychain {
    fn get(&self, _name: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    fn set(&self, _name: &str, _secret: &str) -> Result<(), String> {
        Err("There's no keychain on a phone or tablet to keep a server token in.".to_string())
    }

    fn delete(&self, _name: &str) -> Result<(), String> {
        Ok(())
    }
}
