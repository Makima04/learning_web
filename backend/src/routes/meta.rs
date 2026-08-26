use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Deserialize)]
struct MetaQuery {
    day: Option<String>,
}

#[derive(Deserialize)]
struct MetaPutBody {
    #[serde(flatten)]
    fields: MetaFields,
    /// frontend may wrap as { meta: {...} }
    meta: Option<MetaFields>,
}

#[derive(Deserialize, Default, Clone)]
struct MetaFields {
    day_key: Option<String>,
    new_today: Option<i32>,
    review_today: Option<i32>,
    learn_today: Option<i32>,
    done_today: Option<i32>,
    data_version: Option<String>,
    /// 客户端写入时间（毫秒）；重置后早于 reset_at 的 PUT 丢弃
    client_at: Option<i64>,
    /// 重置专用：绝对写入，不走 GREATEST
    reset_today: Option<bool>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/meta", get(get_meta).put(put_meta))
}

async fn get_meta(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<MetaQuery>,
) -> AppResult<Json<Value>> {
    let day = q
        .day
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let row = sqlx::query_as::<
        _,
        (
            String,
            Option<i32>,
            Option<i32>,
            Option<i32>,
            Option<i32>,
            Option<String>,
        ),
    >(
        r#"
        SELECT day_key, new_today, review_today, learn_today, done_today, data_version
        FROM meta WHERE user_id = $1 AND day_key = $2
        "#,
    )
    .bind(user.id)
    .bind(&day)
    .fetch_optional(&state.pool)
    .await?;

    let reset_at = super::cards::user_reset_at(&state.pool, user.id).await?;
    let meta = match row {
        Some((day_key, new_today, review_today, learn_today, done_today, data_version)) => {
            json!({
                "day_key": day_key,
                "new_today": new_today.unwrap_or(0),
                "review_today": review_today.unwrap_or(0),
                "learn_today": learn_today.unwrap_or(0),
                "done_today": done_today.unwrap_or(0),
                "data_version": data_version,
            })
        }
        None => json!({}),
    };
    Ok(Json(json!({
        "meta": meta,
        "reset_at": reset_at.map(|t| t.to_rfc3339()),
    })))
}

async fn put_meta(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<MetaPutBody>,
) -> AppResult<Json<Value>> {
    let m = body.meta.unwrap_or(body.fields);
    let day_key = m
        .day_key
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("day_key required".into()))?;

    let reset_at_ms = super::cards::user_reset_at_ms(&state.pool, user.id).await?;
    let client_at = m.client_at.unwrap_or(0);
    if reset_at_ms > 0 && client_at < reset_at_ms && m.reset_today != Some(true) {
        // 重置前入队的旧计数，不能 GREATEST 救活额度
        return Ok(Json(json!({ "ok": true, "ignored": "stale_after_reset" })));
    }

    if m.reset_today == Some(true) {
        sqlx::query(
            r#"
            INSERT INTO meta (user_id, day_key, new_today, review_today, learn_today, done_today, data_version, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (user_id, day_key) DO UPDATE SET
                new_today = EXCLUDED.new_today,
                review_today = EXCLUDED.review_today,
                learn_today = EXCLUDED.learn_today,
                done_today = EXCLUDED.done_today,
                data_version = COALESCE(EXCLUDED.data_version, meta.data_version),
                updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(user.id)
        .bind(&day_key)
        .bind(m.new_today.unwrap_or(0))
        .bind(m.review_today.unwrap_or(0))
        .bind(m.learn_today.unwrap_or(0))
        .bind(m.done_today.unwrap_or(0))
        .bind(&m.data_version)
        .bind(Utc::now())
        .execute(&state.pool)
        .await?;
        return Ok(Json(json!({ "ok": true })));
    }

    // 取 max 合并，避免多设备互相覆盖「今日进度」
    sqlx::query(
        r#"
        INSERT INTO meta (user_id, day_key, new_today, review_today, learn_today, done_today, data_version, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id, day_key) DO UPDATE SET
            new_today = GREATEST(COALESCE(meta.new_today, 0), EXCLUDED.new_today),
            review_today = GREATEST(COALESCE(meta.review_today, 0), EXCLUDED.review_today),
            learn_today = GREATEST(COALESCE(meta.learn_today, 0), EXCLUDED.learn_today),
            done_today = GREATEST(COALESCE(meta.done_today, 0), EXCLUDED.done_today),
            data_version = COALESCE(EXCLUDED.data_version, meta.data_version),
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(user.id)
    .bind(&day_key)
    .bind(m.new_today.unwrap_or(0))
    .bind(m.review_today.unwrap_or(0))
    .bind(m.learn_today.unwrap_or(0))
    .bind(m.done_today.unwrap_or(0))
    .bind(&m.data_version)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({ "ok": true })))
}
