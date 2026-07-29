use axum::{
    extract::{Path, State},
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
    Ok(Json(json!({ "cards": cards })))
}

async fn put_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(idx): Path<i32>,
    Json(body): Json<CardPutBody>,
) -> AppResult<Json<Value>> {
    upsert_card(&state, user.id, idx, &body.card).await?;
    Ok(Json(json!({ "ok": true })))
}

/// 清空当前用户全部卡片（设置页「重置进度」）。
async fn delete_all_cards(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Value>> {
    let result = sqlx::query("DELETE FROM cards WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "deleted": result.rows_affected(),
    })))
}

async fn bulk_cards(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<BulkBody>,
) -> AppResult<Json<Value>> {
    let mut count = 0i64;
    for (k, card) in &body.cards {
        let Ok(idx) = k.parse::<i32>() else { continue };
        upsert_card(&state, user.id, idx, card).await?;
        count += 1;
    }
    Ok(Json(json!({ "ok": true, "count": count })))
}

async fn upsert_card(
    state: &AppState,
    user_id: i64,
    idx: i32,
    c: &CardState,
) -> AppResult<()> {
    let updated_at = c.updated_at.unwrap_or_else(|| Utc::now().timestamp_millis());
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
