// 生词表 / 熟词表：按词 LWW，登录后跨设备同步。
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::routes::cards::user_reset_at_ms;
use crate::state::AppState;

const MAX_WORD_IDX: i32 = 6550;
const MAX_BULK: usize = 2000;

#[derive(Debug, Clone, Deserialize)]
struct WordListItem {
    kind: String,
    #[serde(default)]
    updated_at: Option<i64>,
}

#[derive(Deserialize)]
struct BulkBody {
    items: HashMap<String, WordListItem>,
}

fn valid_kind(kind: &str) -> bool {
    matches!(kind, "new" | "known" | "none")
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/word-lists", get(list_word_lists).delete(delete_all))
        .route("/api/word-lists/bulk", post(bulk_word_lists))
}

async fn list_word_lists(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let reset_at = user_reset_at_ms(&state.pool, user.id).await?;
    let rows = sqlx::query_as::<_, (i32, String, Option<i64>)>(
        r#"
        SELECT word_idx, kind, (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT
        FROM word_lists
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let mut items = Map::new();
    for (idx, kind, updated_at) in rows {
        items.insert(
            idx.to_string(),
            json!({
                "kind": kind,
                "updated_at": updated_at.unwrap_or(0),
            }),
        );
    }

    Ok(Json(json!({
        "items": items,
        "reset_at": reset_at,
        "server_ms": Utc::now().timestamp_millis(),
    })))
}

async fn bulk_word_lists(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<BulkBody>,
) -> AppResult<Json<Value>> {
    if body.items.len() > MAX_BULK {
        return Err(AppError::BadRequest(format!(
            "word-lists bulk too large (max {MAX_BULK})"
        )));
    }
    let reset_at = user_reset_at_ms(&state.pool, user.id).await?;
    let mut count = 0i64;
    for (k, item) in &body.items {
        let Ok(idx) = k.parse::<i32>() else { continue };
        if idx < 1 || idx > MAX_WORD_IDX {
            continue;
        }
        if !valid_kind(&item.kind) {
            return Err(AppError::BadRequest(format!("invalid kind for {idx}")));
        }
        upsert_item(&state, user.id, idx, item, reset_at).await?;
        count += 1;
    }
    Ok(Json(json!({ "ok": true, "count": count })))
}

async fn delete_all(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let res = sqlx::query("DELETE FROM word_lists WHERE user_id = $1")
        .bind(user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "deleted": res.rows_affected(),
    })))
}

async fn upsert_item(
    state: &AppState,
    user_id: i64,
    idx: i32,
    item: &WordListItem,
    reset_at_ms: i64,
) -> AppResult<()> {
    let updated_at = item
        .updated_at
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    if reset_at_ms > 0 && updated_at < reset_at_ms {
        return Ok(());
    }
    sqlx::query(
        r#"
        INSERT INTO word_lists (user_id, word_idx, kind, updated_at)
        VALUES ($1, $2, $3, to_timestamp($4::DOUBLE PRECISION / 1000))
        ON CONFLICT (user_id, word_idx) DO UPDATE SET
            kind = EXCLUDED.kind,
            updated_at = EXCLUDED.updated_at
        WHERE word_lists.updated_at IS NULL OR EXCLUDED.updated_at >= word_lists.updated_at
        "#,
    )
    .bind(user_id)
    .bind(idx)
    .bind(&item.kind)
    .bind(updated_at)
    .execute(&state.pool)
    .await?;
    Ok(())
}
