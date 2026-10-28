//! The OS keychain as the SecretStore: the macOS Keychain, the Windows
//! Credential Manager, or the Linux kernel keyring. The OS may prompt the
//! user for it, so the coverage policy leaves it to the manual QA
//! checklist: keep it to calls.

use super::SecretStore;
use keyring::{Entry, Error};

pub struct Keychain {
    /// The app's identifier: each secret is an item of this service.
    service: String,
}

impl Keychain {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, name: &str) -> Result<Entry, Error> {
        Entry::new(&self.service, name)
    }
}

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
