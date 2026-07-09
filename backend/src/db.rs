use sqlx::PgPool;

/// Run schema from migrations/001_init.sql (idempotent CREATE IF NOT EXISTS).
pub async fn init_schema(pool: &PgPool) -> anyhow::Result<()> {
    let sql = include_str!("../migrations/001_init.sql");
    sqlx::raw_sql(sql).execute(pool).await?;
    Ok(())
}

pub async fn get_config_value(pool: &PgPool, key: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>("SELECT value FROM config WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
}

pub async fn set_config_value(pool: &PgPool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO config (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

/// Ensure sentence exists; return id. year/label only set on insert.
pub async fn ensure_sentence(
    pool: &PgPool,
    text: &str,
    year: Option<i32>,
    label: Option<&str>,
) -> Result<i64, sqlx::Error> {
    if let Some(id) = sqlx::query_scalar::<_, i64>("SELECT id FROM sentences WHERE text = $1")
        .bind(text)
        .fetch_optional(pool)
        .await?
    {
        return Ok(id);
    }
    let id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO sentences (text, year, label)
        VALUES ($1, $2, $3)
        ON CONFLICT (text) DO UPDATE SET text = EXCLUDED.text
        RETURNING id
        "#,
    )
    .bind(text)
    .bind(year)
    .bind(label)
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub fn client_ip(headers: &axum::http::HeaderMap, fallback: Option<std::net::SocketAddr>) -> String {
    if let Some(xff) = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(first) = xff.split(',').next() {
            let t = first.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    fallback
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "unknown".into())
}
