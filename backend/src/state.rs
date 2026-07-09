use std::sync::Arc;

use crate::config::Config;
use crate::rate_limit::RateLimiter;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub config: Config,
    pub http: reqwest::Client,
    pub rate: Arc<RateLimiter>,
}

impl AppState {
    pub fn new(pool: sqlx::PgPool, config: Config) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            pool,
            config,
            http,
            rate: Arc::new(RateLimiter::new()),
        }
    }
}
