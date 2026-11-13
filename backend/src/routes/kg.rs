// 知识图谱用户进度：JSON 整包（与 journal 同模式），需登录。
// POST /api/kg/predict-fill：按蓝图槽位用 LLM 填大题题干（可选，失败由前端模板兜底）。
// POST /api/kg/explain：王道大题。answer=考场书面作答，solution=解析。缓存可匿名读；未命中需登录。
use axum::{
    extract::ConnectInfo,
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;

use crate::auth::{self, AuthUser};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

const MAX_EXPLAIN_STEM_CHARS: usize = 8000;
const MAX_ITEM_ID_CHARS: usize = 64;

const EXPLAIN_SYS_PROMPT: &str = concat!(
    "你是考研 408 综合应用题辅导老师。根据题干同时给出两种文本，用途完全不同。",
    "字段：answer（字符串，考场书面作答全文）、",
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
    "中文作答。",
    // 格式约束放末尾并给示例：代码类答案易诱发 markdown 模式，需最强位置强调
    "输出格式：只输出一个 JSON 对象，不要 markdown 围栏，不要任何旁白；",
    "字符串内换行必须转义为 \\n，双引号必须转义为 \\\"；C 代码也整段放在 answer 字符串里。",
    r#"示例：{"answer":"（1）每块装 8 个，共需 32 块。\n（2）平均访问 16.5 次。","solution":"每块个数向下取整、块数向上取整是常见错法。"}"#
);

/// 首轮输出不是合法 JSON 时，把原文交还模型转换为 JSON（修复重试）。
const REPAIR_SYS_PROMPT: &str = concat!(
    "用户给出一段考研题解答原文，但它不是合法 JSON。请把它转换为 JSON 对象，只输出 JSON，不要围栏。",
    "字段：answer（字符串，考场书面作答全文，含代码与公式）、solution（字符串，复习用解析）。",
    "原文没有独立解析时，solution 写设计思想与复杂度分析。",
    "保留原文内容，不要删改；字符串内换行转义为 \\n，双引号转义为 \\\"。"
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
    Ok(Json(
        crate::services::documents::get(
            &state.pool,
            user.id,
            crate::services::documents::DocumentKind::Kg,
        )
        .await?,
    ))
}

async fn put_kg(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<KgPut>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        crate::services::documents::put(
            &state.pool,
            user.id,
            crate::services::documents::DocumentKind::Kg,
            body.kg,
            body.updated_at,
        )
        .await?,
    ))
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

    // JSON 模式强制合法 JSON 语法：算法题答案含 C 代码，模型易滑入 markdown 模式
    match llm::chat_completion_json(
        &state.http,
        &llm_conf,
        &model,
        EXPLAIN_SYS_PROMPT,
        &user_msg,
    )
    .await
    {
        Ok(raw) => {
            let mut parsed = parse_explain_json(&raw);
            if parsed.is_none() {
                tracing::warn!(item_id, raw_head = %head_chars(&raw, 500), "explain LLM parse failed, repairing");
                if let Ok(fixed) = llm::chat_completion_json(
                    &state.http,
                    &llm_conf,
                    &model,
                    REPAIR_SYS_PROMPT,
                    &raw,
                )
                .await
                {
                    parsed = parse_explain_json(&fixed);
                }
            }
            let (answer, solution) = match parsed {
                Some(p) => p,
                None => {
                    // 兜底：原文去围栏后作为解析展示，不再报错（answer 为空时前端回退显示 solution）
                    tracing::warn!(item_id, raw_head = %head_chars(&raw, 500), "explain LLM parse failed after repair, fallback to raw");
                    (String::new(), strip_code_fences(&raw))
                }
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
    for json_str in explain_json_candidates(trimmed) {
        let Ok(v) = serde_json::from_str::<Value>(json_str) else {
            continue;
        };
        if let Some(pair) = explain_fields(&v) {
            return Some(pair);
        }
    }
    None
}

/// 候选 JSON 片段，按可信度排序：整串 → 围栏块 → 首尾花括号 → 紧跟 answer/solution 键的起点。
/// 最后一类用于跳过散文/C 代码里的花括号（算法题答案常带代码，首 `{` 往往是 struct）。
fn explain_json_candidates(trimmed: &str) -> Vec<&str> {
    let mut out = vec![trimmed];
    let mut rest = trimmed;
    while let Some(open) = rest.find("```") {
        let after = &rest[open + 3..];
        let Some(close) = after.find("```") else {
            break;
        };
        let block = after[..close].trim();
        let block = block.strip_prefix("json").map(str::trim).unwrap_or(block);
        out.push(block);
        rest = &after[close + 3..];
    }
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if start < end {
            out.push(&trimmed[start..=end]);
            for key in ["{\"answer\"", "{\"solution\""] {
                let mut from = 0;
                while let Some(pos) = trimmed[from..].find(key) {
                    let s = from + pos;
                    if s < end {
                        out.push(&trimmed[s..=end]);
                    }
                    from = s + key.len();
                }
            }
        }
    }
    out
}

fn explain_fields(v: &Value) -> Option<(String, String)> {
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

/// 兜底展示时去掉 ``` 围栏标记行，保留代码本身。
fn strip_code_fences(content: &str) -> String {
    content
        .trim()
        .lines()
        .filter(|l| !l.trim().starts_with("```"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn head_chars(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
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

    #[test]
    fn parse_explain_json_in_fence() {
        let raw = "讲解如下：\n```json\n{\"answer\":\"4\",\"solution\":\"先算每块个数\"}\n```\n完";
        let (a, s) = parse_explain_json(raw).expect("fenced json");
        assert_eq!(a, "4");
        assert!(s.contains("每块"));
    }

    #[test]
    fn parse_explain_skips_c_braces_before_json() {
        // 散文/C 代码的花括号在 JSON 之前：首尾花括号截取会失败，候选起点应救回
        let raw = "typedef struct { int a; } S;\n{\"answer\":\"ok\",\"solution\":\"s\"}";
        let (a, _) = parse_explain_json(raw).expect("json after code braces");
        assert_eq!(a, "ok");
    }

    #[test]
    fn parse_explain_markdown_c_code_is_none() {
        // 真实失败形态（ds-big-2.2-6）：纯 markdown + C 代码，无 JSON → 提取失败，走修复/兜底
        let raw = "设顺序表升序。\n\n```c\ntypedef struct {\n    int data[100];\n    int length;\n} SqList;\nSqList Merge(SqList A, SqList B) {\n    SqList C;\n    return C;\n}\n```";
        assert!(parse_explain_json(raw).is_none());
    }

    #[test]
    fn fallback_strips_fence_markers_keeps_code() {
        let raw = "思路\n```c\nint x;\n```\n完";
        let s = strip_code_fences(raw);
        assert!(!s.contains("```"));
        assert!(s.contains("int x;"));
        assert!(s.contains("思路"));
    }
}
