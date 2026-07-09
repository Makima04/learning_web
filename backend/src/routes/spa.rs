use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::path::PathBuf;
use tower::ServiceExt;
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().fallback(get(spa_fallback))
}

async fn spa_fallback(State(state): State<AppState>, req: Request<Body>) -> Response {
    let dir = &state.config.static_dir;
    if !dir.is_dir() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "frontend/dist missing — run: cd frontend && npm run build",
        )
            .into_response();
    }

    let path = req.uri().path().trim_start_matches('/');
    // block path traversal
    if path.contains("..") {
        return StatusCode::NOT_FOUND.into_response();
    }

    let file_path = if path.is_empty() {
        dir.join("index.html")
    } else {
        dir.join(path)
    };

    if file_path.is_file() {
        // serve via ServeDir for correct content-type
        let svc = ServeDir::new(dir);
        return match svc.oneshot(req).await {
            Ok(res) => res.into_response(),
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    }

    // SPA fallback
    let index = dir.join("index.html");
    if !index.is_file() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "frontend/dist/index.html missing",
        )
            .into_response();
    }

    match tokio::fs::read(&index).await {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            *res.status_mut() = StatusCode::OK;
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static("text/html; charset=utf-8"),
            );
            res
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

#[allow(dead_code)]
fn _paths() -> PathBuf {
    PathBuf::new()
}

#[allow(dead_code)]
fn _serve_file(p: PathBuf) -> ServeFile {
    ServeFile::new(p)
}
