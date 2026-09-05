// 知识图谱用户进度：JSON 整包（与 journal 同模式），需登录。
// POST /api/kg/predict-fill：按蓝图槽位用 LLM 填大题题干（可选，失败由前端模板兜底）。
// POST /api/kg/explain：王道大题。answer=考场书面作答，solution=解析。缓存可匿名读；未命中需登录。
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

const MAX_PAYLOAD_BYTES: usize = 4 * 1024 * 1024; // 4 MiB
const MAX_EXPLAIN_STEM_CHARS: usize = 8000;
const MAX_ITEM_ID_CHARS: usize = 64;

const EXPLAIN_SYS_PROMPT: &str = concat!(
    "你是考研 408 综合应用题辅导老师。根据题干同时给出两种文本，用途完全不同。",
    "只输出 JSON 对象，不要 markdown 围栏。字段：",
    "answer（字符串，考场书面作答全文）、",
    "solution（字符串，给复习用的解析，不是卷面）。",
    "answer 的写法：像抄到答题纸上。按（1）（2）分问；每问写公式或定义、代入、得数；",
    "语气是作答不是讲解；不要写「易错点」「注意」「由此可见」等旁白；不要写阅卷说明。",
    "solution 的写法：讲为什么用这个公式、取整规则、为何多访一次、常见错法；",
    "不要把 answer 再抄一遍，可以引用结论。",
    "要求：贴合 408 / 王道教材的标准结论与记法，不超纲；",
    "不编造题干未给的数据；数字算不清就写「无法由题面确定」；",
    "涉及磁盘块/页/帧等容量时，每块能装几个向下取整，需要几块向上取整；",
    "顺序查找且等概率时，平均访问次数用 (1+N)/2；",
    "FCB/目录项分解后，先顺序查文件名部分，命中后再访一次其余描述信息；",
    "中文作答。"
);

#[derive(Deserialize)]
struct KgPut {
    kg: Value,
    #[serde(default)]
    updated_at: Option<i64>,
}

#[derive(Deserialize)]
struct PredictSlotIn {
    slot_id: String,
    book_id: String,
    primary_kp_id: String,
    primary_kp_name: String,
    secondary_kp_names: Vec<String>,
    suggest_points: i32,
    difficulty: i32,
}

#[derive(Deserialize)]
struct PredictFillBody {
    slots: Vec<PredictSlotIn>,
}

#[derive(Deserialize)]
struct ExplainBody {
    item_id: String,
    stem: String,
    #[serde(default)]
    book: Option<String>,
    #[serde(default)]
    section: Option<String>,
    #[serde(default)]
    qno: Option<i32>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    kp_name: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/kg", get(get_kg).put(put_kg))
        .route("/api/kg/predict-fill", post(predict_fill))
        .route("/api/kg/explain", post(explain_question))
}

async fn get_kg(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let row: Option<(Value, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT payload, updated_at
        FROM user_kg
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((payload, updated_at)) => {
            let ms = updated_at.map(|t| t.timestamp_millis()).unwrap_or(0);
            Ok(Json(json!({ "kg": payload, "updated_at": ms })))
        }
        None => Ok(Json(json!({ "kg": null, "updated_at": 0 }))),
    }
}

