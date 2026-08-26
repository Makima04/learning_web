use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Deserialize)]
struct ListQuery {
    #[serde(default = "default_status")]
    status: String,
    q: Option<String>,
    #[serde(default = "default_page")]
    page: i64,
    #[serde(default = "default_size")]
    size: i64,
}

fn default_status() -> String {
    "all".into()
}
fn default_page() -> i64 {
    1
}
fn default_size() -> i64 {
    50
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/sentences/stats", get(stats))
        .route("/api/sentences", get(list_sentences))
        .route("/api/sentences/{sid}", get(get_sentence))
}

async fn stats(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sentences")
        .fetch_one(&state.pool)
        .await?;
    let translated: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM translations
        WHERE status IS NOT NULL AND status != 'error'
        "#,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({
        "total": total,
        "translated": translated,
        "untranslated": (total - translated).max(0),
    })))
}

async fn list_sentences(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    let page = q.page.max(1);
    let size = q.size.clamp(1, 200);
    let offset = (page - 1) * size;
    let status = q.status.as_str();
    let search = q.q.as_deref().unwrap_or("").trim();

    // counts
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sentences")
        .fetch_one(&state.pool)
        .await?;
    let translated: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM translations WHERE status IS NOT NULL AND status != 'error'",
    )
    .fetch_one(&state.pool)
    .await?;
    let parsed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM parses WHERE status IS NOT NULL AND status != 'error'",
    )
    .fetch_one(&state.pool)
    .await?;

    // Filter via SQL fragments
    let like = if search.is_empty() {
        None
    } else {
        Some(format!("%{search}%"))
    };

    // Use a unified query with optional filters in WHERE
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            String,
            Option<i32>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ),
    >(
        r#"
        SELECT s.id, s.text, s.year, s.label, t.zh, t.status,
               p.content, p.status
        FROM sentences s
        LEFT JOIN translations t ON t.sentence_id = s.id
        LEFT JOIN parses p ON p.sentence_id = s.id
        WHERE
          ($1::text IS NULL OR s.text ILIKE $1)
          AND (
            $2 = 'all'
            OR ($2 = 'translated' AND t.status IS NOT NULL AND t.status != 'error')
            OR ($2 = 'untranslated' AND (t.status IS NULL OR t.status = 'error'))
            OR ($2 = 'parsed' AND p.status IS NOT NULL AND p.status != 'error')
            OR ($2 = 'unparsed' AND (p.status IS NULL OR p.status = 'error'))
          )
        ORDER BY s.id
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(like.as_deref())
    .bind(status)
    .bind(size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<Value> = rows
        .into_iter()
        .map(
            |(id, text, year, label, zh, t_status, p_content, p_status)| {
                let parse = match (p_content, p_status) {
                    (Some(c), Some(st)) => Some(json!({"content": c, "status": st})),
                    _ => None,
                };
                json!({
                    "id": id,
                    "text": text,
                    "zh": zh,
                    "status": t_status,
                    "year": year,
                    "label": label,
                    "parse": parse,
                })
            },
        )
        .collect();

    Ok(Json(json!({
        "items": items,
        "total": total,
        "translated": translated,
        "untranslated": (total - translated).max(0),
        "parsed": parsed,
        "unparsed": (total - parsed).max(0),
    })))
}

async fn get_sentence(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(sid): Path<i64>,
) -> AppResult<Json<Value>> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            Option<i32>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ),
    >(
        r#"
        SELECT s.id, s.text, s.year, s.label, t.zh, t.status, p.content, p.status
        FROM sentences s
        LEFT JOIN translations t ON t.sentence_id = s.id
        LEFT JOIN parses p ON p.sentence_id = s.id
        WHERE s.id = $1
        "#,
    )
    .bind(sid)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("sentence not found".into()))?;

    let (id, text, year, label, zh, t_status, p_content, p_status) = row;
    let parse = match (p_content, p_status) {
        (Some(c), Some(st)) => Some(json!({"content": c, "status": st})),
        _ => None,
    };
    Ok(Json(json!({
        "id": id,
        "text": text,
        "zh": zh,
        "status": t_status,
        "year": year,
        "label": label,
        "parse": parse,
    })))
}
