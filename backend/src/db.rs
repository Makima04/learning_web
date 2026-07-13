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

pub fn client_ip(
    headers: &axum::http::HeaderMap,
    fallback: Option<std::net::SocketAddr>,
    trusted_proxy_hops: usize,
) -> String {
    let fallback_ip = fallback
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".into());
    if trusted_proxy_hops == 0 || fallback.is_none() {
        return fallback_ip;
    }

    let Some(forwarded) = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
    else {
        return fallback_ip;
    };
    let Ok(addresses) = forwarded
        .split(',')
        .map(str::trim)
        .map(str::parse::<std::net::IpAddr>)
        .collect::<Result<Vec<_>, _>>()
    else {
        return fallback_ip;
    };
    addresses
        .get(addresses.len().saturating_sub(trusted_proxy_hops))
        .filter(|_| addresses.len() >= trusted_proxy_hops)
        .map(ToString::to_string)
        .unwrap_or(fallback_ip)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue};

    fn peer() -> std::net::SocketAddr {
        "127.0.0.1:8000".parse().unwrap()
    }

    #[test]
    fn ignores_forwarded_header_without_trusted_proxy() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.7"));
        assert_eq!(client_ip(&headers, Some(peer()), 0), "127.0.0.1");
    }

    #[test]
    fn selects_address_before_configured_proxy_hops() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("198.51.100.9, 203.0.113.7"),
        );
        assert_eq!(client_ip(&headers, Some(peer()), 1), "203.0.113.7");
        assert_eq!(client_ip(&headers, Some(peer()), 2), "198.51.100.9");
    }

    #[test]
    fn rejects_malformed_forwarded_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("not-an-ip, 203.0.113.7"),
        );
        assert_eq!(client_ip(&headers, Some(peer()), 1), "127.0.0.1");
    }
}
