use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use openssl::{hash::MessageDigest, pkcs5::pbkdf2_hmac};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;

use crate::auth::{
    gen_salt, gen_token, hash_password, session_expires_at, verify_password, AuthUser,
    PasswordHashVersion,
};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::mail;
use crate::state::AppState;

const CODE_TTL_MINS: i64 = 10;
const CODE_MAX_ATTEMPTS: i32 = 5;
/// 验证码专用盐前缀（与密码盐分离）
const CODE_PEPPER: &str = "ew_email_code_v1";

#[derive(Deserialize)]
pub struct AuthBody {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct SendCodeBody {
    email: String,
    /// "register" | "login"
    purpose: String,
}

#[derive(Deserialize)]
struct RegisterEmailBody {
    email: String,
    code: String,
    /// 可选显示名；默认取邮箱 @ 前
    username: Option<String>,
    /// 可选密码；不填则仅验证码登录
    password: Option<String>,
}

#[derive(Deserialize)]
struct LoginEmailBody {
    email: String,
    code: String,
}

#[derive(Serialize)]
struct UserOut {
    id: i64,
    username: String,
    is_admin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/auth/email/send-code", post(send_code))
        .route("/api/auth/email/register", post(register_email))
        .route("/api/auth/email/login", post(login_email))
}

fn normalize_email(raw: &str) -> AppResult<String> {
    let e = raw.trim().to_lowercase();
    if e.len() < 5 || e.len() > 254 || !e.contains('@') {
        return Err(AppError::BadRequest("invalid email".into()));
    }
    let mut parts = e.split('@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");
    if local.is_empty() || domain.is_empty() || !domain.contains('.') || parts.next().is_some() {
        return Err(AppError::BadRequest("invalid email".into()));
    }
    Ok(e)
}

fn hash_code(email: &str, purpose: &str, code: &str) -> String {
    let mut dk = [0u8; 32];
    let salt = format!("{CODE_PEPPER}:{purpose}:{email}");
    pbkdf2_hmac(
        code.as_bytes(),
        salt.as_bytes(),
        50_000,
        MessageDigest::sha256(),
        &mut dk,
    )
    .expect("pbkdf2");
    hex::encode(dk)
}

fn gen_code_6() -> String {
    let n: u32 = rand::thread_rng().gen_range(0..1_000_000);
    format!("{n:06}")
}

fn username_from_email(email: &str) -> String {
    let base = email.split('@').next().unwrap_or("user");
    let cleaned: String = base
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(24)
        .collect();
    if cleaned.is_empty() {
        "user".into()
    } else {
        cleaned
    }
}

async fn send_code(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<SendCodeBody>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "email_code", 5, 300)?;

    if !state.config.mail_configured() {
        return Err(AppError::BadRequest(
            "email not configured (EW_RESEND_API_KEY or EW_MAIL_DEV=1)".into(),
        ));
    }

    let email = normalize_email(&body.email)?;
    let purpose = body.purpose.trim().to_lowercase();
    if purpose != "register" && purpose != "login" {
        return Err(AppError::BadRequest(
            "purpose must be register or login".into(),
        ));
    }

    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.pool)
        .await?;

    if purpose == "register" && exists.is_some() {
        return Err(AppError::Conflict("email already registered".into()));
    }
    if purpose == "login" && exists.is_none() {
        // 防枚举：仍返回 ok，但不发信
        return Ok(Json(json!({ "ok": true, "sent": false })));
    }

    // 同一邮箱冷却 60s
    state.rate.check(&email, "email_code_addr", 1, 60)?;

    let code = gen_code_6();
    let code_hash = hash_code(&email, &purpose, &code);
    let expires = Utc::now() + Duration::minutes(CODE_TTL_MINS);

    // 使旧码失效
    sqlx::query(
        "UPDATE email_codes SET consumed = TRUE WHERE email = $1 AND purpose = $2 AND consumed = FALSE",
    )
    .bind(&email)
    .bind(&purpose)
    .execute(&state.pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO email_codes (email, code_hash, purpose, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(&email)
    .bind(&code_hash)
    .bind(&purpose)
    .bind(expires)
    .execute(&state.pool)
    .await?;

    mail::send_verification_code(&state.http, &state.config, &email, &code, &purpose).await?;

    let mut out = json!({ "ok": true, "sent": true, "expires_in": CODE_TTL_MINS * 60 });
    if state.config.mail_dev {
        out["dev_code"] = json!(code);
    }
    Ok(Json(out))
}

async fn consume_code(
    pool: &sqlx::PgPool,
    email: &str,
    purpose: &str,
    code: &str,
) -> AppResult<()> {
    let code = code.trim();
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest("invalid code".into()));
    }

