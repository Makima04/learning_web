use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    routing::post,
    Json, Router,
};
use chrono::Utc;
use futures::stream::{self, Stream, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use std::pin::Pin;

use crate::auth::AdminUser;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

type SseStream = Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>;

#[derive(Deserialize)]
struct TextBody {
    text: String,
}

#[derive(Deserialize)]
struct ParaBody {
    year: Option<i32>,
    label: Option<String>,
    para_idx: Option<i32>,
    text: String,
    #[serde(default)]
    full_body: Option<String>,
    #[serde(default)]
    items: Option<Value>,
}

#[derive(Deserialize)]
struct BatchBody {
    ids: Vec<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/parse-sentence", post(parse_sentence))
        .route("/api/analyze-paragraph", post(analyze_paragraph))
        .route("/api/parse/batch", post(parse_batch))
}

async fn parse_sentence(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<TextBody>,
) -> Result<Sse<SseStream>, AppError> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "parse", 60, 60)?;

    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }
    if text.len() > 8000 {
        return Err(AppError::BadRequest("text too long".into()));
    }

    let sid = db::ensure_sentence(&state.pool, &text, None, None).await?;
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;

    if let Some((content, status)) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT content, status FROM parses WHERE sentence_id = $1",
    )
    .bind(sid)
    .fetch_optional(&state.pool)
    .await?
    {
        if status.as_deref() == Some("ok") {
            if let Some(c) = content {
                if !c.is_empty() {
                    return Ok(sse_from_cached(c));
                }
            }
        }
    }

    if !state.config.llm_configured() || model.is_empty() {
        return Ok(sse_unconfigured());
    }

    let stream = match llm::stream_chat(
        &state.http,
        &state.config,
        &model,
        llm::PARSE_SYS_PROMPT,
        &text,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => {
            if e.downcast_ref::<llm::LlmNotConfigured>().is_some() {
                return Ok(sse_unconfigured());
            }
            return Ok(sse_error(e.to_string()));
        }
    };

    let pool = state.pool.clone();
    let model_c = model.clone();
    Ok(sse_from_llm_stream(stream, move |full| {
        let pool = pool.clone();
        let model_c = model_c.clone();
        async move {
            let now = Utc::now();
            let _ = sqlx::query(
                r#"
                INSERT INTO parses (sentence_id, content, status, model, parsed_at, updated_at)
                VALUES ($1, $2, 'ok', $3, $4, $4)
                ON CONFLICT (sentence_id) DO UPDATE SET
                    content = EXCLUDED.content,
                    status = 'ok',
                    model = EXCLUDED.model,
                    parsed_at = EXCLUDED.parsed_at,
                    updated_at = EXCLUDED.updated_at
                "#,
            )
            .bind(sid)
            .bind(&full)
            .bind(&model_c)
            .bind(now)
            .execute(&pool)
            .await;
        }
    }))
}

async fn analyze_paragraph(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<ParaBody>,
) -> Result<Sse<SseStream>, AppError> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "analyze", 60, 60)?;

    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }

    let year_s = body
        .year
        .map(|y| y.to_string())
        .unwrap_or_else(|| "?".into());
    let label = body.label.clone().unwrap_or_default();
    let para_idx = body.para_idx.unwrap_or(0);
    let cache_key = format!("{year_s}|{label}|{para_idx}");

    if let Some((content, status)) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT content, status FROM paragraph_analyses WHERE cache_key = $1",
    )
    .bind(&cache_key)
    .fetch_optional(&state.pool)
    .await?
    {
        if status.as_deref() == Some("ok") {
            if let Some(c) = content {
                if !c.is_empty() {
                    return Ok(sse_from_cached(c));
                }
            }
        }
    }

    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    if !state.config.llm_configured() || model.is_empty() {
        return Ok(sse_unconfigured());
    }

    let mut user = text.clone();
    if let Some(fb) = &body.full_body {
        if !fb.is_empty() {
            user = format!("Passage context:\n{fb}\n\nParagraph to analyze:\n{text}");
        }
    }
    if let Some(items) = &body.items {
        user.push_str(&format!("\n\nQuestions: {items}"));
    }

    let stream = match llm::stream_chat(
        &state.http,
        &state.config,
        &model,
        llm::PARSE_PARA_SYS_PROMPT,
        &user,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => {
            if e.downcast_ref::<llm::LlmNotConfigured>().is_some() {
                return Ok(sse_unconfigured());
            }
            return Ok(sse_error(e.to_string()));
        }
    };

    let pool = state.pool.clone();
    let model_c = model.clone();
    let key = cache_key.clone();
    Ok(sse_from_llm_stream(stream, move |full| {
        let pool = pool.clone();
        let model_c = model_c.clone();
        let key = key.clone();
        async move {
            let now = Utc::now();
            let _ = sqlx::query(
                r#"
                INSERT INTO paragraph_analyses (cache_key, content, status, model, analyzed_at, updated_at)
                VALUES ($1, $2, 'ok', $3, $4, $4)
                ON CONFLICT (cache_key) DO UPDATE SET
                    content = EXCLUDED.content,
                    status = 'ok',
                    model = EXCLUDED.model,
                    analyzed_at = EXCLUDED.analyzed_at,
                    updated_at = EXCLUDED.updated_at
                "#,
            )
            .bind(&key)
            .bind(&full)
            .bind(&model_c)
            .bind(now)
            .execute(&pool)
            .await;
        }
    }))
}

