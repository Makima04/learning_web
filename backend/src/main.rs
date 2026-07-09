mod auth;
mod config;
mod db;
mod error;
mod llm;
mod rate_limit;
mod routes;
mod state;

use std::net::SocketAddr;

use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;
use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "english_web_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    tracing::info!(url = %config.database_url, "connecting database");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    db::init_schema(&pool).await?;
    tracing::info!("schema ready");

    // seed active model from conf if empty
    if let Ok(None) = db::get_config_value(&pool, "active_llm_model").await {
        if !config.llm_model.is_empty() {
            let _ = db::set_config_value(&pool, "active_llm_model", &config.llm_model).await;
        }
    }

    let state = AppState::new(pool, config.clone());

    let app = Router::new()
        .merge(routes::api_router())
        .merge(routes::spa_router())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    tracing::info!(%addr, "listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
