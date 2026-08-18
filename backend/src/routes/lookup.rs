//! 词库外点查：红宝书未收录词用 LLM 给简明英→中释义。
//! - 命中 word_lookups 缓存可匿名读（IP 限流）
//! - 未命中需登录再调 LLM
//! - 全局按 surface 共用词典缓存；context 只给首次写入时排序义项
//! - 解析失败 / 义项空不写 status=ok，避免脏数据锁死 ON CONFLICT

use axum::{extract::State, routing::post, Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

const MAX_WORD_CHARS: usize = 64;
const MAX_CONTEXT_CHARS: usize = 500;

const LOOKUP_SYS_PROMPT: &str = concat!(
    "你是面向考研英语学习者的简明英汉词典。",
    "用户给出一个英文词（可能是词形变化）和可选例句上下文。",
    "只输出一个 JSON 对象，不要 markdown 围栏、不要解释。",
    "字段：",
    "lemma（字符串，词典原形/基本式）、",
    "phonetic（字符串，可选音标，可空）、",
    "senses（数组，每项为 [词性, 中文释义]，词性用 n./v./vt./vi./adj./adv./prep./conj./pron. 等）。",
    "必须输出 2～4 个义项，覆盖该词的常见含义，释义简洁；",
    "context 只用于排序：把最贴合该句的义项放在最前，不要只输出一个语境义。",
    "若不是英文词，senses 给一条 [\"?\",\"无法识别\"]。"
);

#[derive(Deserialize)]
struct LookupBody {
    word: String,
    #[serde(default)]
    context: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/lookup", post(lookup_word))
}

fn normalize_word(raw: &str) -> String {
    raw.trim()
        .trim_matches(|c: char| !c.is_ascii_alphabetic() && c != '\'' && c != '-')
        .to_lowercase()
}

fn looks_like_word(w: &str) -> bool {
    let t = w.trim();
    if t.is_empty() || t.chars().count() > MAX_WORD_CHARS {
        return false;
    }
    // 至少一个字母；允许内部连字符/撇号
    let mut has_alpha = false;
    for (i, c) in t.chars().enumerate() {
        if c.is_ascii_alphabetic() {
            has_alpha = true;
            continue;
        }
        if (c == '\'' || c == '-') && i > 0 && i + 1 < t.len() {
            continue;
        }
        return false;
    }
    has_alpha
}

async fn lookup_word(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(body): Json<LookupBody>,
) -> AppResult<Json<Value>> {
    let ip = crate::db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "lookup", 60, 60)?;

    let word = normalize_word(&body.word);
    if !looks_like_word(&word) {
        return Err(AppError::BadRequest("invalid word".into()));
    }

    // 缓存可读
    if let Some(row) = fetch_cached(&state.pool, &word).await? {
        return Ok(Json(row));
    }

    // 未命中：登录 + 更严限流
    let user = auth::try_user(&state.pool, &headers).await.ok_or_else(|| {
        AppError::Unauthorized("login required to look up new words".into())
    })?;
    state.rate.check(&ip, "lookup_llm", 20, 60)?;
    state
        .rate
        .check(&format!("u{}", user.id), "lookup_llm_user", 30, 60)?;

    let context = body
        .context
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            if s.chars().count() > MAX_CONTEXT_CHARS {
                s.chars().take(MAX_CONTEXT_CHARS).collect::<String>()
            } else {
                s.to_string()
            }
        });

    do_lookup(&state, &word, context.as_deref()).await
}

async fn fetch_cached(pool: &sqlx::PgPool, word: &str) -> Result<Option<Value>, sqlx::Error> {
    let row = sqlx::query_as::<_, (Option<String>, Value, Option<String>, Option<String>)>(
        r#"
        SELECT lemma, senses, phonetic, status
        FROM word_lookups
        WHERE word = $1
        "#,
    )
    .bind(word)
    .fetch_optional(pool)
    .await?;

    let Some((lemma, senses, phonetic, status)) = row else {
        return Ok(None);
    };
    if status.as_deref() != Some("ok") {
        return Ok(None);
    }
    // senses 应是非空数组
    if senses.as_array().is_none_or(|a| a.is_empty()) {
        return Ok(None);
    }
    Ok(Some(json!({
        "word": word,
        "lemma": lemma.unwrap_or_else(|| word.to_string()),
        "senses": senses,
        "phonetic": phonetic.unwrap_or_default(),
        "status": "ok",
        "source": "llm",
        "cached": true,
    })))
}

