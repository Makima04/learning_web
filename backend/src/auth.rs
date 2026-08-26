use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use chrono::{DateTime, Duration, Utc};
use openssl::{hash::MessageDigest, pkcs5::pbkdf2_hmac};
use rand::RngCore;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub const PBKDF2_ITERS: u32 = 600_000;
pub const PBKDF2_ITERS_LEGACY: u32 = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasswordHashVersion {
    Current,
    Legacy,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub is_admin: bool,
    pub token: String,
}

fn hash_with(pw: &str, salt: &str, iters: u32) -> String {
    let mut dk = [0u8; 32];
    pbkdf2_hmac(
        pw.as_bytes(),
        salt.as_bytes(),
        iters as usize,
        MessageDigest::sha256(),
        &mut dk,
    )
    .expect("OpenSSL PBKDF2-HMAC-SHA256 failed");
    hex::encode(dk)
}

pub fn hash_password(pw: &str, salt: &str) -> String {
    hash_with(pw, salt, PBKDF2_ITERS)
}

/// 校验密码并返回命中的哈希版本，避免登录后为判断是否升级再做一次 PBKDF2。
pub fn verify_password(pw: &str, salt: &str, pw_hash: &str) -> Option<PasswordHashVersion> {
    let cur = hash_with(pw, salt, PBKDF2_ITERS);
    if constant_eq(&cur, pw_hash) {
        return Some(PasswordHashVersion::Current);
    }
    let legacy = hash_with(pw, salt, PBKDF2_ITERS_LEGACY);
    if constant_eq(&legacy, pw_hash) {
        Some(PasswordHashVersion::Legacy)
    } else {
        None
    }
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
    bearer_from_headers(&parts.headers)
}

/// 从 HeaderMap 解析 Bearer token（无 / 非法 → Unauthorized）。
pub fn bearer_from_headers(headers: &axum::http::HeaderMap) -> AppResult<String> {
    let auth = headers
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

/// 可选登录：无 token 或无效 token → None（不报错）。
pub async fn try_user(pool: &PgPool, headers: &axum::http::HeaderMap) -> Option<AuthUser> {
    let token = bearer_from_headers(headers).ok()?;
    require_user(pool, &token).await.ok()
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

#[cfg(test)]
mod tests {
    use super::*;

    const PASSWORD: &str = "compatibility-password";
    const SALT: &str = "compatibility-salt";
    const CURRENT_HASH: &str = "8b687f94fa33c2b5c6d44a76b1a1aec893ab0dd3b8d78d735cf56df442ec5b44";
    const LEGACY_HASH: &str = "95892dee0f2f21158d1f11a5e4eac745356c8a442c09abf57c02ad052e3f4046";

    #[test]
    fn openssl_pbkdf2_matches_existing_hash_format() {
        assert_eq!(hash_password(PASSWORD, SALT), CURRENT_HASH);
        assert_eq!(hash_with(PASSWORD, SALT, PBKDF2_ITERS_LEGACY), LEGACY_HASH);
        assert_eq!(
            verify_password(PASSWORD, SALT, CURRENT_HASH),
            Some(PasswordHashVersion::Current)
        );
        assert_eq!(
            verify_password(PASSWORD, SALT, LEGACY_HASH),
            Some(PasswordHashVersion::Legacy)
        );
        assert_eq!(verify_password("wrong", SALT, CURRENT_HASH), None);
    }
}
