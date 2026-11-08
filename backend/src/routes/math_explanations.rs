use crate::{
    auth::AuthUser, db, error::AppResult, services::math_explanations as service, state::AppState,
};
use axum::{
    extract::{ConnectInfo, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;
use std::net::SocketAddr;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Item {
    item_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StartItem {
    item_id: String,
    #[serde(default)]
    regenerate: bool,
}
pub fn router() -> Router<AppState> {
    Router::new().route("/api/math/explanations", get(read).post(start))
}
async fn read(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(body): Query<Item>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "math_explanation_read", 120, 60)?;
    Ok(Json(service::get(&state, &body.item_id).await?))
}
async fn start(
    State(state): State<AppState>,
    user: AuthUser,
    headers: axum::http::HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<StartItem>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "math_explanation_start", 20, 60)?;
    state.rate.check(
        &format!("u{}", user.id),
        "math_explanation_start_user",
        6,
        60,
    )?;
    Ok(Json(
        service::enqueue(&state, &body.item_id, user.id, body.regenerate).await?,
    ))
}
