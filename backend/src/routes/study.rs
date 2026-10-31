use crate::{
    auth::AuthUser,
    error::AppResult,
    services::study::{self, Completion},
    state::AppState,
};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct BulkCompletions {
    completions: Vec<Completion>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/study/completions/bulk", post(complete))
        .route("/api/study/import", post(import))
        .route("/api/study/protocol", get(protocol))
}

async fn protocol() -> Json<Value> {
    Json(
        serde_json::json!({"version":2,"atomic_completions":true,"snapshot_import":true,"legacy_writes":true}),
    )
}

async fn import(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<crate::services::study_import::Snapshot>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        crate::services::study_import::import(&state.pool, user.id, &body).await?,
    ))
}

async fn complete(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<BulkCompletions>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        study::complete(&state.pool, user.id, &body.completions).await?,
    ))
}