async fn put_kg(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<KgPut>,
) -> AppResult<Json<Value>> {
    let payload = body.kg;
    if !payload.is_object() {
        return Err(AppError::BadRequest("kg must be an object".into()));
    }
    let serialized = serde_json::to_vec(&payload)
        .map_err(|e| AppError::BadRequest(format!("invalid kg json: {e}")))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::BadRequest("kg payload too large".into()));
    }

    let client_ms = body
        .updated_at
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    if client_ms < 0 {
        return Err(AppError::BadRequest("updated_at invalid".into()));
    }

    // LWW：仅当客户端更新或不存在行时写入
    let existing: Option<Option<chrono::DateTime<Utc>>> =
        sqlx::query_scalar("SELECT updated_at FROM user_kg WHERE user_id = $1")
            .bind(user.id)
            .fetch_optional(&state.pool)
            .await?;

    if let Some(Some(server_ts)) = existing {
        if server_ts.timestamp_millis() > client_ms {
            let row: (Value, Option<chrono::DateTime<Utc>>) =
                sqlx::query_as("SELECT payload, updated_at FROM user_kg WHERE user_id = $1")
                    .bind(user.id)
                    .fetch_one(&state.pool)
                    .await?;
            return Ok(Json(json!({
                "ok": true,
                "skipped": true,
                "reason": "server_newer",
                "kg": row.0,
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
        INSERT INTO user_kg (user_id, payload, updated_at)
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

/// 按槽位生成 408 大题（结构已由前端蓝图固定；此处只填内容）
async fn predict_fill(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PredictFillBody>,
) -> AppResult<Json<Value>> {
    let _ = user;
    if body.slots.is_empty() {
        return Err(AppError::BadRequest("slots required".into()));
    }
    if body.slots.len() > 12 {
        return Err(AppError::BadRequest("too many slots".into()));
    }

    let conf = state.llm_config().await;
    let model = llm::active_model(&state.pool, &conf.llm_model).await;
    let system = concat!(
        "你是考研 408 命题专家。根据给定考点生成一道「综合应用题」大题。",
        "只输出 JSON 对象，不要 markdown 围栏。字段：stem, answer, solution（均为字符串）。",
        "要求：贴合 408 真题风格；难度与分值匹配；不超纲；答案可批改；解析分步骤。",
        "题干用中文；可含伪代码。禁止输出与考点无关内容。"
    );

    let mut items = Vec::new();
    for slot in &body.slots {
        let user_msg = format!(
            "slot_id={}\nbook={}\npoints={}\ndifficulty={}/5\nprimary_kp={} ({})\nsecondary={}\n请出一题。",
            slot.slot_id,
            slot.book_id,
            slot.suggest_points,
            slot.difficulty,
            slot.primary_kp_name,
            slot.primary_kp_id,
            if slot.secondary_kp_names.is_empty() {
                "无".into()
            } else {
                slot.secondary_kp_names.join("、")
            }
        );

        match llm::chat_completion(&state.http, &conf, &model, system, &user_msg).await {
            Ok(content) => {
                let parsed = parse_llm_item(&content);
                items.push(json!({
                    "slot_id": slot.slot_id,
                    "source": "llm",
                    "stem": parsed.0,
                    "answer": parsed.1,
                    "solution": parsed.2,
                    "raw_ok": parsed.3,
                }));
            }
            Err(e) => {
                items.push(json!({
                    "slot_id": slot.slot_id,
                    "source": "error",
                    "error": e.to_string(),
                    "stem": null,
                    "answer": null,
                    "solution": null,
                }));
            }
        }
    }

    Ok(Json(json!({ "items": items, "model": model })))
}

fn parse_llm_item(content: &str) -> (String, String, String, bool) {
    let trimmed = content.trim();
    let json_str = if let Some(start) = trimmed.find('{') {
        let end = trimmed.rfind('}').unwrap_or(trimmed.len() - 1);
        &trimmed[start..=end]
    } else {
        trimmed
    };
    if let Ok(v) = serde_json::from_str::<Value>(json_str) {
        let stem = v
            .get("stem")
            .and_then(|x| x.as_str())
            .unwrap_or(trimmed)
            .to_string();
        let answer = v
            .get("answer")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let solution = v
            .get("solution")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        return (stem, answer, solution, true);
    }
    (trimmed.to_string(), String::new(), String::new(), false)
}

fn valid_item_id(id: &str) -> bool {
    let n = id.chars().count();
    if n == 0 || n > MAX_ITEM_ID_CHARS {
        return false;
    }
    let mut chars = id.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

async fn explain_question(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<ExplainBody>,
) -> AppResult<Json<Value>> {
    let ip = db::client_ip(&headers, Some(addr), state.config.trusted_proxy_hops);
    state.rate.check(&ip, "explain", 40, 60)?;

    let item_id = body.item_id.trim();
    if !valid_item_id(item_id) {
        return Err(AppError::BadRequest("item_id invalid".into()));
    }
    let stem = body.stem.trim();
    if stem.is_empty() {
        return Err(AppError::BadRequest("stem required".into()));
    }
    if stem.chars().count() > MAX_EXPLAIN_STEM_CHARS {
        return Err(AppError::BadRequest("stem too long".into()));
    }
    let kind = body.kind.as_deref().unwrap_or("big").trim();
    if kind != "big" {
        return Err(AppError::BadRequest(
            "only big questions can be explained".into(),
        ));
    }

    if let Some(row) = fetch_explain_cached(&state.pool, item_id, stem).await? {
        return Ok(Json(row));
    }

    let user = auth::try_user(&state.pool, &headers).await.ok_or_else(|| {
        AppError::Unauthorized("login required to generate new explanations".into())
    })?;
    state.rate.check(&ip, "explain_llm", 8, 60)?;
    state
        .rate
        .check(&format!("u{}", user.id), "explain_llm_user", 12, 60)?;

    do_explain(&state, item_id, stem, &body).await
}

async fn fetch_explain_cached(
    pool: &sqlx::PgPool,
    item_id: &str,
    stem: &str,
) -> Result<Option<Value>, sqlx::Error> {
    let row = sqlx::query_as::<
        _,
        (
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ),
    >(
        r#"
        SELECT stem, answer, solution, status, model
        FROM question_explanations
        WHERE item_id = $1
        "#,
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await?;

    let Some((cached_stem, answer, solution, status, model)) = row else {
        return Ok(None);
    };
    if status.as_deref() != Some("ok") {
        return Ok(None);
    }
    if cached_stem != stem {
        return Ok(None);
    }
    let answer = answer.unwrap_or_default();
    let solution = solution.unwrap_or_default();
    if answer.trim().is_empty() && solution.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(json!({
        "item_id": item_id,
        "answer": answer,
        "solution": solution,
        "status": "ok",
        "model": model.unwrap_or_default(),
        "cached": true,
    })))
}

async fn do_explain(
    state: &AppState,
    item_id: &str,
    stem: &str,
    body: &ExplainBody,
) -> AppResult<Json<Value>> {
    if let Some(row) = fetch_explain_cached(&state.pool, item_id, stem).await? {
        return Ok(Json(row));
    }

    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let llm_conf = state.llm_config().await;
    if !llm_conf.llm_configured() || model.is_empty() {
        return Ok(Json(json!({
            "item_id": item_id,
            "answer": "",
            "solution": "",
            "status": "unconfigured",
            "cached": false,
        })));
    }

    let loc = [
        body.book
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| format!("科目 {s}")),
        body.section
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| format!("§{s}")),
        body.qno.map(|n| format!("#{n}")),
        body.kp_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| format!("考点 {s}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" · ");

    let user_msg = if loc.is_empty() {
        format!("请解答：\n{stem}")
    } else {
        format!("{loc}\n请解答：\n{stem}")
    };

    match llm::chat_completion(
        &state.http,
        &llm_conf,
        &model,
        EXPLAIN_SYS_PROMPT,
        &user_msg,
    )
    .await
    {
        Ok(raw) => {
            let Some((answer, solution)) = parse_explain_json(&raw) else {
                tracing::warn!(item_id, "explain LLM parse failed");
                return Ok(Json(json!({
                    "item_id": item_id,
                    "answer": "",
                    "solution": "",
                    "status": "error",
                    "cached": false,
                    "detail": "parse failed",
                })));
            };

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
                WHERE question_explanations.status IS DISTINCT FROM 'ok'
                   OR question_explanations.stem IS DISTINCT FROM EXCLUDED.stem
                "#,
            )
            .bind(item_id)
            .bind(stem)
            .bind(&answer)
            .bind(&solution)
            .bind(&model)
            .bind(now)
            .execute(&state.pool)
            .await?;

            Ok(Json(json!({
                "item_id": item_id,
                "answer": answer,
                "solution": solution,
                "status": "ok",
                "model": model,
                "cached": false,
            })))
        }
        Err(e) => {
            tracing::warn!(item_id, error = %e, "explain LLM failed");
            Ok(Json(json!({
                "item_id": item_id,
                "answer": "",
                "solution": "",
                "status": "error",
                "cached": false,
                "detail": e.to_string(),
            })))
        }
    }
}

fn parse_explain_json(content: &str) -> Option<(String, String)> {
    let trimmed = content.trim();
    let json_str = if let Some(start) = trimmed.find('{') {
        let end = trimmed.rfind('}')?;
        &trimmed[start..=end]
    } else {
        return None;
    };
    let v: Value = serde_json::from_str(json_str).ok()?;
    let answer = v
        .get("answer")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let solution = v
        .get("solution")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if answer.is_empty() && solution.is_empty() {
        return None;
    }
    let solution = if solution.is_empty() {
        answer.clone()
    } else {
        solution
    };
    Some((answer, solution))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_id_accepts_wangdao_and_math() {
        assert!(valid_item_id("os-big-4.2-2"));
        assert!(valid_item_id("ll-base-1-big-2"));
        assert!(!valid_item_id(""));
        assert!(!valid_item_id("os big"));
        assert!(!valid_item_id("../etc/passwd"));
    }

    #[test]
    fn parse_explain_requires_answer_or_solution() {
        assert!(parse_explain_json("not json").is_none());
        assert!(parse_explain_json("{}").is_none());
        let (a, s) = parse_explain_json(
            r#"{"answer":"(1) 每块 8 个，占 32 块，平均 16.5 次。\n(2) n>m+2","solution":"分解后命中文件名还要再访一次其余信息。"}"#,
        )
        .expect("json");
        assert!(a.contains("16.5"));
        assert!(s.contains("再访"));
    }

    #[test]
    fn parse_explain_json_in_prose() {
        let raw = "如下：\n{\"answer\":\"4\",\"solution\":\"先算每块个数\"}\n完";
        assert!(parse_explain_json(raw).is_some());
    }
}
