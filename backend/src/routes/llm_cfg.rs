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

#[derive(Deserialize)]
struct ConfigBody {
    model: Option<String>,
    concurrency: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/llm/config", get(get_config).post(set_config))
        .route("/api/llm/models", get(list_models))
}

async fn get_config(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Value>> {
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let concurrency = llm::active_concurrency(&state.pool).await;
    Ok(Json(json!({
        "configured": state.config.llm_configured(),
        "model": model,
        "concurrency": concurrency,
    })))
}

async fn list_models(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Value>> {
    if !state.config.llm_configured() {
        return Ok(Json(json!([])));
    }
    match llm::fetch_models(&state.http, &state.config).await {
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
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let concurrency = llm::active_concurrency(&state.pool).await;
    Ok(Json(json!({
        "ok": true,
        "model": model,
        "concurrency": concurrency,
    })))
}
