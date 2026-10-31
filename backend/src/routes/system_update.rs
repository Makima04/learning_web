//! 管理员只发起预定义更新任务；镜像、Compose 与数据库由主机更新服务控制。
use axum::{
    extract::{Request, State},
    http::{header, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

use crate::{auth::AdminUser, error::AppResult, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/system/version", get(version))
        .route("/api/admin/update", get(status))
        .route("/api/admin/update/check", post(check))
        .route("/api/admin/update/install", post(install))
}

fn build_version() -> &'static str {
    option_env!("EW_VERSION")
        .filter(|v| !v.is_empty())
        .unwrap_or("dev")
}

/// 更新期间冻结业务写入。队列收到 503 会保留操作，切换完成后重试。
/// 故障恢复前不开放写入，保证失败时恢复备份不会丢掉已确认的新数据。
pub async fn maintenance(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let path = req.uri().path();
    let control = matches!(
        path,
        "/api/admin/update" | "/api/admin/update/check" | "/api/admin/update/install"
    );
    let health = matches!(path, "/api/system/version" | "/api/study/protocol");
    // 一些旧 GET 会初始化统计或清理数据，维护期间一并暂停业务 API。
    if path.starts_with("/api/") && !control && !health {
        if let Some(flag) = &state.config.update_maintenance_file {
            match tokio::fs::metadata(flag).await {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                _ => return unavailable("系统正在更新，请稍后重试；待同步学习记录会保留"),
            }
        }
    }
    next.run(req).await
}

fn unavailable(message: &str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [
            (header::RETRY_AFTER, "5"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Json(json!({"detail": message})),
    )
        .into_response()
}

async fn version() -> impl IntoResponse {
    (
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({"version": build_version()})),
    )
}

async fn status(State(state): State<AppState>, _admin: AdminUser) -> Response {
    if state.config.update_socket.is_none() {
        return (
            [(header::CACHE_CONTROL, "no-store")],
            Json(json!({
                "enabled": false, "current_version": build_version(),
                "message": "尚未安装服务器更新服务，请先完成一次初始化部署"
            })),
        )
            .into_response();
    }
    bridge(&state, Method::GET, "/status", None).await
}

async fn check(State(state): State<AppState>, AdminUser(admin): AdminUser) -> AppResult<Response> {
    state
        .rate
        .check(&admin.id.to_string(), "system-update", 10, 60)?;
    Ok(bridge(
        &state,
        Method::POST,
        "/check",
        Some(json!({"requested_by": admin.username})),
    )
    .await)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Install {
    digest: String,
}

async fn install(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Json(body): Json<Install>,
) -> AppResult<Response> {
    state
        .rate
        .check(&admin.id.to_string(), "system-update", 10, 60)?;
    if !body
        .digest
        .strip_prefix("sha256:")
        .is_some_and(|v| v.len() == 64 && v.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return Err(crate::error::AppError::BadRequest(
            "镜像摘要不合法，请重新检查更新".into(),
        ));
    }
    Ok(bridge(
        &state,
        Method::POST,
        "/install",
        Some(json!({
            "digest": body.digest, "requested_by": admin.username
        })),
    )
    .await)
}

async fn bridge(state: &AppState, method: Method, path: &str, body: Option<Value>) -> Response {
    let Some(socket) = &state.config.update_socket else {
        return unavailable("服务器更新服务尚未安装");
    };
    let result = async {
        let client = reqwest::Client::builder()
            .unix_socket(socket.clone())
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(5))
            .build()?;
        let mut request = client.request(method, format!("http://localhost{path}"));
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await?;
        let status = response.status();
        let mut value = response.json::<Value>().await?;
        if let Some(object) = value.as_object_mut() {
            object.insert("enabled".into(), json!(true));
            object.insert("current_version".into(), json!(build_version()));
        }
        Ok::<_, reqwest::Error>((status, value))
    }
    .await;
    match result {
        Ok((status, value)) => {
            (status, [(header::CACHE_CONTROL, "no-store")], Json(value)).into_response()
        }
        Err(error) => {
            tracing::warn!(%error, "local updater unavailable");
            unavailable("暂时无法连接服务器更新服务，请稍后重试")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Config, state::LlmRuntime};
    use axum::body::Body;
    use http_body_util::BodyExt;
    use sqlx::PgPool;
    use tower::ServiceExt;

    fn state(pool: PgPool) -> AppState {
        let mut config = Config::from_env();
        config.update_socket = None;
        config.update_maintenance_file = None;
        AppState::new(pool, config, LlmRuntime::default())
    }

    async fn account(pool: &PgPool, admin: bool) -> String {
        let token = crate::auth::gen_token();
        let id: i64 = sqlx::query_scalar("INSERT INTO users(username,pw_hash,salt,is_admin) VALUES($1,'test','test',$2) RETURNING id")
            .bind(&token).bind(admin).fetch_one(pool).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",
        )
        .bind(&token)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
        token
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn update_controls_enforce_admin_on_every_endpoint(pool: PgPool) {
        let user = account(&pool, false).await;
        let admin = account(&pool, true).await;
        let app = router().with_state(state(pool));
        for (path, method, body) in [
            ("/api/admin/update", "GET", ""),
            ("/api/admin/update/check", "POST", "{}"),
            (
                "/api/admin/update/install",
                "POST",
                "{\"digest\":\"sha256:abc\"}",
            ),
        ] {
            for (token, expected) in [
                ("", StatusCode::UNAUTHORIZED),
                (user.as_str(), StatusCode::FORBIDDEN),
            ] {
                let response = app
                    .clone()
                    .oneshot(
                        Request::builder()
                            .uri(path)
                            .method(method)
                            .header(header::AUTHORIZATION, format!("Bearer {token}"))
                            .header(header::CONTENT_TYPE, "application/json")
                            .body(Body::from(body))
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), expected, "{method} {path}");
            }
        }
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/admin/update")
                    .header(header::AUTHORIZATION, format!("Bearer {admin}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let data: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(data["enabled"], false);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn maintenance_blocks_business_reads_and_writes_but_keeps_controls(pool: PgPool) {
        let dir = std::env::temp_dir().join(format!("ew-maintenance-{}", crate::auth::gen_salt()));
        tokio::fs::create_dir(&dir).await.unwrap();
        let flag = dir.join("maintenance.json");
        let mut state = state(pool);
        state.config.update_maintenance_file = Some(flag.clone());
        let app = Router::new()
            .merge(router())
            .route(
                "/api/business",
                get(|| async { "ok" }).post(|| async { "ok" }),
            )
            .layer(axum::middleware::from_fn_with_state(
                state.clone(),
                maintenance,
            ))
            .with_state(state);
        for active in [false, true, false] {
            if active {
                tokio::fs::write(&flag, "{}").await.unwrap();
            } else {
                let _ = tokio::fs::remove_file(&flag).await;
            }
            for method in ["GET", "POST", "DELETE"] {
                let response = app
                    .clone()
                    .oneshot(
                        Request::builder()
                            .uri("/api/business")
                            .method(method)
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                let expected = if active {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if method == "DELETE" {
                    StatusCode::METHOD_NOT_ALLOWED
                } else {
                    StatusCode::OK
                };
                assert_eq!(response.status(), expected);
            }
            let health = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/system/version")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(health.status(), StatusCode::OK);
            let control = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/admin/update")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(control.status(), StatusCode::UNAUTHORIZED);
        }
        tokio::fs::remove_dir(dir).await.unwrap();
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn bridge_uses_unix_socket_and_does_not_forward_credentials(pool: PgPool) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        // macOS 的 $TMPDIR 较长，Unix socket 路径上限约 104 字节。
        let dir =
            std::path::Path::new("/tmp").join(format!("ewu-{}", &crate::auth::gen_salt()[..12]));
        tokio::fs::create_dir(&dir).await.unwrap();
        let socket = dir.join("updater.sock");
        let listener = tokio::net::UnixListener::bind(&socket).unwrap();
        let peer = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = [0; 4096];
            let count = stream.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..count]);
            assert!(request.starts_with("GET /status HTTP/1.1"));
            assert!(!request.to_lowercase().contains("authorization:"));
            let body = r#"{"job":null,"available":null}"#;
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).as_bytes()).await.unwrap();
        });
        let admin = account(&pool, true).await;
        let mut state = state(pool);
        state.config.update_socket = Some(socket);
        let response = router()
            .with_state(state)
            .oneshot(
                Request::builder()
                    .uri("/api/admin/update")
                    .header(header::AUTHORIZATION, format!("Bearer {admin}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(body["enabled"], true);
        peer.await.unwrap();
        tokio::fs::remove_dir_all(dir).await.unwrap();
    }
}
