use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CardState {
    #[serde(default)]
    pub learned: Option<bool>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub due: Option<i64>,
    #[serde(default)]
    pub ivl: Option<i32>,
    #[serde(default)]
    pub ease: Option<f64>,
    #[serde(default)]
    pub reps: Option<i32>,
    #[serde(default)]
    pub lapses: Option<i32>,
    #[serde(default)]
    pub step: Option<i32>,
    #[serde(default)]
    pub quiz: Option<i32>,
    #[serde(default)]
    pub updated_at: Option<i64>,
}

#[derive(Deserialize)]
struct CardPutBody {
    card: CardState,
}

#[derive(Deserialize)]
struct BulkBody {
    cards: HashMap<String, CardState>,
}

#[derive(Deserialize)]
struct DeleteAllQuery {
    /// 客户端本地日 YYYY-MM-DD，用于把当日 meta 置 0
    day: Option<String>,
}

/// 该账号最近一次权威重置的毫秒时间戳；从未重置则为 0。
pub(crate) async fn user_reset_at_ms(pool: &sqlx::PgPool, user_id: i64) -> AppResult<i64> {
    let ts: Option<chrono::DateTime<Utc>> =
        sqlx::query_scalar("SELECT reset_at FROM progress_reset WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
    Ok(ts.map(|t| t.timestamp_millis()).unwrap_or(0))
}

pub(crate) async fn user_reset_at(
    pool: &sqlx::PgPool,
    user_id: i64,
) -> AppResult<Option<chrono::DateTime<Utc>>> {
    Ok(
        sqlx::query_scalar("SELECT reset_at FROM progress_reset WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?,
    )
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/cards", get(list_cards).delete(delete_all_cards))
        .route("/api/cards/{idx}", put(put_card))
        .route("/api/cards/bulk", post(bulk_cards))
}

async fn list_cards(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Value>> {
    let rows = sqlx::query_as::<
        _,
        (
            i32,
            Option<bool>,
            Option<String>,
            Option<i64>,
            Option<i32>,
            Option<f64>,
            Option<i32>,
            Option<i32>,
            Option<i32>,
            Option<i32>,
            Option<i64>,
        ),
    >(
        r#"
        SELECT word_idx, learned, state, due, ivl, ease, reps, lapses, step, quiz,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT
        FROM cards WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let mut cards = Map::new();
    for (idx, learned, state_s, due, ivl, ease, reps, lapses, step, quiz, updated_at) in rows {
        cards.insert(
            idx.to_string(),
            json!({
                "learned": learned,
                "state": state_s,
                "due": due,
                "ivl": ivl,
                "ease": ease,
                "reps": reps,
                "lapses": lapses,
                "step": step,
                "quiz": quiz,
                "updated_at": updated_at,
            }),
        );
    }
    let reset_at = user_reset_at(&state.pool, user.id).await?;
    Ok(Json(json!({
        "cards": cards,
        "reset_at": reset_at.map(|t| t.to_rfc3339()),
    })))
}

async fn put_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(idx): Path<i32>,
    Json(body): Json<CardPutBody>,
) -> AppResult<Json<Value>> {
    let reset_at = user_reset_at_ms(&state.pool, user.id).await?;
    upsert_card(&state, user.id, idx, &body.card, reset_at).await?;
    Ok(Json(json!({ "ok": true })))
}

/// 权威清空：删卡片 + 学习事件 + 当日 meta 置 0 + 记下 reset_at。
/// 日常 PUT /api/meta 仍走 GREATEST，重置不走那条路径。
async fn delete_all_cards(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<DeleteAllQuery>,
) -> AppResult<Json<Value>> {
    let day = q
        .day
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let now = Utc::now();

    let mut tx = state.pool.begin().await?;
    let cards_res = sqlx::query("DELETE FROM cards WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    let events_res = sqlx::query("DELETE FROM study_events WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        r#"
        INSERT INTO meta (user_id, day_key, new_today, review_today, learn_today, done_today, updated_at)
        VALUES ($1, $2, 0, 0, 0, 0, $3)
        ON CONFLICT (user_id, day_key) DO UPDATE SET
            new_today = 0,
            review_today = 0,
            learn_today = 0,
            done_today = 0,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(user.id)
    .bind(&day)
    .bind(now)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO progress_reset (user_id, reset_at, day_key)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            reset_at = EXCLUDED.reset_at,
            day_key = EXCLUDED.day_key
        "#,
    )
    .bind(user.id)
    .bind(now)
    .bind(&day)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(json!({
        "ok": true,
        "deleted": cards_res.rows_affected(),
        "events_deleted": events_res.rows_affected(),
        "reset_at": now.to_rfc3339(),
    })))
}

async fn bulk_cards(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<BulkBody>,
) -> AppResult<Json<Value>> {
    let reset_at = user_reset_at_ms(&state.pool, user.id).await?;
    let mut count = 0i64;
    for (k, card) in &body.cards {
        let Ok(idx) = k.parse::<i32>() else { continue };
        upsert_card(&state, user.id, idx, card, reset_at).await?;
        count += 1;
    }
    Ok(Json(json!({ "ok": true, "count": count })))
}

async fn upsert_card(
    state: &AppState,
    user_id: i64,
    idx: i32,
    c: &CardState,
    reset_at_ms: i64,
) -> AppResult<()> {
    let updated_at = c.updated_at.unwrap_or_else(|| Utc::now().timestamp_millis());
    // 重置前的卡不得 INSERT 复活
    if reset_at_ms > 0 && updated_at < reset_at_ms {
        return Ok(());
    }
    sqlx::query(
        r#"
        INSERT INTO cards (user_id, word_idx, learned, state, due, ivl, ease, reps, lapses, step, quiz, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12::DOUBLE PRECISION / 1000))
        ON CONFLICT (user_id, word_idx) DO UPDATE SET
            learned = EXCLUDED.learned,
            state = EXCLUDED.state,
            due = EXCLUDED.due,
            ivl = EXCLUDED.ivl,
            ease = EXCLUDED.ease,
            reps = EXCLUDED.reps,
            lapses = EXCLUDED.lapses,
            step = EXCLUDED.step,
            quiz = EXCLUDED.quiz,
            updated_at = EXCLUDED.updated_at
        WHERE cards.updated_at IS NULL OR EXCLUDED.updated_at >= cards.updated_at
        "#,
    )
    .bind(user_id)
    .bind(idx)
    .bind(c.learned.unwrap_or(false))
    .bind(&c.state)
    .bind(c.due)
    .bind(c.ivl)
    .bind(c.ease)
    .bind(c.reps)
    .bind(c.lapses)
    .bind(c.step)
    .bind(c.quiz)
    .bind(updated_at)
    .execute(&state.pool)
    .await?;
    Ok(())
}
