use axum::{extract::State, routing::get, Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Deserialize)]
struct SettingsPut {
    settings: Value,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/settings", get(get_settings).put(put_settings))
}

async fn get_settings(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let row: Option<Value> =
        sqlx::query_scalar("SELECT payload FROM user_settings WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&state.pool)
            .await?;
    match row {
        Some(payload) => Ok(Json(json!({ "settings": payload }))),
        None => Ok(Json(json!({}))),
    }
}

async fn put_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SettingsPut>,
) -> AppResult<Json<Value>> {
    let mut payload = body.settings;
    if let Some(obj) = payload.as_object_mut() {
        obj.remove("llm");
    }
    sqlx::query(
        r#"
        INSERT INTO user_settings (user_id, payload, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(user.id)
    .bind(&payload)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "ok": true })))
}
