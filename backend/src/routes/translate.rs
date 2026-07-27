//! 例句翻译：全局共用 sentences + translations 缓存。
//! - 命中 ok 缓存直接返回，绝不重翻
//! - 取消 retranslate
//! - 仅接受「像例句」的文本（防单词语刷 LLM）
//! - 限流：IP 级

use axum::{
    extract::{Path, State},
    routing::post,
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AdminUser;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

/// 最短例句长度（字符，UTF-8 字节近似）；短于此不走 LLM，防刷词。
const MIN_EXAMPLE_CHARS: usize = 12;
/// 最长文本
const MAX_TEXT_CHARS: usize = 4000;

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
        .route("/api/translate/{sid}", post(translate_sid))
}

/// 是否像「例句」：够长、含空格或标点（不是单个词）。
fn looks_like_example(text: &str) -> bool {
    let t = text.trim();
    if t.chars().count() < MIN_EXAMPLE_CHARS {
        return false;
    }
    // 含空白或常见标点 → 句子；纯字母词（含连字符）拒绝
    if t.contains(char::is_whitespace) {
        return true;
    }
    t.chars().any(|c| matches!(c, ',' | '.' | ';' | ':' | '!' | '?' | '"' | '\'' | '—' | '–' | '(' | ')'))
}

async fn translate_text(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<TextBody>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    // 读缓存也限流，防扫描；更严于登录接口
    state.rate.check(&ip, "translate", 40, 60)?;

    let text = body.text.trim();
    if text.is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(AppError::BadRequest("text too long".into()));
    }
    if !looks_like_example(text) {
        return Err(AppError::BadRequest(
            "only example sentences can be translated".into(),
        ));
    }

    // 共用保存：先查是否已有句子 + 成功译文
    if let Some(id) = sqlx::query_scalar::<_, i64>("SELECT id FROM sentences WHERE text = $1")
        .bind(text)
        .fetch_optional(&state.pool)
        .await?
    {
        if let Some((zh, status)) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
            "SELECT zh, status FROM translations WHERE sentence_id = $1",
        )
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        {
            if status.as_deref() == Some("ok") && zh.as_ref().is_some_and(|z| !z.is_empty()) {
                return Ok(Json(json!({ "zh": zh, "status": "ok", "cached": true })));
            }
        }
    }

    // 新译文：再限一次 LLM 专用桶
    state.rate.check(&ip, "translate_llm", 15, 60)?;

    let sid = db::ensure_sentence(&state.pool, text, None, None).await?;
    do_translate(&state, sid, None).await
}

async fn translate_sid(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(sid): Path<i64>,
) -> AppResult<Json<Value>> {
    do_translate(&state, sid, Some(admin.0.id)).await
}

async fn translate_batch(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(body): Json<BatchBody>,
) -> AppResult<Json<Value>> {
    if body.ids.len() > 50 {
        return Err(AppError::BadRequest("max 50 ids".into()));
    }
    let mut translated = 0i64;
    let mut failed = 0i64;
    let mut skipped = 0i64;
    let mut results = Vec::new();
    for id in body.ids {
        // 已有 ok 译文则跳过（共用缓存，不重翻）
        if let Some((zh, status)) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
            "SELECT zh, status FROM translations WHERE sentence_id = $1",
        )
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        {
            if status.as_deref() == Some("ok") && zh.as_ref().is_some_and(|z| !z.is_empty()) {
                skipped += 1;
                results.push(json!({
                    "id": id,
                    "zh": zh,
                    "status": "ok",
                    "cached": true,
                }));
                continue;
            }
        }

        match do_translate(&state, id, Some(admin.0.id)).await {
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
        "skipped": skipped,
        "results": results,
    })))
}

/// 共用保存：status=ok 则直接返回，永不 force 重翻。
async fn do_translate(
    state: &AppState,
    sid: i64,
    user_id: Option<i64>,
) -> AppResult<Json<Value>> {
    let text: Option<String> = sqlx::query_scalar("SELECT text FROM sentences WHERE id = $1")
        .bind(sid)
        .fetch_optional(&state.pool)
        .await?;
    let Some(text) = text else {
        return Err(AppError::NotFound("sentence not found".into()));
    };

    if let Some((zh, status)) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT zh, status FROM translations WHERE sentence_id = $1",
    )
    .bind(sid)
    .fetch_optional(&state.pool)
    .await?
    {
        if status.as_deref() == Some("ok") && zh.as_ref().is_some_and(|z| !z.is_empty()) {
            return Ok(Json(json!({ "zh": zh, "status": "ok", "cached": true })));
        }
    }

    let model = llm::active_model(&state.pool, &state.config.llm_model).await;

    if !state.config.llm_configured() || model.is_empty() {
        return Ok(Json(json!({ "zh": "", "status": "unconfigured" })));
    }

    match llm::translate_text(&state.http, &state.config, &model, &text).await {
        Ok(zh) => {
            let now = Utc::now();
            // 竞态：若另一请求已写入 ok，保留已有译文（共用保存）
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
                WHERE translations.status IS DISTINCT FROM 'ok'
                   OR translations.zh IS NULL
                   OR translations.zh = ''
                "#,
            )
            .bind(sid)
            .bind(&zh)
            .bind(&model)
            .bind(user_id)
            .bind(now)
            .execute(&state.pool)
            .await?;

            // 返回库里最终值（可能是别人先写上的）
            if let Some((final_zh, _)) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
                "SELECT zh, status FROM translations WHERE sentence_id = $1",
            )
            .bind(sid)
            .fetch_optional(&state.pool)
            .await?
            {
                if let Some(z) = final_zh.filter(|s| !s.is_empty()) {
                    return Ok(Json(json!({ "zh": z, "status": "ok" })));
                }
            }
            Ok(Json(json!({ "zh": zh, "status": "ok" })))
        }
        Err(e) => {
            let msg = e.to_string();
            let now = Utc::now();
            // 错误不覆盖已有 ok
            let _ = sqlx::query(
                r#"
                INSERT INTO translations (sentence_id, zh, status, model, translated_by, translated_at, updated_at)
                VALUES ($1, $2, 'error', $3, $4, $5, $5)
                ON CONFLICT (sentence_id) DO UPDATE SET
                    zh = EXCLUDED.zh,
                    status = 'error',
                    model = EXCLUDED.model,
                    updated_at = EXCLUDED.updated_at
                WHERE translations.status IS DISTINCT FROM 'ok'
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
