use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;

use crate::auth::{
    gen_salt, gen_token, hash_password, session_expires_at, verify_password, AuthUser,
    PasswordHashVersion,
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

    let salt = gen_salt();
    let pw_hash = hash_password(&body.password, &salt);
    let mut tx = state.pool.begin().await?;

    let mut is_admin = false;
    if state.config.allow_first_admin {
        sqlx::query("SELECT pg_advisory_xact_lock($1)")
            .bind(0x4557_5f41_444d_494e_i64)
            .execute(&mut *tx)
            .await?;
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")
            .fetch_one(&mut *tx)
            .await?;
        if n == 0 {
            is_admin = true;
        }
    }

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
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(sqlx::Error::Database(db)) if db.constraint().is_some() => {
            return Err(AppError::Conflict("username already exists".into()));
        }
        Err(e) => return Err(e.into()),
    };

    let token = gen_token();
    let exp = session_expires_at(state.config.session_ttl_days);
    sqlx::query(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(&token)
    .bind(user_id)
    .bind(Utc::now())
    .bind(exp)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
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
    let total_started = Instant::now();
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "login", 10, 60)?;

    let username = body.username.trim().to_string();
    let lookup_started = Instant::now();
    let row = sqlx::query_as::<_, (i64, String, String, String, bool)>(
        "SELECT id, username, pw_hash, salt, is_admin FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&state.pool)
    .await?;
    let lookup_ms = lookup_started.elapsed().as_millis() as u64;

    let Some((id, username, pw_hash, salt, is_admin)) = row else {
        let _ = verify_password(&body.password, "english_web_missing_user", "");
        tracing::info!(
            event = "auth.login_timing",
            outcome = "invalid_credentials",
            account_found = false,
            lookup_ms,
            total_ms = total_started.elapsed().as_millis() as u64,
            "login timing"
        );
        return Err(AppError::Unauthorized("invalid credentials".into()));
    };

    let verify_started = Instant::now();
    let password_version = verify_password(&body.password, &salt, &pw_hash);
    let verify_ms = verify_started.elapsed().as_millis() as u64;
    let Some(password_version) = password_version else {
        tracing::info!(
            event = "auth.login_timing",
            outcome = "invalid_credentials",
            user_id = id,
            account_found = true,
            lookup_ms,
            verify_ms,
            total_ms = total_started.elapsed().as_millis() as u64,
            "login timing"
        );
        return Err(AppError::Unauthorized("invalid credentials".into()));
    };

    let rehash_needed = password_version == PasswordHashVersion::Legacy;
    let mut rehash_hash_ms = 0;
    let mut rehash_write_ms = 0;
    if rehash_needed {
        let rehash_hash_started = Instant::now();
        let new_hash = hash_password(&body.password, &salt);
        rehash_hash_ms = rehash_hash_started.elapsed().as_millis() as u64;

        let rehash_write_started = Instant::now();
        let _ = sqlx::query("UPDATE users SET pw_hash = $1 WHERE id = $2")
            .bind(&new_hash)
            .bind(id)
            .execute(&state.pool)
            .await;
        rehash_write_ms = rehash_write_started.elapsed().as_millis() as u64;
    }

    let session_started = Instant::now();
    let token = create_session(&state, id).await?;
    let session_ms = session_started.elapsed().as_millis() as u64;
    tracing::info!(
        event = "auth.login_timing",
        outcome = "success",
        user_id = id,
        lookup_ms,
        verify_ms,
        rehash_needed,
        rehash_hash_ms,
        rehash_write_ms,
        session_ms,
        total_ms = total_started.elapsed().as_millis() as u64,
        "login timing"
    );
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
