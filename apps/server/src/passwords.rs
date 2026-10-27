//! Password hashing: argon2id, on the blocking pool so it never stalls the
//! async workers.

use std::num::NonZeroUsize;
use std::sync::Arc;

use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::{Argon2, Params};
use tokio::sync::Semaphore;

#[derive(Clone)]
pub struct Passwords {
    argon2: Argon2<'static>,
    /// Checked when a username doesn't exist, so a miss costs as much time
    /// as a wrong password and response times don't reveal accounts.
    dummy_hash: Arc<str>,
    /// One hash at a time per CPU: more wouldn't finish sooner, and each
    /// holds its memory (19 MiB) while it runs, so a burst of sign-ins
    /// waits here instead of running the server out of memory.
    running: Arc<Semaphore>,
}

impl Passwords {
    /// The argon2 defaults: argon2id, 19 MiB, 2 passes (OWASP's baseline).
    pub fn production() -> Self {
        Self::with_params(Params::default())
    }

    /// Tests use tiny parameters; stored hashes carry their own, so either
    /// kind verifies.
    pub fn with_params(params: Params) -> Self {
        let cpus = std::thread::available_parallelism().map_or(1, NonZeroUsize::get);
        Self::limited(params, cpus)
    }

    fn limited(params: Params, at_once: usize) -> Self {
        let argon2 = Argon2::from(params);
        let dummy_hash = hash_now(&argon2, &crate::secrets::token()).into();
        Self {
            argon2,
            dummy_hash,
            running: Arc::new(Semaphore::new(at_once)),
        }
    }

    pub async fn hash(&self, password: String) -> String {
        let argon2 = self.argon2.clone();
        let _turn = self.running.acquire().await.expect("never closed");
        tokio::task::spawn_blocking(move || hash_now(&argon2, &password))
            .await
            .expect("the hashing task doesn't panic")
    }

    /// Whether `password` matches `hash`. With no hash (unknown user) it
    /// checks the dummy hash and returns false.
    pub async fn verify(&self, password: String, hash: Option<String>) -> bool {
        let argon2 = self.argon2.clone();
        let known = hash.is_some();
        let hash = hash.unwrap_or_else(|| self.dummy_hash.to_string());
        let _turn = self.running.acquire().await.expect("never closed");
        let matches = tokio::task::spawn_blocking(move || {
            argon2
                .verify_password(password.as_bytes(), hash.as_str())
                .is_ok()
        })
        .await
        .expect("the verifying task doesn't panic");
        matches && known
    }
}

fn hash_now(argon2: &Argon2<'_>, password: &str) -> String {
    argon2
        .hash_password(password.as_bytes())
        .expect("argon2 hashes any password up to 4 GiB with valid params")
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn tiny() -> Params {
        Params::new(8, 1, 1, None).unwrap()
    }

    #[tokio::test]
    async fn hashes_wait_their_turn() {
        let passwords = Passwords::limited(tiny(), 1);
        let hash = passwords.hash("first password".to_owned()).await;
        let busy = passwords.running.acquire().await.unwrap();

        let waiting = Duration::from_millis(50);
        let second = tokio::time::timeout(waiting, passwords.hash("second".to_owned()));
        assert!(second.await.is_err(), "hashed while another hash ran");
        let check = passwords.verify("first password".to_owned(), Some(hash.clone()));
        assert!(tokio::time::timeout(waiting, check).await.is_err());

        drop(busy);
        assert!(
            passwords
                .verify("first password".to_owned(), Some(hash))
                .await
        );
        assert!(Passwords::with_params(tiny()).running.available_permits() >= 1);
    }
}
