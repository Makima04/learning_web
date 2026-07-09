use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::AppError;

/// Fixed-window rate limiter: key = (ip, bucket).
pub struct RateLimiter {
    inner: Mutex<HashMap<(String, String), VecDeque<Instant>>>,
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Allow at most `max` events per `window_secs` for `(ip, key)`.
    pub fn check(&self, ip: &str, key: &str, max: usize, window_secs: u64) -> Result<(), AppError> {
        let now = Instant::now();
        let window = Duration::from_secs(window_secs);
        let map_key = (ip.to_string(), key.to_string());

        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        let q = guard.entry(map_key).or_default();
        while let Some(front) = q.front() {
            if now.duration_since(*front) >= window {
                q.pop_front();
            } else {
                break;
            }
        }
        if q.len() >= max {
            return Err(AppError::RateLimited);
        }
        q.push_back(now);
        Ok(())
    }
}
