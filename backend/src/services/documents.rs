//! 账号整包文档的统一读写边界。版本判断在 UPSERT 内完成，避免先读后写竞态。
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::{AppError, AppResult};

#[derive(Clone, Copy)]
pub enum DocumentKind {
    Kg,
    Politics,
}

impl DocumentKind {
    fn table(self) -> &'static str {
        match self {
            Self::Kg => "user_kg",
            Self::Politics => "user_politics",
        }
    }
    fn name(self) -> &'static str {
        match self {
            Self::Kg => "kg",
            Self::Politics => "politics",
        }
    }
    fn max_bytes(self) -> usize {
        match self {
            Self::Kg => 4 * 1024 * 1024,
            Self::Politics => 2 * 1024 * 1024,
        }
    }
}

pub async fn get(pool: &PgPool, user_id: i64, kind: DocumentKind) -> AppResult<Value> {
    let query = format!(
        "SELECT payload, updated_at FROM {} WHERE user_id = $1",
        kind.table()
    );
    let row: Option<(Value, Option<DateTime<Utc>>)> = sqlx::query_as(&query)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    let (payload, updated_at) = row
        .map(|(p, t)| (p, t.map(|t| t.timestamp_millis()).unwrap_or(0)))
        .unwrap_or((Value::Null, 0));
    Ok(json!({ (kind.name()): payload, "updated_at": updated_at }))
}

pub async fn put(
    pool: &PgPool,
    user_id: i64,
    kind: DocumentKind,
    mut payload: Value,
    updated_at: Option<i64>,
) -> AppResult<Value> {
    if !payload.is_object() {
        return Err(AppError::BadRequest(format!(
            "{} must be an object",
            kind.name()
        )));
    }
    let client_ms = updated_at.unwrap_or_else(|| Utc::now().timestamp_millis());
    let ts = DateTime::from_timestamp_millis(client_ms)
        .filter(|_| client_ms >= 0)
        .ok_or_else(|| AppError::BadRequest("updated_at invalid".into()))?;
    // 文档内外版本必须一致，客户端不能凭一份不一致的版本再次覆盖服务端。
    payload["updatedAt"] = json!(client_ms);
    if serde_json::to_vec(&payload)
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .len()
        > kind.max_bytes()
    {
        return Err(AppError::BadRequest(format!(
            "{} payload too large",
            kind.name()
        )));
    }
    let query = format!(
        r#"
        INSERT INTO {table} (user_id, payload, updated_at) VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
        WHERE {table}.updated_at IS NULL OR EXCLUDED.updated_at >= {table}.updated_at
        RETURNING user_id
    "#,
        table = kind.table()
    );
    let saved: Option<i64> = sqlx::query_scalar(&query)
        .bind(user_id)
        .bind(&payload)
        .bind(ts)
        .fetch_optional(pool)
        .await?;
    if saved.is_some() {
        return Ok(json!({ "ok": true, "updated_at": client_ms }));
    }
    let mut response = get(pool, user_id, kind).await?;
    response["ok"] = json!(true);
    response["skipped"] = json!(true);
    response["reason"] = json!("server_newer");
    Ok(response)
}
