use std::ops::Deref;
use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Settings;
use crate::passwords::Passwords;
use crate::ratelimit::RateLimits;

/// Shared by every request; cheap to clone.
#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub db: PgPool,
    pub settings: Settings,
    pub passwords: Passwords,
    pub limits: RateLimits,
}

impl AppState {
    pub fn new(db: PgPool, settings: Settings, passwords: Passwords, limits: RateLimits) -> Self {
        Self(Arc::new(Inner {
            db,
            settings,
            passwords,
            limits,
        }))
    }
}

impl Deref for AppState {
    type Target = Inner;

    fn deref(&self) -> &Inner {
        &self.0
    }
}
