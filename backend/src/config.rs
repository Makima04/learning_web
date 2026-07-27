use std::path::{Path, PathBuf};

use serde::Deserialize;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub session_ttl_days: i64,
    pub allow_first_admin: bool,
    pub trusted_proxy_hops: usize,
    pub llm_url: String,
    pub llm_key: String,
    pub llm_model: String,
    pub host: String,
    pub port: u16,
    pub static_dir: PathBuf,
    /// Resend API key（https://resend.com）；空则仅开发模式可发码
    pub resend_api_key: String,
    /// 发件地址，如 "红宝书 <noreply@example.com>"
    pub mail_from: String,
    /// 开发模式：不真正发信，把验证码打日志并在响应里返回 dev_code
    pub mail_dev: bool,
}

#[derive(Debug, Deserialize, Default)]
struct LlmFile {
    #[serde(default)]
    url: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    model: String,
}

impl Config {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();

        let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));

        let conf_path = project_root.join("ew_llm.json");
        let file = load_llm_file(&conf_path);

        let mut llm_url = env_nonempty("EW_LLM_URL").unwrap_or_default();
        let mut llm_key = env_nonempty("EW_LLM_KEY").unwrap_or_default();
        let mut llm_model = env_nonempty("EW_LLM_MODEL").unwrap_or_default();
        if llm_url.is_empty() {
            llm_url = file.url.trim().to_string();
        }
        if llm_key.is_empty() {
            llm_key = file.key.trim().to_string();
        }
        if llm_model.is_empty() {
            llm_model = file.model.trim().to_string();
        }

        let database_url = env_nonempty("EW_DATABASE_URL")
            .or_else(|| env_nonempty("DATABASE_URL"))
            .unwrap_or_else(|| "postgres://makima@localhost/english_web".into());

        let session_ttl_days = std::env::var("EW_SESSION_TTL_DAYS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30);

        let allow_first_admin = std::env::var("EW_ALLOW_FIRST_ADMIN")
            .map(|v| v != "0")
            .unwrap_or(true);
        let trusted_proxy_hops = std::env::var("EW_TRUSTED_PROXY_HOPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let host = env_nonempty("EW_HOST").unwrap_or_else(|| "0.0.0.0".into());
        let port = std::env::var("EW_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8000);

        let static_dir = env_nonempty("EW_STATIC_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| project_root.join("frontend/dist"));

        let resend_api_key = env_nonempty("EW_RESEND_API_KEY").unwrap_or_default();
        let mail_from = env_nonempty("EW_MAIL_FROM")
            .unwrap_or_else(|| "english_web <onboarding@resend.dev>".into());
        // 未配置 Resend 时默认开启 dev 发码（本地可测）；配置了 key 则默认关闭
        let mail_dev = std::env::var("EW_MAIL_DEV")
            .map(|v| v != "0")
            .unwrap_or(resend_api_key.is_empty());

        Self {
            database_url,
            session_ttl_days,
            allow_first_admin,
            trusted_proxy_hops,
            llm_url,
            llm_key,
            llm_model,
            host,
            port,
            static_dir,
            resend_api_key,
            mail_from,
            mail_dev,
        }
    }

    pub fn llm_configured(&self) -> bool {
        !self.llm_url.is_empty() && !self.llm_key.is_empty()
    }

    pub fn mail_configured(&self) -> bool {
        self.mail_dev || !self.resend_api_key.is_empty()
    }
}

fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn load_llm_file(path: &Path) -> LlmFile {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => LlmFile::default(),
    }
}