async fn parse_batch(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<BatchBody>,
) -> AppResult<Json<Value>> {
    if body.ids.len() > 10000 {
        return Err(AppError::BadRequest("max 10000 ids".into()));
    }
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let mut parsed = 0i64;
    let mut failed = 0i64;
    let mut results = Vec::new();

    for id in body.ids {
        let text: Option<String> =
            sqlx::query_scalar("SELECT text FROM sentences WHERE id = $1")
                .bind(id)
                .fetch_optional(&state.pool)
                .await?;
        let Some(text) = text else {
            failed += 1;
            results.push(json!({"id": id, "status": "error", "error": "not found"}));
            continue;
        };

        if let Some(status) = sqlx::query_scalar::<_, Option<String>>(
            "SELECT status FROM parses WHERE sentence_id = $1",
        )
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .flatten()
        {
            if status == "ok" {
                parsed += 1;
                results.push(json!({"id": id, "status": "ok"}));
                continue;
            }
        }

        if !state.config.llm_configured() || model.is_empty() {
            failed += 1;
            results.push(json!({"id": id, "status": "unconfigured"}));
            continue;
        }

        match llm::chat_completion(
            &state.http,
            &state.config,
            &model,
            llm::PARSE_SYS_PROMPT,
            &text,
        )
        .await
        {
            Ok(content) => {
                let now = Utc::now();
                let _ = sqlx::query(
                    r#"
                    INSERT INTO parses (sentence_id, content, status, model, parsed_at, updated_at)
                    VALUES ($1, $2, 'ok', $3, $4, $4)
                    ON CONFLICT (sentence_id) DO UPDATE SET
                        content = EXCLUDED.content,
                        status = 'ok',
                        model = EXCLUDED.model,
                        parsed_at = EXCLUDED.parsed_at,
                        updated_at = EXCLUDED.updated_at
                    "#,
                )
                .bind(id)
                .bind(&content)
                .bind(&model)
                .bind(now)
                .execute(&state.pool)
                .await;
                parsed += 1;
                results.push(json!({"id": id, "status": "ok"}));
            }
            Err(e) => {
                failed += 1;
                results.push(json!({"id": id, "status": "error", "error": e.to_string()}));
            }
        }
    }

    Ok(Json(json!({
        "parsed": parsed,
        "failed": failed,
        "results": results,
    })))
}

fn box_sse(
    s: impl Stream<Item = Result<Event, Infallible>> + Send + 'static,
) -> Sse<SseStream> {
    let _ = KeepAlive::default();
    Sse::new(Box::pin(s) as SseStream)
}

fn sse_from_cached(content: String) -> Sse<SseStream> {
    let events = vec![
        Ok(Event::default().data(json!({"delta": content.clone()}).to_string())),
        Ok(Event::default().data(json!({"event":"done","content": content}).to_string())),
    ];
    box_sse(stream::iter(events))
}

fn sse_unconfigured() -> Sse<SseStream> {
    box_sse(stream::iter(vec![Ok(
        Event::default().data(json!({"event":"unconfigured"}).to_string()),
    )]))
}

fn sse_error(message: String) -> Sse<SseStream> {
    box_sse(stream::iter(vec![Ok(
        Event::default().data(json!({"event":"error","message": message}).to_string()),
    )]))
}

fn sse_from_llm_stream<F, Fut>(
    llm_stream: impl Stream<Item = Result<String, anyhow::Error>> + Send + 'static,
    on_done: F,
) -> Sse<SseStream>
where
    F: FnOnce(String) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let s = stream::unfold(
        (Box::pin(llm_stream), String::new(), Some(on_done), false),
        |(mut stream, mut full, mut on_done, done)| async move {
            if done {
                return None;
            }
            match stream.next().await {
                Some(Ok(delta)) => {
                    full.push_str(&delta);
                    let ev = Event::default().data(json!({"delta": delta}).to_string());
                    Some((Ok(ev), (stream, full, on_done, false)))
                }
                Some(Err(e)) => {
                    let ev = Event::default()
                        .data(json!({"event":"error","message": e.to_string()}).to_string());
                    Some((Ok(ev), (stream, full, None, true)))
                }
                None => {
                    if let Some(cb) = on_done.take() {
                        cb(full.clone()).await;
                    }
                    let ev = Event::default()
                        .data(json!({"event":"done","content": full}).to_string());
                    Some((Ok(ev), (stream, full, None, true)))
                }
            }
        },
    );
    box_sse(s)
}
