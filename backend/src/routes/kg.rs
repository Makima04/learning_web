// 知识图谱用户进度：JSON 整包（与 journal 同模式），需登录。
// POST /api/kg/predict-fill：按蓝图槽位用 LLM 填大题题干（可选，失败由前端模板兜底）。
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::llm;
use crate::state::AppState;

const MAX_PAYLOAD_BYTES: usize = 4 * 1024 * 1024; // 4 MiB

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

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/kg", get(get_kg).put(put_kg))
        .route("/api/kg/predict-fill", post(predict_fill))
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
