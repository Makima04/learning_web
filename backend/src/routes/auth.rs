use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::{
    gen_salt, gen_token, hash_password, needs_rehash, session_expires_at, verify_password, AuthUser,
};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct AuthBody {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct UserOut {
    id: i64,
    username: String,
    is_admin: bool,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<AuthBody>,
) -> AppResult<Json<serde_json::Value>> {
    let username = body.username.trim().to_string();
    if username.is_empty() || username.len() > 32 {
        return Err(AppError::BadRequest(
            "username must be 1–32 characters".into(),
        ));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let mut is_admin = false;
    if state.config.allow_first_admin {
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")
            .fetch_one(&state.pool)
            .await?;
        if n == 0 {
            is_admin = true;
        }
    }

    let salt = gen_salt();
    let pw_hash = hash_password(&body.password, &salt);

    let user_id: i64 = match sqlx::query_scalar(
        r#"
        INSERT INTO users (username, pw_hash, salt, is_admin)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(&username)
    .bind(&pw_hash)
    .bind(&salt)
    .bind(is_admin)
    .fetch_one(&state.pool)
    .await
    {
        Ok(id) => id,
        Err(sqlx::Error::Database(db)) if db.constraint().is_some() => {
            return Err(AppError::Conflict("username already exists".into()));
        }
        Err(e) => return Err(e.into()),
    };

    let token = create_session(&state, user_id).await?;
    Ok(Json(json!({
        "token": token,
        "user": UserOut { id: user_id, username, is_admin },
    })))
}

async fn login(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<AuthBody>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = db::client_ip(&headers, Some(addr));
    state.rate.check(&ip, "login", 10, 60)?;

    let username = body.username.trim().to_string();
    let row = sqlx::query_as::<_, (i64, String, String, String, bool)>(
        "SELECT id, username, pw_hash, salt, is_admin FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&state.pool)
    .await?;

    let Some((id, username, pw_hash, salt, is_admin)) = row else {
        return Err(AppError::Unauthorized("invalid credentials".into()));
    };

    if !verify_password(&body.password, &salt, &pw_hash) {
        return Err(AppError::Unauthorized("invalid credentials".into()));
    }

    if needs_rehash(&body.password, &salt, &pw_hash) {
        let new_hash = hash_password(&body.password, &salt);
        let _ = sqlx::query("UPDATE users SET pw_hash = $1 WHERE id = $2")
            .bind(&new_hash)
            .bind(id)
            .execute(&state.pool)
            .await;
    }

    let token = create_session(&state, id).await?;
    Ok(Json(json!({
        "token": token,
        "user": UserOut { id, username, is_admin },
    })))
}

async fn logout(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM sessions WHERE token = $1")
        .bind(&user.token)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn me(user: AuthUser) -> Json<serde_json::Value> {
    Json(json!({
        "user": {
            "id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
        }
    }))
}

async fn create_session(state: &AppState, user_id: i64) -> AppResult<String> {
    let token = gen_token();
    let exp = session_expires_at(state.config.session_ttl_days);
    sqlx::query(
        r#"
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(&token)
    .bind(user_id)
    .bind(Utc::now())
    .bind(exp)
    .execute(&state.pool)
    .await?;
    Ok(token)
}
