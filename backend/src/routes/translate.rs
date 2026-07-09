use axum::{
    extract::{Path, State},
    routing::post,
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::{AdminUser, AuthUser};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

#[derive(Deserialize)]
struct TextBody {
    text: String,
}

#[derive(Deserialize)]
struct BatchBody {
    ids: Vec<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/translate", post(translate_text))
        .route("/api/translate/batch", post(translate_batch))
        .route("/api/translate/{sid}/retranslate", post(retranslate))
        .route("/api/translate/{sid}", post(translate_sid))
}

async fn translate_text(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<TextBody>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr));
    state.rate.check(&ip, "translate", 60, 60)?;

    let text = body.text.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }
    if text.len() > 8000 {
        return Err(AppError::BadRequest("text too long".into()));
    }

    let sid = db::ensure_sentence(&state.pool, text, None, None).await?;
    do_translate(&state, sid, None, false).await
}

async fn translate_sid(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(sid): Path<i64>,
) -> AppResult<Json<Value>> {
    do_translate(&state, sid, Some(admin.0.id), false).await
}

async fn retranslate(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(sid): Path<i64>,
) -> AppResult<Json<Value>> {
    do_translate(&state, sid, Some(admin.0.id), true).await
}

async fn translate_batch(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(body): Json<BatchBody>,
) -> AppResult<Json<Value>> {
    if body.ids.len() > 200 {
        return Err(AppError::BadRequest("max 200 ids".into()));
    }
    let mut translated = 0i64;
    let mut failed = 0i64;
    let mut results = Vec::new();
    for id in body.ids {
        match do_translate(&state, id, Some(admin.0.id), false).await {
            Ok(Json(v)) => {
                let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("");
                if status == "ok" {
                    translated += 1;
                } else {
                    failed += 1;
                }
                results.push(json!({
                    "id": id,
                    "zh": v.get("zh").cloned().unwrap_or(Value::Null),
                    "status": status,
                }));
            }
            Err(e) => {
                failed += 1;
                results.push(json!({
                    "id": id,
                    "zh": "",
                    "status": "error",
                    "error": e.to_string(),
                }));
            }
        }
    }
    Ok(Json(json!({
        "translated": translated,
        "failed": failed,
        "results": results,
    })))
}

async fn do_translate(
    state: &AppState,
    sid: i64,
    user_id: Option<i64>,
    force: bool,
) -> AppResult<Json<Value>> {
    let text: Option<String> =
        sqlx::query_scalar("SELECT text FROM sentences WHERE id = $1")
            .bind(sid)
            .fetch_optional(&state.pool)
            .await?;
    let Some(text) = text else {
        return Err(AppError::NotFound("sentence not found".into()));
    };

    let model = llm::active_model(&state.pool, &state.config.llm_model).await;

    if !force {
        if let Some((zh, status, m)) = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>)>(
            "SELECT zh, status, model FROM translations WHERE sentence_id = $1",
        )
        .bind(sid)
        .fetch_optional(&state.pool)
        .await?
        {
            if status.as_deref() == Some("ok") && zh.as_ref().is_some_and(|z| !z.is_empty()) {
                if m.as_deref() == Some(model.as_str()) || m.is_none() {
                    return Ok(Json(json!({ "zh": zh, "status": "ok" })));
                }
            }
        }
    }

    if !state.config.llm_configured() || model.is_empty() {
        return Ok(Json(json!({ "zh": "", "status": "unconfigured" })));
    }

    match llm::translate_text(&state.http, &state.config, &model, &text).await {
        Ok(zh) => {
            let now = Utc::now();
            sqlx::query(
                r#"
                INSERT INTO translations (sentence_id, zh, status, model, translated_by, translated_at, updated_at)
                VALUES ($1, $2, 'ok', $3, $4, $5, $5)
                ON CONFLICT (sentence_id) DO UPDATE SET
                    zh = EXCLUDED.zh,
                    status = 'ok',
                    model = EXCLUDED.model,
                    translated_by = EXCLUDED.translated_by,
                    translated_at = EXCLUDED.translated_at,
                    updated_at = EXCLUDED.updated_at
                "#,
            )
            .bind(sid)
            .bind(&zh)
            .bind(&model)
            .bind(user_id)
            .bind(now)
            .execute(&state.pool)
            .await?;
            Ok(Json(json!({ "zh": zh, "status": "ok" })))
        }
        Err(e) => {
            let msg = e.to_string();
            let now = Utc::now();
            let _ = sqlx::query(
                r#"
                INSERT INTO translations (sentence_id, zh, status, model, translated_by, translated_at, updated_at)
                VALUES ($1, $2, 'error', $3, $4, $5, $5)
                ON CONFLICT (sentence_id) DO UPDATE SET
                    zh = EXCLUDED.zh,
                    status = 'error',
                    model = EXCLUDED.model,
                    updated_at = EXCLUDED.updated_at
                "#,
            )
            .bind(sid)
            .bind(&msg)
            .bind(&model)
            .bind(user_id)
            .bind(now)
            .execute(&state.pool)
            .await;
            Ok(Json(json!({ "zh": msg, "status": "error" })))
        }
    }
}

// silence unused AuthUser warning if any
#[allow(dead_code)]
fn _u(_: AuthUser) {}
