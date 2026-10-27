use std::ops::Deref;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use crate::config::Settings;
use crate::events::EventHub;
use crate::passwords::Passwords;
use crate::ratelimit::RateLimits;

/// The time commands run at: `Utc::now` when serving, a fixed one in tests.
pub type Clock = Arc<dyn Fn() -> DateTime<Utc> + Send + Sync>;

/// Shared by every request; cheap to clone.
#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub db: PgPool,
    pub settings: Settings,
    pub passwords: Passwords,
    pub limits: RateLimits,
    pub events: EventHub,
    pub clock: Clock,
}

impl AppState {
    pub fn new(
        db: PgPool,
        settings: Settings,
        passwords: Passwords,
        limits: RateLimits,
        clock: Clock,
    ) -> Self {
        Self(Arc::new(Inner {
            db,
            settings,
            passwords,
            limits,
            events: EventHub::default(),
            clock,
        }))
    }
}

impl Deref for AppState {
    type Target = Inner;

    fn deref(&self) -> &Inner {
        &self.0
    }
}
