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

/// 这些文件变了就要立刻生效：入口文档（发版）、sw.js（SW 更新检查）、
/// manifest（图标/配色）、data/papers（词库/真题更新）。其余带 hash 资产可长缓存。
/// no-cache = 每次条件请求验证，未变则 304，代价可忽略。
const NO_CACHE_PATHS: [&str; 6] = [
    "",
    "index.html",
    "sw.js",
    "manifest.webmanifest",
    "data.js",
    "papers.js",
];

async fn spa_fallback(State(state): State<AppState>, req: Request<Body>) -> Response {
    let dir = &state.config.static_dir;
    if !dir.is_dir() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "frontend/dist missing — run: cd frontend && npm run build",
        )
            .into_response();
    }

    // owned：path 后面要在 req move 进 oneshot 之后继续使用，不能挂着 req 的借用
    let path = req.uri().path().trim_start_matches('/').to_string();
    // block path traversal
    if path.contains("..") {
        return StatusCode::NOT_FOUND.into_response();
    }

    let file_path = if path.is_empty() {
        dir.join("index.html")
    } else {
        dir.join(&path)
    };

    if file_path.is_file() {
        // serve via ServeDir for correct content-type
        let svc = ServeDir::new(dir);
        return match svc.oneshot(req).await {
            Ok(mut res) => {
                if NO_CACHE_PATHS.contains(&path.as_str()) {
                    res.headers_mut().insert(
                        header::CACHE_CONTROL,
                        header::HeaderValue::from_static("no-cache"),
                    );
                }
                res.into_response()
            }
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
            // 深链回退返回的也是入口文档，与 "/" 同样必须每次验证，不能被启发式缓存
            res.headers_mut().insert(
                header::CACHE_CONTROL,
                header::HeaderValue::from_static("no-cache"),
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
