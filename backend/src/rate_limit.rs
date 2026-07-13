use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::AppError;

const DEFAULT_MAX_BUCKETS: usize = 10_000;
const CLEANUP_INTERVAL: usize = 256;

struct Bucket {
    events: VecDeque<Instant>,
    window: Duration,
}

struct RateLimitState {
    buckets: HashMap<(String, String), Bucket>,
    checks_since_cleanup: usize,
}

pub struct RateLimiter {
    inner: Mutex<RateLimitState>,
    max_buckets: usize,
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::with_max_buckets(DEFAULT_MAX_BUCKETS)
    }

    fn with_max_buckets(max_buckets: usize) -> Self {
        Self {
            inner: Mutex::new(RateLimitState {
                buckets: HashMap::new(),
                checks_since_cleanup: 0,
            }),
            max_buckets,
        }
    }

    pub fn check(&self, ip: &str, key: &str, max: usize, window_secs: u64) -> Result<(), AppError> {
        let now = Instant::now();
        let window = Duration::from_secs(window_secs);
        let map_key = (ip.to_string(), key.to_string());

        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());

        guard.checks_since_cleanup += 1;
        let is_new_bucket = !guard.buckets.contains_key(&map_key);
        if guard.checks_since_cleanup >= CLEANUP_INTERVAL
            || (is_new_bucket && guard.buckets.len() >= self.max_buckets)
        {
            guard.buckets.retain(|_, bucket| {
                bucket
                    .events
                    .back()
                    .is_some_and(|last| now.saturating_duration_since(*last) < bucket.window)
            });
            guard.checks_since_cleanup = 0;
        }
        if !guard.buckets.contains_key(&map_key) && guard.buckets.len() >= self.max_buckets {
            return Err(AppError::RateLimited);
        }

        let bucket = guard.buckets.entry(map_key).or_insert_with(|| Bucket {
            events: VecDeque::new(),
            window,
        });
        bucket.window = window;
        while let Some(front) = bucket.events.front() {
            if now.duration_since(*front) >= window {
                bucket.events.pop_front();
            } else {
                break;
            }
        }
        if bucket.events.len() >= max {
            return Err(AppError::RateLimited);
        }
        bucket.events.push_back(now);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_events_within_window() {
        let limiter = RateLimiter::new();
        assert!(limiter.check("127.0.0.1", "login", 1, 60).is_ok());
        assert!(matches!(
            limiter.check("127.0.0.1", "login", 1, 60),
            Err(AppError::RateLimited)
        ));
    }

    #[test]
    fn caps_buckets_and_reclaims_expired_entries() {
        let limiter = RateLimiter::with_max_buckets(2);
        assert!(limiter.check("192.0.2.1", "login", 1, 0).is_ok());
        assert!(limiter.check("192.0.2.2", "login", 1, 60).is_ok());
        assert!(limiter.check("192.0.2.3", "login", 1, 60).is_ok());
        assert!(matches!(
            limiter.check("192.0.2.4", "login", 1, 60),
            Err(AppError::RateLimited)
        ));
    }
}
