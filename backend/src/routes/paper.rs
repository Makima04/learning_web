use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AdminUser;
use crate::error::AppResult;
use crate::llm;
use crate::state::AppState;

#[derive(Deserialize)]
struct GetQ {
    year: i32,
    #[serde(default = "default_variant")]
    variant: String,
    section: String,
    #[serde(default)]
    label: String,
}

fn default_variant() -> String {
    "en1".into()
}

#[derive(Deserialize)]
struct PostBody {
    year: i32,
    #[serde(default = "default_variant")]
    variant: String,
    section: String,
    #[serde(default)]
    label: String,
    answers: Value,
    #[serde(default)]
    source: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/paper-answers",
        get(get_answers).post(post_answers),
    )
}

async fn get_answers(
    State(state): State<AppState>,
    Query(q): Query<GetQ>,
) -> AppResult<Json<Value>> {
    let key = format!("{}|{}|{}|{}", q.year, q.variant, q.section, q.label);
    let row = sqlx::query_as::<_, (Value, Option<String>)>(
        "SELECT answers, source FROM paper_answers WHERE cache_key = $1",
    )
    .bind(&key)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((answers, source)) => Ok(Json(json!({
            "answers": answers,
            "source": source,
            "cached": true,
        }))),
        None => Ok(Json(json!({
            "answers": {},
            "source": Value::Null,
            "cached": false,
        }))),
    }
}

async fn post_answers(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PostBody>,
) -> AppResult<Json<Value>> {
    let key = format!(
        "{}|{}|{}|{}",
        body.year, body.variant, body.section, body.label
    );
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let now = Utc::now();
    sqlx::query(
        r#"
        INSERT INTO paper_answers (cache_key, answers, source, model, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $5)
        ON CONFLICT (cache_key) DO UPDATE SET
            answers = EXCLUDED.answers,
            source = EXCLUDED.source,
            model = EXCLUDED.model,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(&key)
    .bind(&body.answers)
    .bind(body.source.as_deref().unwrap_or("llm"))
    .bind(&model)
    .bind(now)
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "ok": true, "cache_key": key })))
}
