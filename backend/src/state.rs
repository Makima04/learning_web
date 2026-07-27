use std::sync::Arc;

use tokio::sync::RwLock;

use crate::config::Config;
use crate::rate_limit::RateLimiter;

/// 可热更新的 LLM 网关凭据（url + key）。
/// 默认模型名仍走 DB `active_llm_model` + 启动 conf.llm_model。
#[derive(Clone, Debug, Default)]
pub struct LlmRuntime {
    pub url: String,
    pub key: String,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    /// 启动时静态配置（DB/host/mail 等）；llm_url/key 以 llm_rt 为准。
    pub config: Config,
    pub http: reqwest::Client,
    pub rate: Arc<RateLimiter>,
    /// 运行时 LLM url/key（管理员可改，写 DB + 内存）。
    pub llm_rt: Arc<RwLock<LlmRuntime>>,
}

impl AppState {
    pub fn new(pool: sqlx::PgPool, config: Config, llm_rt: LlmRuntime) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            pool,
            config,
            http,
            rate: Arc::new(RateLimiter::new()),
            llm_rt: Arc::new(RwLock::new(llm_rt)),
        }
    }

    /// 供 llm 调用：合并静态 conf + 当前 runtime url/key。
    pub async fn llm_config(&self) -> Config {
        let rt = self.llm_rt.read().await;
        let mut c = self.config.clone();
        c.llm_url = rt.url.clone();
        c.llm_key = rt.key.clone();
        c
    }

    pub async fn llm_configured(&self) -> bool {
        let rt = self.llm_rt.read().await;
        !rt.url.is_empty() && !rt.key.is_empty()
    }

    pub async fn set_llm_runtime(&self, url: Option<String>, key: Option<String>) {
        let mut rt = self.llm_rt.write().await;
        if let Some(u) = url {
            rt.url = u;
        }
        if let Some(k) = key {
            rt.key = k;
        }
    }
}
