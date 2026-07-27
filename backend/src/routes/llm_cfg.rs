use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AdminUser;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

const CFG_LLM_URL: &str = "llm_url";
const CFG_LLM_KEY: &str = "llm_key";

#[derive(Deserialize)]
struct ConfigBody {
    model: Option<String>,
    concurrency: Option<i64>,
    /// 网关 base URL；null 表示不改
    url: Option<String>,
    /// API key；null/省略表示不改；空字符串忽略（防误清空）
    key: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/llm/config", get(get_config).post(set_config))
        .route("/api/llm/models", get(list_models))
}

/// 脱敏：短 key 全掩；长 key 保留前 3 与后 4。
fn mask_key(key: &str) -> String {
    let k = key.trim();
    if k.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = k.chars().collect();
    let n = chars.len();
    if n <= 8 {
        return "•".repeat(n.min(6));
    }
    let head: String = chars.iter().take(3).collect();
    let tail: String = chars.iter().skip(n - 4).collect();
    format!("{head}…{tail}")
}

async fn get_config(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Value>> {
    let conf = state.llm_config().await;
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let concurrency = llm::active_concurrency(&state.pool).await;
    let configured = state.llm_configured().await;
    Ok(Json(json!({
        "configured": configured,
        "model": model,
        "concurrency": concurrency,
        "url": conf.llm_url,
        "key_masked": mask_key(&conf.llm_key),
        "has_key": !conf.llm_key.is_empty(),
    })))
}

async fn list_models(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Value>> {
    if !state.llm_configured().await {
        return Ok(Json(json!([])));
    }
    let conf = state.llm_config().await;
    match llm::fetch_models(&state.http, &conf).await {
        Ok(models) => Ok(Json(json!(models))),
        Err(e) => Err(AppError::BadRequest(e.to_string())),
    }
}

async fn set_config(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<ConfigBody>,
) -> AppResult<Json<Value>> {
    if let Some(model) = body.model {
        db::set_config_value(&state.pool, "active_llm_model", &model).await?;
    }
    if let Some(c) = body.concurrency {
        let c = c.clamp(llm::LLM_CONCURRENCY_MIN, llm::LLM_CONCURRENCY_MAX);
        db::set_config_value(&state.pool, "llm_concurrency", &c.to_string()).await?;
    }

    let mut url_update: Option<String> = None;
    let mut key_update: Option<String> = None;

    if let Some(u) = body.url {
        let u = u.trim().to_string();
        db::set_config_value(&state.pool, CFG_LLM_URL, &u).await?;
        url_update = Some(u);
    }
    if let Some(k) = body.key {
        let k = k.trim().to_string();
        // 空字符串 = 不改（避免表单清空误提交抹掉 key）
        if !k.is_empty() {
            db::set_config_value(&state.pool, CFG_LLM_KEY, &k).await?;
            key_update = Some(k);
        }
    }

    if url_update.is_some() || key_update.is_some() {
        state.set_llm_runtime(url_update, key_update).await;
    }

    let conf = state.llm_config().await;
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let concurrency = llm::active_concurrency(&state.pool).await;
    Ok(Json(json!({
        "ok": true,
        "model": model,
        "concurrency": concurrency,
        "configured": state.llm_configured().await,
        "url": conf.llm_url,
        "key_masked": mask_key(&conf.llm_key),
        "has_key": !conf.llm_key.is_empty(),
    })))
}

/// 启动时：DB 中的 llm_url/llm_key 优先，否则用 env/ew_llm.json；若 DB 空则回写种子。
pub async fn load_llm_runtime(
    pool: &sqlx::PgPool,
    boot: &crate::config::Config,
) -> crate::state::LlmRuntime {
    let db_url = db::get_config_value(pool, CFG_LLM_URL)
        .await
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let db_key = db::get_config_value(pool, CFG_LLM_KEY)
        .await
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let url = if let Some(u) = db_url {
        u
    } else {
        let u = boot.llm_url.trim().to_string();
        if !u.is_empty() {
            let _ = db::set_config_value(pool, CFG_LLM_URL, &u).await;
        }
        u
    };
    let key = if let Some(k) = db_key {
        k
    } else {
        let k = boot.llm_key.trim().to_string();
        if !k.is_empty() {
            let _ = db::set_config_value(pool, CFG_LLM_KEY, &k).await;
        }
        k
    };

    crate::state::LlmRuntime { url, key }
}
