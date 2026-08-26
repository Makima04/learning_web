mod auth;
mod cards;
mod journal;
mod kg;
pub mod llm_cfg;
mod lookup;
mod meta;
mod paper;
mod parse;
mod politics;
mod sentences;
mod settings;
mod spa;
mod stats;
mod translate;

use axum::Router;

use crate::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(cards::router())
        .merge(meta::router())
        .merge(settings::router())
        .merge(journal::router())
        .merge(kg::router())
        .merge(sentences::router())
        .merge(translate::router())
        .merge(lookup::router())
        .merge(parse::router())
        .merge(paper::router())
        .merge(politics::router())
        .merge(llm_cfg::router())
        .merge(stats::router())
}

pub fn spa_router() -> Router<AppState> {
    spa::router()
}
