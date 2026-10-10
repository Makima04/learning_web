// 考研政治主观题练习进度：JSON 整包（与 kg / journal 同模式），需登录。
// POST /api/politics/xiao-brief：选择题二次解析。缓存可匿名读；未命中需登录。
use axum::{
    extract::ConnectInfo,
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;

use crate::auth::{self, AuthUser};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

const MAX_PAYLOAD_BYTES: usize = 2 * 1024 * 1024;

#[derive(Deserialize)]
struct PoliticsPut {
    politics: Value,
    #[serde(default)]
    updated_at: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/politics", get(get_politics).put(put_politics))
        .route("/api/politics/xiao-brief", post(xiao_brief))
}

async fn get_politics(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let row: Option<(Value, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT payload, updated_at
        FROM user_politics
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((payload, updated_at)) => {
            let ms = updated_at.map(|t| t.timestamp_millis()).unwrap_or(0);
            Ok(Json(json!({ "politics": payload, "updated_at": ms })))
        }
        None => Ok(Json(json!({ "politics": null, "updated_at": 0 }))),
    }
}

async fn put_politics(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PoliticsPut>,
) -> AppResult<Json<Value>> {
    let payload = body.politics;
    if !payload.is_object() {
        return Err(AppError::BadRequest("politics must be an object".into()));
    }
    let serialized = serde_json::to_vec(&payload)
        .map_err(|e| AppError::BadRequest(format!("invalid politics json: {e}")))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::BadRequest("politics payload too large".into()));
    }

    let client_ms = body
        .updated_at
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    if client_ms < 0 {
        return Err(AppError::BadRequest("updated_at invalid".into()));
    }

    let existing: Option<Option<chrono::DateTime<Utc>>> =
        sqlx::query_scalar("SELECT updated_at FROM user_politics WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&state.pool)
            .await?;

    if let Some(Some(server_ts)) = existing {
        if server_ts.timestamp_millis() > client_ms {
            let row: (Value, Option<chrono::DateTime<Utc>>) =
                sqlx::query_as("SELECT payload, updated_at FROM user_politics WHERE user_id = $1")
                    .bind(user.id)
                    .fetch_one(&state.pool)
                    .await?;
            return Ok(Json(json!({
                "ok": true,
                "skipped": true,
                "reason": "server_newer",
                "politics": row.0,
                "updated_at": row.1.map(|t| t.timestamp_millis()).unwrap_or(0),
            })));
        }
    }

    let ts = Utc
        .timestamp_millis_opt(client_ms)
        .single()
        .unwrap_or_else(Utc::now);

    sqlx::query(
        r#"
        INSERT INTO user_politics (user_id, payload, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(user.id)
    .bind(&payload)
    .bind(ts)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "ok": true,
        "updated_at": client_ms,
    })))
}

const XIAO_BRIEF_PROMPT: &str = r#"你是考研政治选择题辅导。把原解析收成三格，让人一眼看到判题标准。
只输出 JSON 对象，不要 markdown 围栏。

字段：
- key：一句判断句，说出这题用哪一条来判。自己收成一句，大约 24 个字；写长了就整句重写，不要写一半。
- trap：只有两个选项容易混时才写，点出差在哪一个字；没有就空字符串。自己收成一句，大约 20 个字。
- options：数组。每项是 {"k","ok","why"}。k 只能是 A、B、C、D，且必须覆盖题面给出的每一个选项。ok 必须与标准答案一致。why 只写和题眼差在哪，不要复述选项原文，自己收成大约 16 个字的半句。

禁止：
- key 里出现「本题考查」「综上所述」「本质上」「深刻揭示」
- 复述教材段落，或补充这题没考的背景
- 原解析和标准答案冲突时，以标准答案为准，不要替原解析圆场

自检：盖住 key，只看每一行 why 也能判断对错；why 如果整句抄了选项，改短。
形状示例（内容不要照抄）：{"key":"给的是方法，不是现成方案。","trap":"题眼是「现成」。","options":[{"k":"A","ok":true,"why":"用来看世界"},{"k":"D","ok":false,"why":"不提供现成方案"}]}"#;

const MAX_BRIEF_STEM: usize = 2500;
const MAX_BRIEF_OPTION: usize = 800;
const MAX_BRIEF_EXPLAIN: usize = 6000;

#[derive(Deserialize)]
struct XiaoBriefIn {
    item_id: String,
    #[serde(default)]
    kind: String,
    stem: String,
    options: Vec<XiaoOptIn>,
    answer: String,
    #[serde(default)]
    explain: String,
}

