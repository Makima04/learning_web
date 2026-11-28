//! 只读学习状态快照接口：供外部学习助手读取数学/408 的刷题进度、已斩题与复习队列。
//! 认证采用独立的 EW_COACH_TOKEN（常驻、严格只读、与浏览器 session 解耦），未配置时默认禁用。
use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde_json::{json, Value};

use crate::auth;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::services::documents::{self, DocumentKind};
use crate::state::AppState;

const RECENT_LOG_LIMIT: i64 = 120;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/coach/snapshot", get(get_snapshot))
}

fn constant_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn verify_coach_token(expected: &str, headers: &HeaderMap) -> AppResult<()> {
    if expected.is_empty() {
        return Err(AppError::NotFound("coach snapshot disabled".into()));
    }
    let provided = auth::bearer_from_headers(headers)?;
    if !constant_eq(&provided, expected) {
        return Err(AppError::Unauthorized("invalid coach token".into()));
    }
    Ok(())
}

async fn resolve_target_user(state: &AppState) -> AppResult<(i64, String)> {
    let uname = state.config.coach_username.trim();
    let row: Option<(i64, String)> = if !uname.is_empty() {
        sqlx::query_as("SELECT id, username FROM users WHERE username = $1")
            .bind(uname)
            .fetch_optional(&state.pool)
            .await?
    } else {
        sqlx::query_as("SELECT id, username FROM users WHERE is_admin = TRUE ORDER BY id ASC LIMIT 1")
            .fetch_optional(&state.pool)
            .await?
    };

    row.ok_or_else(|| AppError::NotFound("coach target user not found".into()))
}

async fn get_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "coach_snapshot", 30, 60)?;

    verify_coach_token(&state.config.coach_token, &headers)?;
    let (user_id, username) = resolve_target_user(&state).await?;

    let kg_doc = documents::get(&state.pool, user_id, DocumentKind::Kg).await?;

    let entry_rows = sqlx::query_as::<_, (String, i64, Value)>(
        r#"
        SELECT id,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT,
               payload
        FROM journal_entries
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC, id
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    let category_rows = sqlx::query_as::<_, (String, i64, Value)>(
        r#"
        SELECT id,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT,
               payload
        FROM journal_categories
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC, id
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    let log_rows = sqlx::query_as::<_, (String, String, i64, Value)>(
        r#"
        SELECT id,
               entry_id,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT,
               payload
        FROM journal_logs
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC, id
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(RECENT_LOG_LIMIT)
    .fetch_all(&state.pool)
    .await?;

    let entries: Vec<Value> = entry_rows
        .into_iter()
        .map(|(id, updated_at, payload)| {
            json!({
                "id": id,
                "updated_at": updated_at,
                "entry": payload,
            })
        })
        .collect();

    let categories: Vec<Value> = category_rows
        .into_iter()
        .map(|(id, updated_at, payload)| {
            json!({
                "id": id,
                "updated_at": updated_at,
                "category": payload,
            })
        })
        .collect();

    let recent_logs: Vec<Value> = log_rows
        .into_iter()
        .map(|(id, entry_id, updated_at, payload)| {
            json!({
                "id": id,
                "entry_id": entry_id,
                "updated_at": updated_at,
                "log": payload,
            })
        })
        .collect();

    let now = Utc::now();
    Ok(Json(json!({
        "version": 1,
        "exported_at": now.to_rfc3339(),
        "server_ms": now.timestamp_millis(),
        "user": {
            "id": user_id,
            "username": username,
        },
        "kg": kg_doc.get("kg").cloned().unwrap_or(Value::Null),
        "kg_updated_at": kg_doc.get("updated_at").cloned().unwrap_or(json!(0)),
        "journal": {
            "entries": entries,
            "categories": categories,
            "recent_logs": recent_logs,
        },
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{header::AUTHORIZATION, HeaderValue};

    #[test]
    fn disabled_when_token_empty() {
        let headers = HeaderMap::new();
        let err = verify_coach_token("", &headers).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn rejects_missing_or_wrong_token() {
        let headers = HeaderMap::new();
        let err = verify_coach_token("secret-token-123", &headers).unwrap_err();
        assert!(matches!(err, AppError::Unauthorized(_)));

        let mut bad = HeaderMap::new();
        bad.insert(AUTHORIZATION, HeaderValue::from_static("Bearer wrong-token"));
        let err2 = verify_coach_token("secret-token-123", &bad).unwrap_err();
        assert!(matches!(err2, AppError::Unauthorized(_)));
    }

    #[test]
    fn accepts_exact_bearer_token() {
        let mut ok = HeaderMap::new();
        ok.insert(
            AUTHORIZATION,
            HeaderValue::from_static("Bearer secret-token-123"),
        );
        assert!(verify_coach_token("secret-token-123", &ok).is_ok());
    }
}
