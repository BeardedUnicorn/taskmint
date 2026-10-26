//! Random secrets (session cookies, CSRF tokens, links, API tokens) and the
//! hashes they're stored under. Secrets have 256 bits of entropy, so a fast
//! hash is enough; passwords use argon2 (`passwords.rs`).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};

/// API tokens start with this, so they're recognizable in configs and logs.
pub const API_TOKEN_PREFIX: &str = "tmk_";

/// How much of an API token is kept in clear, to tell tokens apart in a list.
const SHOWN_PREFIX_LEN: usize = API_TOKEN_PREFIX.len() + 6;

/// 32 random bytes, base64url without padding (43 characters).
pub fn token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random source is available");
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn hash(secret: &str) -> Vec<u8> {
    Sha256::digest(secret.as_bytes()).to_vec()
}

pub struct ApiToken {
    pub secret: String,
    /// The start of `secret`, stored in clear.
    pub prefix: String,
    pub hash: Vec<u8>,
}

pub fn api_token() -> ApiToken {
    let secret = format!("{API_TOKEN_PREFIX}{}", token());
    ApiToken {
        prefix: secret[..SHOWN_PREFIX_LEN].to_owned(),
        hash: hash(&secret),
        secret,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_random_url_safe_and_hashed() {
        let a = token();
        assert_eq!(a.len(), 43);
        assert!(!a.contains(['+', '/', '=']));
        assert_ne!(a, token());
        assert_eq!(hash(&a).len(), 32);
        assert_eq!(hash(&a), hash(&a.clone()));
    }

    #[test]
    fn api_tokens_keep_a_short_clear_prefix() {
        let token = api_token();
        assert!(token.secret.starts_with("tmk_"));
        assert_eq!(token.prefix.len(), 10);
        assert!(token.secret.starts_with(&token.prefix));
        assert_eq!(token.hash, hash(&token.secret));
    }
}
