use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use chrono::{DateTime, Duration, Utc};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub const PBKDF2_ITERS: u32 = 600_000;
pub const PBKDF2_ITERS_LEGACY: u32 = 100_000;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub is_admin: bool,
    pub token: String,
}

fn hash_with(pw: &str, salt: &str, iters: u32) -> String {
    let mut dk = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pw.as_bytes(), salt.as_bytes(), iters, &mut dk);
    hex::encode(dk)
}

pub fn hash_password(pw: &str, salt: &str) -> String {
    hash_with(pw, salt, PBKDF2_ITERS)
}

pub fn verify_password(pw: &str, salt: &str, pw_hash: &str) -> bool {
    let cur = hash_with(pw, salt, PBKDF2_ITERS);
    if constant_eq(&cur, pw_hash) {
        return true;
    }
    let legacy = hash_with(pw, salt, PBKDF2_ITERS_LEGACY);
    constant_eq(&legacy, pw_hash)
}

pub fn needs_rehash(pw: &str, salt: &str, pw_hash: &str) -> bool {
    if constant_eq(&hash_with(pw, salt, PBKDF2_ITERS), pw_hash) {
        return false;
    }
    constant_eq(&hash_with(pw, salt, PBKDF2_ITERS_LEGACY), pw_hash)
}

fn constant_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn gen_salt() -> String {
    let mut buf = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub fn gen_token() -> String {
    use base64::Engine;
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

pub fn session_expires_at(ttl_days: i64) -> DateTime<Utc> {
    Utc::now() + Duration::days(ttl_days)
}

pub async fn require_user(pool: &PgPool, token: &str) -> AppResult<AuthUser> {
    if token.is_empty() {
        return Err(AppError::Unauthorized("empty token".into()));
    }
    let row = sqlx::query_as::<_, (i64, Option<DateTime<Utc>>, String, bool)>(
        r#"
        SELECT s.user_id, s.expires_at, u.username, u.is_admin
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;

    let Some((user_id, expires_at, username, is_admin)) = row else {
        return Err(AppError::Unauthorized("invalid token".into()));
    };

    if let Some(exp) = expires_at {
        if Utc::now() >= exp {
            let _ = sqlx::query("DELETE FROM sessions WHERE token = $1")
                .bind(token)
                .execute(pool)
                .await;
            return Err(AppError::Unauthorized("session expired".into()));
        }
    }

    Ok(AuthUser {
        id: user_id,
        username,
        is_admin,
        token: token.to_string(),
    })
}

pub async fn require_admin(pool: &PgPool, token: &str) -> AppResult<AuthUser> {
    let user = require_user(pool, token).await?;
    if !user.is_admin {
        return Err(AppError::Forbidden("admin only".into()));
    }
    Ok(user)
}

fn extract_bearer(parts: &Parts) -> AppResult<String> {
    let auth = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !auth.to_ascii_lowercase().starts_with("bearer ") {
        return Err(AppError::Unauthorized("missing bearer token".into()));
    }
    let token = auth[7..].trim().to_string();
    if token.is_empty() {
        return Err(AppError::Unauthorized("empty token".into()));
    }
    Ok(token)
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(parts)?;
        require_user(&state.pool, &token).await
    }
}

/// Admin-only extractor.
pub struct AdminUser(pub AuthUser);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(parts)?;
        let user = require_admin(&state.pool, &token).await?;
        Ok(AdminUser(user))
    }
}