#[derive(Deserialize)]
struct XiaoOptIn {
    k: String,
    text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct XiaoBriefOpt {
    k: String,
    ok: bool,
    why: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct XiaoBrief {
    key: String,
    trap: String,
    options: Vec<XiaoBriefOpt>,
}

async fn xiao_brief(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<XiaoBriefIn>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "xiao_brief", 40, 60)?;

    let item_id = body.item_id.trim();
    if !valid_xiao_id(item_id) {
        return Err(AppError::BadRequest("item_id invalid".into()));
    }
    let stem = body.stem.trim();
    if stem.is_empty() || stem.chars().count() > MAX_BRIEF_STEM {
        return Err(AppError::BadRequest("stem invalid".into()));
    }
    let kind = body.kind.trim();
    if kind != "single" && kind != "multi" {
        return Err(AppError::BadRequest("kind invalid".into()));
    }
    if body.options.len() < 2 || body.options.len() > 4 {
        return Err(AppError::BadRequest("options invalid".into()));
    }
    let mut letters: Vec<String> = Vec::new();
    let mut option_lines: Vec<String> = Vec::new();
    for opt in &body.options {
        let k = opt.k.trim().to_uppercase();
        if k.len() != 1 || !"ABCD".contains(&k) || letters.iter().any(|x| x == &k) {
            return Err(AppError::BadRequest("options invalid".into()));
        }
        let text = opt.text.trim();
        if text.is_empty() || text.chars().count() > MAX_BRIEF_OPTION {
            return Err(AppError::BadRequest("options invalid".into()));
        }
        letters.push(k.clone());
        option_lines.push(format!("{k}. {text}"));
    }
    let answer = normalize_answer(&body.answer);
    if answer.is_empty() || answer.chars().any(|ch| !letters.iter().any(|k| k == &ch.to_string())) {
        return Err(AppError::BadRequest("answer invalid".into()));
    }
    if kind == "single" && answer.chars().count() != 1 {
        return Err(AppError::BadRequest("answer invalid".into()));
    }
    let explain = body.explain.trim();
    if explain.chars().count() > MAX_BRIEF_EXPLAIN {
        return Err(AppError::BadRequest("explain too long".into()));
    }

    let fingerprint = format!(
        "{stem}\n{}\nANS {answer}\n{explain}",
        option_lines.join("\n")
    );
    if let Some(hit) = fetch_xiao_brief(&state.pool, item_id, &fingerprint).await? {
        return Ok(Json(hit));
    }

    let user = auth::try_user(&state.pool, &headers).await.ok_or_else(|| {
        AppError::Unauthorized("login required to generate a new brief".into())
    })?;
    state.rate.check(&ip, "xiao_brief_llm", 8, 60)?;
    state
        .rate
        .check(&format!("u{}", user.id), "xiao_brief_llm_user", 12, 60)?;

    let llm_conf = state.llm_config().await;
    let model = llm::active_model(&state.pool, &llm_conf.llm_model).await;
    if !llm_conf.llm_configured() || model.is_empty() {
        return Ok(Json(json!({
            "item_id": item_id,
            "status": "unconfigured",
            "cached": false,
        })));
    }

    let kind_label = if kind == "multi" { "多选" } else { "单选" };
    let user_msg = format!(
        "题型：{kind_label}\n题干：{stem}\n{}\n标准答案：{answer}\n原解析：{explain}",
        option_lines.join("\n"),
    );

    let raw = match llm::chat_completion(
        &state.http,
        &llm_conf,
        &model,
        XIAO_BRIEF_PROMPT,
        &user_msg,
    )
    .await
    {
        Ok(raw) => raw,
        Err(e) => {
            tracing::warn!(item_id, error = %e, "xiao brief LLM failed");
            return Ok(Json(json!({
                "item_id": item_id,
                "status": "error",
                "cached": false,
                "detail": "llm failed",
            })));
        }
    };

    let Some(brief) = parse_xiao_brief(&raw, &letters, &answer) else {
        tracing::warn!(item_id, "xiao brief parse failed");
        return Ok(Json(json!({
            "item_id": item_id,
            "status": "error",
            "cached": false,
            "detail": "parse failed",
        })));
    };

    let stored = brief_json(&brief);
    let now = Utc::now();
    sqlx::query(
        r#"
        INSERT INTO question_explanations
            (item_id, stem, answer, solution, status, model, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'ok', $5, $6, $6)
        ON CONFLICT (item_id) DO UPDATE SET
            stem = EXCLUDED.stem,
            answer = EXCLUDED.answer,
            solution = EXCLUDED.solution,
            status = 'ok',
            model = EXCLUDED.model,
            updated_at = EXCLUDED.updated_at
        WHERE question_explanations.stem IS DISTINCT FROM EXCLUDED.stem
           OR question_explanations.status IS DISTINCT FROM 'ok'
        "#,
    )
    .bind(item_id)
    .bind(&fingerprint)
    .bind(&brief.key)
    .bind(stored.to_string())
    .bind(&model)
    .bind(now)
    .execute(&state.pool)
    .await?;

    Ok(Json(brief_response(item_id, &brief, false)))
}

fn valid_xiao_id(id: &str) -> bool {
    let n = id.chars().count();
    (1..=64).contains(&n)
        && id.starts_with("xiao-")
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn normalize_answer(raw: &str) -> String {
    let mut chars: Vec<char> = raw
        .chars()
        .filter_map(|ch| {
            let up = ch.to_ascii_uppercase();
            if "ABCD".contains(up) {
                Some(up)
            } else {
                None
            }
        })
        .collect();
    chars.sort_unstable();
    chars.dedup();
    chars.into_iter().collect()
}

fn strip_filler(raw: &str) -> String {
    const FILL: &[&str] = &["本题考查", "综上所述", "本质上", "深刻揭示"];
    let mut out = raw.to_string();
    for phrase in FILL {
        out = out.replace(phrase, "");
    }
    out.trim().to_string()
}

fn parse_xiao_brief(raw: &str, letters: &[String], answer: &str) -> Option<XiaoBrief> {
    let trimmed = raw.trim();
    let json_str = if let Some(start) = trimmed.find('{') {
        let end = trimmed.rfind('}')?;
        if end < start {
            return None;
        }
        &trimmed[start..=end]
    } else {
        trimmed
    };
    let value: Value = serde_json::from_str(json_str).ok()?;
    let key = strip_filler(value.get("key")?.as_str().unwrap_or(""));
    if key.is_empty() {
        return None;
    }
    let trap = strip_filler(value.get("trap").and_then(|v| v.as_str()).unwrap_or(""));
    let model_opts = value.get("options").and_then(|v| v.as_array());
    let mut options = Vec::with_capacity(letters.len());
    for letter in letters {
        let why = model_opts
            .and_then(|rows| {
                rows.iter().find(|row| {
                    row.get("k")
                        .and_then(|k| k.as_str())
                        .map(|k| k.trim().eq_ignore_ascii_case(letter))
                        .unwrap_or(false)
                })
            })
            .and_then(|row| row.get("why").and_then(|w| w.as_str()))
            .map(strip_filler)
            .unwrap_or_default();
        options.push(XiaoBriefOpt {
            k: letter.clone(),
            ok: answer.contains(letter),
            why,
        });
    }
    Some(XiaoBrief { key, trap, options })
}

fn brief_json(brief: &XiaoBrief) -> Value {
    json!({
        "key": brief.key,
        "trap": brief.trap,
        "options": brief.options.iter().map(|opt| json!({
            "k": opt.k,
            "ok": opt.ok,
            "why": opt.why,
        })).collect::<Vec<_>>(),
    })
}

fn brief_response(item_id: &str, brief: &XiaoBrief, cached: bool) -> Value {
    let mut body = brief_json(brief);
    body["item_id"] = json!(item_id);
    body["status"] = json!("ok");
    body["cached"] = json!(cached);
    body
}

async fn fetch_xiao_brief(
    pool: &sqlx::PgPool,
    item_id: &str,
    fingerprint: &str,
) -> Result<Option<Value>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
        r#"
        SELECT stem, solution, status
        FROM question_explanations
        WHERE item_id = $1
        "#,
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await?;
    let Some((stem, solution, status)) = row else {
        return Ok(None);
    };
    if status.as_deref() != Some("ok") || stem != fingerprint {
        return Ok(None);
    }
    let Some(solution) = solution else {
        return Ok(None);
    };
    let Ok(value) = serde_json::from_str::<Value>(&solution) else {
        return Ok(None);
    };
    let letters: Vec<String> = value
        .get("options")
        .and_then(|v| v.as_array())
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get("k").and_then(|k| k.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let answer: String = letters
        .iter()
        .filter(|k| {
            value
                .get("options")
                .and_then(|v| v.as_array())
                .and_then(|rows| {
                    rows.iter().find(|row| {
                        row.get("k").and_then(|x| x.as_str()) == Some(k.as_str())
                    })
                })
                .and_then(|row| row.get("ok").and_then(|ok| ok.as_bool()))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    let Some(brief) = parse_xiao_brief(&solution, &letters, &answer) else {
        return Ok(None);
    };
    Ok(Some(brief_response(item_id, &brief, true)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn letters() -> Vec<String> {
        ["A", "B", "C", "D"].into_iter().map(str::to_string).collect()
    }

    #[test]
    fn forces_official_answer_and_keeps_wording() {
        let raw = r#"```json
        {"key":"本题考查马克思主义给的是方法不是现成方案这句太长了要被截掉后面这些字","trap":"看到指导就选D，题眼是现成这两个字再多也不要","options":[
          {"k":"A","ok":true,"why":"认识工具"},
          {"k":"B","ok":false,"why":"行动指南"},
          {"k":"C","ok":true,"why":"科学真理"},
          {"k":"D","ok":true,"why":"现成方案是错的"}
        ]}
        ```"#;
        let brief = parse_xiao_brief(raw, &letters(), "ABC").unwrap();
        assert_eq!(
            brief.key,
            "马克思主义给的是方法不是现成方案这句太长了要被截掉后面这些字"
        );
        assert!(!brief.key.contains("本题考查"));
        assert_eq!(brief.trap, "看到指导就选D，题眼是现成这两个字再多也不要");
        assert_eq!(
            brief
                .options
                .iter()
                .map(|opt| (opt.k.as_str(), opt.ok))
                .collect::<Vec<_>>(),
            vec![("A", true), ("B", true), ("C", true), ("D", false)]
        );
        assert_eq!(brief.options[3].why, "现成方案是错的");
    }

    #[test]
    fn rejects_missing_key() {
        let raw = r#"{"key":"本质上","trap":"","options":[]}"#;
        assert!(parse_xiao_brief(raw, &letters(), "A").is_none());
    }
}
