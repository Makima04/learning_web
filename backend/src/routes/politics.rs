// 考研政治主观题练习进度：JSON 整包（与 kg / journal 同模式），需登录。
use axum::{extract::State, routing::get, Json, Router};
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_PAYLOAD_BYTES: usize = 2 * 1024 * 1024;

#[derive(Deserialize)]
struct PoliticsPut {
    politics: Value,
    #[serde(default)]
    updated_at: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/politics", get(get_politics).put(put_politics))
}

async fn get_politics(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let row: Option<(Value, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT payload, updated_at
        FROM user_politics
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((payload, updated_at)) => {
            let ms = updated_at.map(|t| t.timestamp_millis()).unwrap_or(0);
            Ok(Json(json!({ "politics": payload, "updated_at": ms })))
        }
        None => Ok(Json(json!({ "politics": null, "updated_at": 0 }))),
    }
}

async fn put_politics(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PoliticsPut>,
) -> AppResult<Json<Value>> {
    let payload = body.politics;
    if !payload.is_object() {
        return Err(AppError::BadRequest("politics must be an object".into()));
    }
    let serialized = serde_json::to_vec(&payload)
        .map_err(|e| AppError::BadRequest(format!("invalid politics json: {e}")))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::BadRequest("politics payload too large".into()));
    }

    let client_ms = body
        .updated_at
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    if client_ms < 0 {
        return Err(AppError::BadRequest("updated_at invalid".into()));
    }

    let existing: Option<Option<chrono::DateTime<Utc>>> =
        sqlx::query_scalar("SELECT updated_at FROM user_politics WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&state.pool)
            .await?;

    if let Some(Some(server_ts)) = existing {
        if server_ts.timestamp_millis() > client_ms {
            let row: (Value, Option<chrono::DateTime<Utc>>) =
                sqlx::query_as("SELECT payload, updated_at FROM user_politics WHERE user_id = $1")
                    .bind(user.id)
                    .fetch_one(&state.pool)
                    .await?;
            return Ok(Json(json!({
                "ok": true,
                "skipped": true,
                "reason": "server_newer",
                "politics": row.0,
                "updated_at": row.1.map(|t| t.timestamp_millis()).unwrap_or(0),
            })));
        }
    }

    let ts = Utc
        .timestamp_millis_opt(client_ms)
        .single()
        .unwrap_or_else(Utc::now);

    sqlx::query(
        r#"
        INSERT INTO user_politics (user_id, payload, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(user.id)
    .bind(&payload)
    .bind(ts)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "ok": true,
        "updated_at": client_ms,
    })))
}
