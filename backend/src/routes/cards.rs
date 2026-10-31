use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::services::cards::{normalize_due, upsert_card, CardState};
use crate::state::AppState;

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

#[derive(Deserialize)]
struct ListCardsQuery {
    /// 只返回 updated_at > since（毫秒）的卡；缺省为全量
    since: Option<i64>,
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
    Query(q): Query<ListCardsQuery>,
) -> AppResult<Json<Value>> {
    let since = q.since.filter(|n| *n > 0);
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
        FROM cards
        WHERE user_id = $1
          AND ($2::BIGINT IS NULL OR (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT > $2)
        "#,
    )
    .bind(user.id)
    .bind(since)
    .fetch_all(&state.pool)
    .await?;

    let mut cards = Map::new();
    for (idx, learned, state_s, due, ivl, ease, reps, lapses, step, quiz, updated_at) in rows {
        let due = normalize_due(due, state_s.as_deref(), quiz);
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
        "partial": since.is_some(),
        "server_ms": Utc::now().timestamp_millis(),
    })))
}

async fn put_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(idx): Path<i32>,
    Json(body): Json<CardPutBody>,
) -> AppResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let reset_at = crate::services::study::lock_progress(&mut tx, user.id).await?;
    upsert_card(&mut *tx, user.id, idx, &body.card, reset_at).await?;
    tx.commit().await?;
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
        .unwrap_or_else(crate::day::today_key);
    let now = Utc::now();

    let mut tx = state.pool.begin().await?;
    crate::services::study::lock_progress(&mut tx, user.id).await?;
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
    let mut tx = state.pool.begin().await?;
    let reset_at = crate::services::study::lock_progress(&mut tx, user.id).await?;
    let mut count = 0i64;
    for (k, card) in &body.cards {
        let Ok(idx) = k.parse::<i32>() else { continue };
        upsert_card(&mut *tx, user.id, idx, card, reset_at).await?;
        count += 1;
    }
    tx.commit().await?;
    Ok(Json(json!({ "ok": true, "count": count })))
}

#[cfg(test)]
mod tests {
    use super::normalize_due;

    fn ms(value: &str) -> i64 {
        chrono::DateTime::parse_from_rfc3339(value)
            .unwrap()
            .timestamp_millis()
    }

    #[test]
    fn legacy_day_based_cards_are_due_at_beijing_midnight() {
        let due = Some(ms("2026-11-01T20:00:00+08:00"));
        let midnight = Some(ms("2026-11-01T00:00:00+08:00"));
        assert_eq!(normalize_due(due, Some("review"), None), midnight);
        assert_eq!(normalize_due(due, Some("learn"), Some(2)), midnight);
        assert_eq!(normalize_due(due, Some("learn"), Some(3)), midnight);
        assert_eq!(normalize_due(midnight, Some("review"), None), midnight);
    }

    #[test]
    fn uses_beijing_date_even_before_utc_midnight() {
        let due = Some(ms("2026-10-31T23:00:00Z"));
        assert_eq!(
            normalize_due(due, Some("review"), Some(0)),
            Some(ms("2026-11-01T00:00:00+08:00")),
        );
    }

    #[test]
    fn preserves_minute_steps_and_empty_due_values() {
        let due = Some(ms("2026-11-01T00:05:00+08:00"));
        assert_eq!(normalize_due(due, Some("learn"), Some(1)), due);
        assert_eq!(normalize_due(due, Some("new"), None), due);
        assert_eq!(normalize_due(None, Some("review"), None), None);
        assert_eq!(normalize_due(Some(0), Some("review"), None), Some(0));
    }
}
