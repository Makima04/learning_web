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
        }
    }

    pub fn llm_configured(&self) -> bool {
        !self.llm_url.is_empty() && !self.llm_key.is_empty()
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
