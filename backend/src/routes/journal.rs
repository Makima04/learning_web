// 学习日志：按用户隔离的个人数据（JSONB 整包），需登录。
use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_PAYLOAD_BYTES: usize = 2 * 1024 * 1024; // 2 MiB

#[derive(Deserialize)]
struct JournalPut {
    journal: Value,
    /// 客户端文档版本（毫秒时间戳）；服务端 LWW 用。
    #[serde(default)]
    updated_at: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/journal", get(get_journal).put(put_journal))
}

async fn get_journal(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Value>> {
    let row: Option<(Value, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT payload, updated_at
        FROM user_journal
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((payload, updated_at)) => {
            let ms = updated_at
                .map(|t| t.timestamp_millis())
                .unwrap_or(0);
            Ok(Json(json!({
                "journal": payload,
                "updated_at": ms,
            })))
        }
        None => Ok(Json(json!({
            "journal": null,
            "updated_at": 0,
        }))),
    }
}

async fn put_journal(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<JournalPut>,
) -> AppResult<Json<Value>> {
    let payload = body.journal;
    if !payload.is_object() {
        return Err(AppError::BadRequest("journal must be an object".into()));
    }
    let serialized = serde_json::to_vec(&payload)
        .map_err(|e| AppError::BadRequest(format!("invalid journal json: {e}")))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::BadRequest("journal payload too large".into()));
    }

    // 基本字段形状校验（宽松：允许缺省，拒绝明显错误类型）
    validate_journal_shape(&payload)?;

    let client_ms = body.updated_at.unwrap_or_else(|| Utc::now().timestamp_millis());
    if client_ms < 0 {
        return Err(AppError::BadRequest("updated_at invalid".into()));
    }
    let client_ts = Utc
        .timestamp_millis_opt(client_ms)
        .single()
        .ok_or_else(|| AppError::BadRequest("updated_at invalid".into()))?;

    // LWW：仅当客户端版本 >= 服务端时才覆盖
    let existing: Option<Option<chrono::DateTime<Utc>>> =
        sqlx::query_scalar("SELECT updated_at FROM user_journal WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&state.pool)
            .await?;

    if let Some(Some(server_ts)) = existing {
        if client_ts < server_ts {
            let server_ms = server_ts.timestamp_millis();
            let current: Value =
                sqlx::query_scalar("SELECT payload FROM user_journal WHERE user_id = $1")
                    .bind(user.id)
                    .fetch_one(&state.pool)
                    .await?;
            return Ok(Json(json!({
                "ok": true,
                "skipped": true,
                "reason": "stale",
                "journal": current,
                "updated_at": server_ms,
            })));
        }
    }

    sqlx::query(
        r#"
        INSERT INTO user_journal (user_id, payload, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(user.id)
    .bind(&payload)
    .bind(client_ts)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "ok": true,
        "skipped": false,
        "updated_at": client_ms,
    })))
}

fn validate_journal_shape(payload: &Value) -> AppResult<()> {
    let obj = payload
        .as_object()
        .ok_or_else(|| AppError::BadRequest("journal must be an object".into()))?;

    for key in ["categories", "entries", "logs", "weeklies"] {
        if let Some(v) = obj.get(key) {
            if !v.is_array() {
                return Err(AppError::BadRequest(format!("{key} must be an array")));
            }
        }
    }
    if let Some(v) = obj.get("updatedAt") {
        if !v.is_number() {
            return Err(AppError::BadRequest("updatedAt must be a number".into()));
        }
    }
    // 条目数量上限，防止异常膨胀
    if let Some(arr) = obj.get("entries").and_then(|v| v.as_array()) {
        if arr.len() > 20_000 {
            return Err(AppError::BadRequest("too many journal entries".into()));
        }
    }
    if let Some(arr) = obj.get("logs").and_then(|v| v.as_array()) {
        if arr.len() > 50_000 {
            return Err(AppError::BadRequest("too many journal logs".into()));
        }
    }
    if let Some(arr) = obj.get("categories").and_then(|v| v.as_array()) {
        if arr.len() > 200 {
            return Err(AppError::BadRequest("too many journal categories".into()));
        }
    }
    Ok(())
}