    let row = sqlx::query_as::<_, (i64, String, i32)>(
        r#"
        SELECT id, code_hash, attempts FROM email_codes
        WHERE email = $1 AND purpose = $2 AND consumed = FALSE AND expires_at > NOW()
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .bind(email)
    .bind(purpose)
    .fetch_optional(pool)
    .await?;

    let Some((id, code_hash, attempts)) = row else {
        return Err(AppError::Unauthorized("invalid or expired code".into()));
    };

    if attempts >= CODE_MAX_ATTEMPTS {
        let _ = sqlx::query("UPDATE email_codes SET consumed = TRUE WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await;
        return Err(AppError::Unauthorized("code attempts exceeded".into()));
    }

    let expect = hash_code(email, purpose, code);
    if expect != code_hash {
        sqlx::query("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        return Err(AppError::Unauthorized("invalid or expired code".into()));
    }

    sqlx::query("UPDATE email_codes SET consumed = TRUE WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn register_email(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<RegisterEmailBody>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "register", 5, 60)?;

    let email = normalize_email(&body.email)?;
    consume_code(&state.pool, &email, "register", &body.code).await?;

    let mut username = body
        .username
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| username_from_email(&email));
    if username.len() > 32 {
        username.truncate(32);
    }
    if username.is_empty() {
        username = format!("u{}", Utc::now().timestamp() % 1_000_000);
    }

    let password = body.password.unwrap_or_default();
    let (pw_hash, salt) = if password.is_empty() {
        // 无密码账号：随机不可用哈希，仅验证码登录
        let salt = gen_salt();
        let random_pw = gen_token();
        (hash_password(&random_pw, &salt), salt)
    } else {
        if password.len() < 8 {
            return Err(AppError::BadRequest(
                "password must be at least 8 characters".into(),
            ));
        }
        let salt = gen_salt();
        (hash_password(&password, &salt), salt)
    };

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

    // 用户名冲突时追加后缀
    let mut final_username = username.clone();
    for i in 0..20 {
        let candidate = if i == 0 {
            final_username.clone()
        } else {
            format!("{username}{i}")
        };
        let taken: Option<i64> = sqlx::query_scalar("SELECT id FROM users WHERE username = $1")
            .bind(&candidate)
            .fetch_optional(&mut *tx)
            .await?;
        if taken.is_none() {
            final_username = candidate;
            break;
        }
        if i == 19 {
            final_username = format!("u{}", gen_token().chars().take(10).collect::<String>());
        }
    }

    let user_id: i64 = match sqlx::query_scalar(
        r#"
        INSERT INTO users (username, pw_hash, salt, is_admin, email)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
    )
    .bind(&final_username)
    .bind(&pw_hash)
    .bind(&salt)
    .bind(is_admin)
    .bind(&email)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(sqlx::Error::Database(db)) if db.constraint().is_some() => {
            return Err(AppError::Conflict(
                "email or username already exists".into(),
            ));
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
        "user": UserOut {
            id: user_id,
            username: final_username,
            is_admin,
            email: Some(email),
        },
    })))
}

async fn login_email(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<LoginEmailBody>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "login", 10, 60)?;

    let email = normalize_email(&body.email)?;
    consume_code(&state.pool, &email, "login", &body.code).await?;

    let row = sqlx::query_as::<_, (i64, String, bool)>(
        "SELECT id, username, is_admin FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    let Some((id, username, is_admin)) = row else {
        return Err(AppError::Unauthorized("invalid credentials".into()));
    };

    let token = create_session(&state, id).await?;
    Ok(Json(json!({
        "token": token,
        "user": UserOut {
            id,
            username,
            is_admin,
            email: Some(email),
        },
    })))
}

async fn register(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<AuthBody>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "register", 5, 60)?;

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
        "user": UserOut { id: user_id, username, is_admin, email: None },
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
    // 支持用户名或邮箱 + 密码
    let row = sqlx::query_as::<_, (i64, String, String, String, bool, Option<String>)>(
        r#"
        SELECT id, username, pw_hash, salt, is_admin, email
        FROM users
        WHERE username = $1 OR email = $1
        "#,
    )
    .bind(&username)
    .fetch_optional(&state.pool)
    .await?;
    let lookup_ms = lookup_started.elapsed().as_millis() as u64;

    let Some((id, username, pw_hash, salt, is_admin, email)) = row else {
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
        "user": UserOut { id, username, is_admin, email },
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

async fn me(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<serde_json::Value>> {
    let email: Option<String> = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(user.id)
        .fetch_optional(&state.pool)
        .await?
        .flatten();
    Ok(Json(json!({
        "user": {
            "id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "email": email,
        }
    })))
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