async fn do_lookup(
    state: &AppState,
    word: &str,
    context: Option<&str>,
) -> AppResult<Json<Value>> {
    // 双检缓存（竞态）
    if let Some(row) = fetch_cached(&state.pool, word).await? {
        return Ok(Json(row));
    }

    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let llm_conf = state.llm_config().await;
    if !llm_conf.llm_configured() || model.is_empty() {
        return Ok(Json(json!({
            "word": word,
            "lemma": word,
            "senses": [],
            "status": "unconfigured",
            "source": "llm",
        })));
    }

    let user_msg = match context {
        Some(ctx) => format!("word: {word}\ncontext: {ctx}"),
        None => format!("word: {word}"),
    };

    match llm::chat_completion(&state.http, &llm_conf, &model, LOOKUP_SYS_PROMPT, &user_msg)
        .await
    {
        Ok(raw) => {
            // 解析失败或义项空：返回 error，不写 word_lookups（勿把 raw 当正式义项）
            let Some((lemma, phonetic, senses)) = parsed_lookup(&raw, word) else {
                tracing::warn!(word, "lookup LLM parse failed or empty senses");
                return Ok(Json(json!({
                    "word": word,
                    "lemma": word,
                    "senses": [],
                    "status": "error",
                    "source": "llm",
                    "detail": "parse failed",
                })));
            };

            let now = Utc::now();
            sqlx::query(
                r#"
                INSERT INTO word_lookups (word, lemma, senses, phonetic, status, model, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'ok', $5, $6, $6)
                ON CONFLICT (word) DO UPDATE SET
                    lemma = EXCLUDED.lemma,
                    senses = EXCLUDED.senses,
                    phonetic = EXCLUDED.phonetic,
                    status = 'ok',
                    model = EXCLUDED.model,
                    updated_at = EXCLUDED.updated_at
                WHERE word_lookups.status IS DISTINCT FROM 'ok'
                   OR word_lookups.senses = '[]'::jsonb
                "#,
            )
            .bind(word)
            .bind(&lemma)
            .bind(&senses)
            .bind(&phonetic)
            .bind(&model)
            .bind(now)
            .execute(&state.pool)
            .await?;

            // 返回最终库内值
            if let Some(row) = fetch_cached(&state.pool, word).await? {
                return Ok(Json(row));
            }
            Ok(Json(json!({
                "word": word,
                "lemma": lemma,
                "senses": senses,
                "phonetic": phonetic,
                "status": "ok",
                "source": "llm",
                "cached": false,
            })))
        }
        Err(e) => {
            tracing::warn!(error = %e, word, "lookup LLM failed");
            Ok(Json(json!({
                "word": word,
                "lemma": word,
                "senses": [],
                "status": "error",
                "source": "llm",
                "detail": e.to_string(),
            })))
        }
    }
}

/// 从 LLM 原文抽出可缓存结果。解析失败或义项空则 None，绝不把 raw 当正式义项。
fn parsed_lookup(raw: &str, fallback_lemma: &str) -> Option<(String, String, Value)> {
    let parsed = parse_lookup_json(raw)?;
    let lemma = parsed
        .get("lemma")
        .and_then(|v| v.as_str())
        .unwrap_or(fallback_lemma)
        .trim()
        .to_string();
    let lemma = if lemma.is_empty() {
        fallback_lemma.to_string()
    } else {
        lemma
    };
    let phonetic = parsed
        .get("phonetic")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let senses = normalize_senses(parsed.get("senses").cloned().unwrap_or(Value::Null));
    if senses.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        return None;
    }
    Some((lemma, phonetic, senses))
}

fn parse_lookup_json(raw: &str) -> Option<Value> {
    let s = raw.trim();
    // 直接 JSON
    if let Ok(v) = serde_json::from_str::<Value>(s) {
        return Some(v);
    }
    // ```json ... ```
    if let Some(start) = s.find('{') {
        if let Some(end) = s.rfind('}') {
            if end > start {
                if let Ok(v) = serde_json::from_str::<Value>(&s[start..=end]) {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn normalize_senses(v: Value) -> Value {
    let mut out = Vec::new();
    match v {
        Value::Array(arr) => {
            for item in arr {
                match item {
                    Value::Array(pair) if pair.len() >= 2 => {
                        let pos = pair[0].as_str().unwrap_or("").trim();
                        let cn = pair[1].as_str().unwrap_or("").trim();
                        if !cn.is_empty() {
                            out.push(json!([
                                if pos.is_empty() { "?" } else { pos },
                                cn
                            ]));
                        }
                    }
                    Value::Object(map) => {
                        let pos = map
                            .get("pos")
                            .or_else(|| map.get("p"))
                            .and_then(|x| x.as_str())
                            .unwrap_or("?")
                            .trim();
                        let cn = map
                            .get("cn")
                            .or_else(|| map.get("zh"))
                            .or_else(|| map.get("meaning"))
                            .or_else(|| map.get("def"))
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .trim();
                        if !cn.is_empty() {
                            out.push(json!([pos, cn]));
                        }
                    }
                    Value::String(s) if !s.trim().is_empty() => {
                        out.push(json!(["?", s.trim()]));
                    }
                    _ => {}
                }
            }
        }
        Value::String(s) if !s.trim().is_empty() => {
            out.push(json!(["?", s.trim()]));
        }
        _ => {}
    }
    // 最多 6 义项
    if out.len() > 6 {
        out.truncate(6);
    }
    Value::Array(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_failure_is_not_ok_sense() {
        assert!(parsed_lookup("sorry I cannot look that up", "bank").is_none());
        assert!(parsed_lookup("not json at all", "foo").is_none());
        assert!(parsed_lookup("", "bank").is_none());
        assert!(parsed_lookup("{}", "bank").is_none());
        assert!(parsed_lookup(r#"{"lemma":"bank","senses":[]}"#, "bank").is_none());
        // 以前会把 raw 截断塞进一条 n./v. 义项再写 ok；现在必须拒绝
        assert!(parse_lookup_json("the river bank is steep").is_none());
    }

    #[test]
    fn parse_ok_json_yields_senses() {
        let (lemma, phonetic, senses) = parsed_lookup(
            r#"{"lemma":"bank","phonetic":"/bæŋk/","senses":[["n.","银行"],["n.","河岸"]]}"#,
            "banked",
        )
        .expect("valid json");
        assert_eq!(lemma, "bank");
        assert_eq!(phonetic, "/bæŋk/");
        assert_eq!(senses.as_array().unwrap().len(), 2);
    }

    #[test]
    fn parse_json_embedded_in_prose() {
        let raw = "here:\n{\"lemma\":\"run\",\"senses\":[[\"v.\",\"跑\"],[\"n.\",\"奔跑\"]]}\n";
        assert!(parsed_lookup(raw, "run").is_some());
    }
}
