//! In-memory rate limits for the unauthenticated endpoints, keyed by client
//! IP and by (IP, username). One server instance, so memory is enough.

use std::net::IpAddr;
use std::num::NonZeroU32;

use governor::clock::Clock;
use governor::{DefaultKeyedRateLimiter, Quota, RateLimiter};

use crate::error::ApiError;

/// Requests per minute from one client to the public auth endpoints.
const PER_IP: Quota = Quota::per_minute(NonZeroU32::new(30).unwrap());
/// Sign-in attempts per minute for one username from one client.
const PER_ACCOUNT: Quota = Quota::per_minute(NonZeroU32::new(5).unwrap());
/// Above this many tracked keys, idle ones are dropped.
const MAX_KEYS: usize = 100_000;

pub struct RateLimits {
    per_ip: DefaultKeyedRateLimiter<IpAddr>,
    per_account: DefaultKeyedRateLimiter<(IpAddr, String)>,
    max_keys: usize,
}

impl RateLimits {
    pub fn production() -> Self {
        Self::new(PER_IP, PER_ACCOUNT, MAX_KEYS)
    }

    pub fn new(per_ip: Quota, per_account: Quota, max_keys: usize) -> Self {
        Self {
            per_ip: RateLimiter::keyed(per_ip),
            per_account: RateLimiter::keyed(per_account),
            max_keys,
        }
    }

    pub fn check_ip(&self, ip: IpAddr) -> Result<(), ApiError> {
        if self.per_ip.len() > self.max_keys {
            self.per_ip.retain_recent();
        }
        let ip = network(ip);
        self.per_ip
            .check_key(&ip)
            .map_err(|wait| retry_after(wait.wait_time_from(self.per_ip.clock().now())))
    }

    /// Checks the client's limit, then the limit for this username from it.
    pub fn check_account(&self, ip: IpAddr, username: &str) -> Result<(), ApiError> {
        self.check_ip(ip)?;
        if self.per_account.len() > self.max_keys {
            self.per_account.retain_recent();
        }
        let key = (network(ip), username.to_owned());
        self.per_account
            .check_key(&key)
            .map_err(|wait| retry_after(wait.wait_time_from(self.per_account.clock().now())))
    }
}

/// IPv6 clients usually control a whole /64, so that's what is limited.
fn network(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V4(_) => ip,
        IpAddr::V6(v6) => IpAddr::V6((u128::from(v6) & !(u128::from(u64::MAX))).into()),
    }
}

fn retry_after(wait: std::time::Duration) -> ApiError {
    ApiError::rate_limited(wait.as_secs() + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE_PER_HOUR: Quota = Quota::per_hour(NonZeroU32::new(1).unwrap());

    #[test]
    fn ipv6_clients_share_their_64() {
        let a: IpAddr = "2001:db8:1:2:aaaa::1".parse().unwrap();
        let b: IpAddr = "2001:db8:1:2:bbbb::2".parse().unwrap();
        assert_eq!(network(a), network(b));
        assert_eq!(network(a), "2001:db8:1:2::".parse::<IpAddr>().unwrap());
        let v4: IpAddr = "192.0.2.7".parse().unwrap();
        assert_eq!(network(v4), v4);

        let limits = RateLimits::new(ONE_PER_HOUR, ONE_PER_HOUR, 10);
        limits.check_ip(a).unwrap();
        assert!(limits.check_ip(b).is_err());
        // The client limit applies before the username's.
        assert!(limits.check_account(b, "alice").is_err());
    }

    #[test]
    fn account_limits_are_per_username_and_bounded_in_memory() {
        let ip: IpAddr = "192.0.2.7".parse().unwrap();
        let limits = RateLimits::new(
            Quota::per_hour(NonZeroU32::new(100).unwrap()),
            ONE_PER_HOUR,
            0,
        );
        limits.check_account(ip, "alice").unwrap();
        limits.check_account(ip, "bob").unwrap();
        // Over max_keys, so idle keys are dropped first; alice's isn't idle.
        assert!(limits.check_account(ip, "alice").is_err());
        assert!(limits.per_account.len() <= 2);
    }

    #[test]
    fn production_limits_allow_a_burst() {
        let limits = RateLimits::production();
        let ip: IpAddr = "192.0.2.7".parse().unwrap();
        for _ in 0..5 {
            limits.check_account(ip, "alice").unwrap();
        }
        assert!(limits.check_account(ip, "alice").is_err());
    }
}
