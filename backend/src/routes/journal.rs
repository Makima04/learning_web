// 学习日志：按条 LWW，删除是墓碑。登录后只读写当前账号。
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_PAYLOAD_BYTES: usize = 2 * 1024 * 1024;
const MAX_BULK: usize = 2000;
const MAX_ENTRIES: i64 = 20_000;
const MAX_LOGS: i64 = 50_000;
const MAX_CATEGORIES: i64 = 200;

#[derive(Debug, Deserialize)]
struct JournalPut {
    journal: Value,
    /// 旧客户端的整包时间。只在元素自己没有 updatedAt 时用作该元素时间。
    #[serde(default)]
    updated_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct BulkBody {
    #[serde(default)]
    entries: Vec<EntryIn>,
    #[serde(default)]
    logs: Vec<LogIn>,
    #[serde(default)]
    categories: Vec<CategoryIn>,
    #[serde(default)]
    weeklies: Vec<WeeklyIn>,
}

#[derive(Debug, Deserialize)]
struct EntryIn {
    id: String,
    #[serde(default, alias = "updatedAt")]
    updated_at: Option<i64>,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    entry: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct LogIn {
    id: String,
    #[serde(default, alias = "entryId")]
    entry_id: Option<String>,
    #[serde(default, alias = "updatedAt")]
    updated_at: Option<i64>,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    log: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct CategoryIn {
    id: String,
    #[serde(default, alias = "updatedAt")]
    updated_at: Option<i64>,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    category: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct WeeklyIn {
    #[serde(alias = "weekKey")]
    week_key: String,
    #[serde(default)]
    note: Option<String>,
    #[serde(default, alias = "updatedAt")]
    updated_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
struct EntryWrite {
    id: String,
    updated_at: i64,
    deleted: bool,
    payload: Value,
}

#[derive(Debug, Clone, PartialEq)]
struct LogWrite {
    id: String,
    entry_id: String,
    updated_at: i64,
    deleted: bool,
    payload: Value,
}

#[derive(Debug, Clone, PartialEq)]
struct CategoryWrite {
    id: String,
    updated_at: i64,
    deleted: bool,
    payload: Value,
}

#[derive(Debug, Clone, PartialEq)]
struct WeeklyWrite {
    week_key: String,
    note: String,
    updated_at: i64,
}

#[derive(Debug, Default)]
struct SyncBatch {
    entries: Vec<EntryWrite>,
    logs: Vec<LogWrite>,
    categories: Vec<CategoryWrite>,
    weeklies: Vec<WeeklyWrite>,
}

impl SyncBatch {
    fn is_empty(&self) -> bool {
        self.entries.is_empty()
            && self.logs.is_empty()
            && self.categories.is_empty()
            && self.weeklies.is_empty()
    }
}

#[derive(Clone, Copy)]
enum RowCap {
    Entries,
    Logs,
    Categories,
}

impl RowCap {
    fn limit(self) -> i64 {
        match self {
            RowCap::Entries => MAX_ENTRIES,
            RowCap::Logs => MAX_LOGS,
            RowCap::Categories => MAX_CATEGORIES,
        }
    }

    fn label(self) -> &'static str {
        match self {
            RowCap::Entries => "entries",
            RowCap::Logs => "logs",
            RowCap::Categories => "categories",
        }
    }

    fn count_sql(self) -> &'static str {
        match self {
            RowCap::Entries => "SELECT COUNT(*) FROM journal_entries WHERE user_id = $1",
            RowCap::Logs => "SELECT COUNT(*) FROM journal_logs WHERE user_id = $1",
            RowCap::Categories => "SELECT COUNT(*) FROM journal_categories WHERE user_id = $1",
        }
    }

    fn existing_sql(self) -> &'static str {
        match self {
            RowCap::Entries => {
                "SELECT id FROM journal_entries WHERE user_id = $1 AND id IN (SELECT jsonb_array_elements_text($2::jsonb))"
            }
            RowCap::Logs => {
                "SELECT id FROM journal_logs WHERE user_id = $1 AND id IN (SELECT jsonb_array_elements_text($2::jsonb))"
            }
            RowCap::Categories => {
                "SELECT id FROM journal_categories WHERE user_id = $1 AND id IN (SELECT jsonb_array_elements_text($2::jsonb))"
            }
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/journal",
            get(get_journal).put(put_journal).delete(delete_journal),
        )
        .route("/api/journal/bulk", post(bulk_journal))
}

async fn get_journal(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let reset_at = journal_reset_ms(&state.pool, user.id).await?;

    let entry_rows = sqlx::query_as::<_, (String, i64, bool, Value)>(
        r#"
        SELECT id,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT,
               deleted_at IS NOT NULL,
               payload
        FROM journal_entries
        WHERE user_id = $1
        ORDER BY updated_at DESC, id
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let log_rows = sqlx::query_as::<_, (String, String, i64, bool, Value)>(
        r#"
        SELECT id,
               entry_id,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT,
               deleted_at IS NOT NULL,
               payload
        FROM journal_logs
        WHERE user_id = $1
        ORDER BY updated_at DESC, id
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let category_rows = sqlx::query_as::<_, (String, i64, bool, Value)>(
        r#"
        SELECT id,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT,
               deleted_at IS NOT NULL,
               payload
        FROM journal_categories
        WHERE user_id = $1
        ORDER BY updated_at DESC, id
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let weekly_rows = sqlx::query_as::<_, (String, String, i64)>(
        r#"
        SELECT week_key,
               note,
               (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT
        FROM journal_weeklies
        WHERE user_id = $1
        ORDER BY updated_at DESC, week_key
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let entries: Vec<Value> = entry_rows
        .into_iter()
        .map(|(id, updated_at, deleted, payload)| {
            json!({
                "id": id,
                "updated_at": updated_at,
                "deleted": deleted,
                "entry": present_body(deleted, payload),
            })
        })
        .collect();
    let logs: Vec<Value> = log_rows
        .into_iter()
        .map(|(id, entry_id, updated_at, deleted, payload)| {
            json!({
                "id": id,
                "entry_id": entry_id,
                "updated_at": updated_at,
                "deleted": deleted,
                "log": present_body(deleted, payload),
            })
        })
        .collect();
    let categories: Vec<Value> = category_rows
        .into_iter()
        .map(|(id, updated_at, deleted, payload)| {
            json!({
                "id": id,
                "updated_at": updated_at,
                "deleted": deleted,
                "category": present_body(deleted, payload),
            })
        })
        .collect();
    let weeklies: Vec<Value> = weekly_rows
        .into_iter()
        .map(|(week_key, note, updated_at)| {
            json!({
                "week_key": week_key,
                "note": note,
                "updated_at": updated_at,
            })
        })
        .collect();

    Ok(Json(json!({
        "entries": entries,
        "logs": logs,
        "categories": categories,
        "weeklies": weeklies,
        "reset_at": reset_at,
        "server_ms": Utc::now().timestamp_millis(),
    })))
}

async fn bulk_journal(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<BulkBody>,
) -> AppResult<Json<Value>> {
    let n = bulk_item_count(
        body.entries.len(),
        body.logs.len(),
        body.categories.len(),
        body.weeklies.len(),
    );
    if n > MAX_BULK {
        return Err(AppError::BadRequest(format!(
            "journal bulk too large (max {MAX_BULK})"
        )));
    }
    let now_ms = Utc::now().timestamp_millis();
    let batch = batch_from_bulk(&body, now_ms)?;
    let (applied, skipped) = sync_batch(&state, user.id, &batch).await?;
    Ok(Json(json!({
        "ok": true,
        "count": applied,
        "skipped": skipped,
    })))
}

async fn put_journal(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<JournalPut>,
) -> AppResult<Json<Value>> {
    if !body.journal.is_object() {
        return Err(AppError::BadRequest("journal must be an object".into()));
    }
    let serialized = serde_json::to_vec(&body.journal)
        .map_err(|e| AppError::BadRequest(format!("invalid journal json: {e}")))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::BadRequest("journal payload too large".into()));
    }
    let now_ms = Utc::now().timestamp_millis();
    // 整包时间不再整份拒绝；拆成按条 upsert，元素自带 updatedAt 优先。
    let (batch, doc_ms) = legacy_journal_batch(&body.journal, body.updated_at, now_ms)?;
    sync_batch(&state, user.id, &batch).await?;
    Ok(Json(json!({
        "ok": true,
        "skipped": false,
        "updated_at": doc_ms,
    })))
}

/// 清空该账号的日志，并记下重置时间。重置前的写入不能再把行救活。
async fn delete_journal(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM journal_entries WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM journal_logs WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM journal_categories WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM journal_weeklies WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    // 旧整包留着的话，下次启动回填会把清空的数据灌回来。
    sqlx::query("DELETE FROM user_journal WHERE user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    let reset_at: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO journal_reset (user_id, reset_at)
        VALUES ($1, NOW())
        ON CONFLICT (user_id) DO UPDATE SET reset_at = EXCLUDED.reset_at
        RETURNING (EXTRACT(EPOCH FROM reset_at) * 1000)::BIGINT
        "#,
    )
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({
        "ok": true,
        "reset_at": reset_at,
    })))
}

async fn sync_batch(state: &AppState, user_id: i64, batch: &SyncBatch) -> AppResult<(i64, i64)> {
    if batch.is_empty() {
        return Ok((0, 0));
    }
    let mut tx = state.pool.begin().await?;
    let reset_at = journal_reset_ms(&mut *tx, user_id).await?;
    // 会把总数撑过上限的新增整批拒绝；只更新已有 id 不占名额。
    ensure_room(
        &mut *tx,
        user_id,
        RowCap::Entries,
        &active_ids(
            batch.entries.iter().map(|row| (&row.id, row.updated_at)),
            reset_at,
        ),
    )
    .await?;
    ensure_room(
        &mut *tx,
        user_id,
        RowCap::Logs,
        &active_ids(
            batch.logs.iter().map(|row| (&row.id, row.updated_at)),
            reset_at,
        ),
    )
    .await?;
    ensure_room(
        &mut *tx,
        user_id,
        RowCap::Categories,
        &active_ids(
            batch.categories.iter().map(|row| (&row.id, row.updated_at)),
            reset_at,
        ),
    )
    .await?;
    let (applied, skipped) = apply_batch(&mut *tx, user_id, batch, reset_at).await?;
    tx.commit().await?;
    Ok((applied, skipped))
}

fn active_ids<'a>(
    rows: impl Iterator<Item = (&'a String, i64)>,
    reset_at_ms: Option<i64>,
) -> Vec<String> {
    rows.filter(|(_, updated_at)| !stale_against_reset(*updated_at, reset_at_ms))
        .map(|(id, _)| id.clone())
        .collect()
}

async fn ensure_room(
    conn: &mut sqlx::PgConnection,
    user_id: i64,
    cap: RowCap,
    ids: &[String],
) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let existing = existing_id_set(&mut *conn, user_id, cap.existing_sql(), ids).await?;
    let new_count = count_new_ids(ids, &existing);
    // 全是已有 id 的更新：不占名额，超过上限也允许。
    if new_count == 0 {
        return Ok(());
    }
    let total: i64 = sqlx::query_scalar(cap.count_sql())
        .bind(user_id)
        .fetch_one(&mut *conn)
        .await?;
    if would_exceed_cap(total, new_count, cap.limit()) {
        return Err(AppError::BadRequest(format!(
            "too many journal {}",
            cap.label()
        )));
    }
    Ok(())
}

async fn existing_id_set(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
    sql: &str,
    ids: &[String],
) -> AppResult<HashSet<String>> {
    let rows: Vec<String> = sqlx::query_scalar(sql)
        .bind(user_id)
        .bind(ids_json(ids))
        .fetch_all(executor)
        .await?;
    Ok(rows.into_iter().collect())
}

async fn apply_batch(
    conn: &mut sqlx::PgConnection,
    user_id: i64,
    batch: &SyncBatch,
    reset_at_ms: Option<i64>,
) -> AppResult<(i64, i64)> {
    let mut applied = 0i64;
    let mut skipped = 0i64;
    for row in &batch.entries {
        if stale_against_reset(row.updated_at, reset_at_ms) {
            skipped += 1;
            continue;
        }
        upsert_entry(&mut *conn, user_id, row).await?;
        applied += 1;
    }
    for row in &batch.logs {
        if stale_against_reset(row.updated_at, reset_at_ms) {
            skipped += 1;
            continue;
        }
        upsert_log(&mut *conn, user_id, row).await?;
        applied += 1;
    }
    for row in &batch.categories {
        if stale_against_reset(row.updated_at, reset_at_ms) {
            skipped += 1;
            continue;
        }
        upsert_category(&mut *conn, user_id, row).await?;
        applied += 1;
    }
    for row in &batch.weeklies {
        if stale_against_reset(row.updated_at, reset_at_ms) {
            skipped += 1;
            continue;
        }
        upsert_weekly(&mut *conn, user_id, row).await?;
        applied += 1;
    }
    Ok((applied, skipped))
}

async fn upsert_entry(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
    row: &EntryWrite,
) -> AppResult<()> {
    // 相等时间覆盖：墓碑后写，和「条目 updatedAt 不比墓碑新就删掉」一致。
    sqlx::query(
        r#"
        INSERT INTO journal_entries (user_id, id, payload, updated_at, deleted_at)
        VALUES (
            $1, $2, $3,
            to_timestamp($4::DOUBLE PRECISION / 1000.0),
            CASE WHEN $5 THEN to_timestamp($4::DOUBLE PRECISION / 1000.0) ELSE NULL END
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE journal_entries.updated_at IS NULL
           OR EXCLUDED.updated_at >= journal_entries.updated_at
        "#,
    )
    .bind(user_id)
    .bind(&row.id)
    .bind(&row.payload)
    .bind(row.updated_at)
    .bind(row.deleted)
    .execute(executor)
    .await?;
    Ok(())
}

async fn upsert_log(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
    row: &LogWrite,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO journal_logs (user_id, id, entry_id, payload, updated_at, deleted_at)
        VALUES (
            $1, $2, $3, $4,
            to_timestamp($5::DOUBLE PRECISION / 1000.0),
            CASE WHEN $6 THEN to_timestamp($5::DOUBLE PRECISION / 1000.0) ELSE NULL END
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
            entry_id = EXCLUDED.entry_id,
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE journal_logs.updated_at IS NULL
           OR EXCLUDED.updated_at >= journal_logs.updated_at
        "#,
    )
    .bind(user_id)
    .bind(&row.id)
    .bind(&row.entry_id)
    .bind(&row.payload)
    .bind(row.updated_at)
    .bind(row.deleted)
    .execute(executor)
    .await?;
    Ok(())
}

async fn upsert_category(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
    row: &CategoryWrite,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO journal_categories (user_id, id, payload, updated_at, deleted_at)
        VALUES (
            $1, $2, $3,
            to_timestamp($4::DOUBLE PRECISION / 1000.0),
            CASE WHEN $5 THEN to_timestamp($4::DOUBLE PRECISION / 1000.0) ELSE NULL END
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE journal_categories.updated_at IS NULL
           OR EXCLUDED.updated_at >= journal_categories.updated_at
        "#,
    )
    .bind(user_id)
    .bind(&row.id)
    .bind(&row.payload)
    .bind(row.updated_at)
    .bind(row.deleted)
    .execute(executor)
    .await?;
    Ok(())
}

async fn upsert_weekly(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
    row: &WeeklyWrite,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO journal_weeklies (user_id, week_key, note, updated_at)
        VALUES ($1, $2, $3, to_timestamp($4::DOUBLE PRECISION / 1000.0))
        ON CONFLICT (user_id, week_key) DO UPDATE SET
            note = EXCLUDED.note,
            updated_at = EXCLUDED.updated_at
        WHERE journal_weeklies.updated_at IS NULL
           OR EXCLUDED.updated_at >= journal_weeklies.updated_at
        "#,
    )
    .bind(user_id)
    .bind(&row.week_key)
    .bind(&row.note)
    .bind(row.updated_at)
    .execute(executor)
    .await?;
    Ok(())
}

async fn journal_reset_ms(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
) -> AppResult<Option<i64>> {
    let ms: Option<i64> = sqlx::query_scalar(
        "SELECT (EXTRACT(EPOCH FROM reset_at) * 1000)::BIGINT FROM journal_reset WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(executor)
    .await?;
    Ok(ms)
}

fn ids_json(ids: &[String]) -> Value {
    Value::Array(ids.iter().cloned().map(Value::String).collect())
}

/// 墓碑不返回正文。库里的空 payload 读出来补成对象。
fn present_body(deleted: bool, payload: Value) -> Value {
    if deleted || payload.is_null() {
        if deleted {
            Value::Null
        } else {
            json!({})
        }
    } else {
        payload
    }
}

fn bulk_item_count(entries: usize, logs: usize, categories: usize, weeklies: usize) -> usize {
    entries
        .saturating_add(logs)
        .saturating_add(categories)
        .saturating_add(weeklies)
}

/// 重置时间存在且客户端时间更早：跳过，避免把已清空的数据写回来。
fn stale_against_reset(updated_at: i64, reset_at_ms: Option<i64>) -> bool {
    matches!(reset_at_ms, Some(reset) if updated_at < reset)
}

/// 已有行数加上本批新增 id 会超过上限。重复 id、已存在的 id 不算新增。
fn count_new_ids(incoming: &[String], existing: &HashSet<String>) -> i64 {
    let mut uniq: Vec<&str> = incoming.iter().map(String::as_str).collect();
    uniq.sort_unstable();
    uniq.dedup();
    uniq.iter().filter(|id| !existing.contains(**id)).count() as i64
}

fn would_exceed_cap(existing_count: i64, new_count: i64, limit: i64) -> bool {
    new_count > 0 && existing_count.saturating_add(new_count) > limit
}

fn valid_client_millis(ms: i64) -> bool {
    ms >= 0 && Utc.timestamp_millis_opt(ms).single().is_some()
}

fn require_millis(ms: Option<i64>, now_ms: i64) -> AppResult<i64> {
    let v = ms.unwrap_or(now_ms);
    if !valid_client_millis(v) {
        return Err(AppError::BadRequest("updated_at invalid".into()));
    }
    Ok(v)
}

fn json_i64(v: &Value) -> Option<i64> {
    if let Some(n) = v.as_i64() {
        return Some(n);
    }
    let f = v.as_f64()?;
    if !f.is_finite() || f.fract() != 0.0 {
        return None;
    }
    if f < i64::MIN as f64 || f > i64::MAX as f64 {
        return None;
    }
    Some(f as i64)
}

fn batch_from_bulk(body: &BulkBody, now_ms: i64) -> AppResult<SyncBatch> {
    let mut batch = SyncBatch::default();
    for item in &body.entries {
        batch.entries.push(entry_from_bulk(item, now_ms)?);
    }
    for item in &body.logs {
        batch.logs.push(log_from_bulk(item, now_ms)?);
    }
    for item in &body.categories {
        batch.categories.push(category_from_bulk(item, now_ms)?);
    }
    for item in &body.weeklies {
        batch.weeklies.push(weekly_from_bulk(item, now_ms)?);
    }
    Ok(batch)
}

fn entry_from_bulk(item: &EntryIn, now_ms: i64) -> AppResult<EntryWrite> {
    if item.id.is_empty() {
        return Err(AppError::BadRequest("entry id required".into()));
    }
    let updated_at = require_millis(item.updated_at, now_ms)?;
    if item.deleted {
        return Ok(EntryWrite {
            id: item.id.clone(),
            updated_at,
            deleted: true,
            payload: json!({}),
        });
    }
    Ok(EntryWrite {
        id: item.id.clone(),
        updated_at,
        deleted: false,
        payload: require_live_entry(&item.id, item.entry.as_ref())?,
    })
}

fn require_live_entry(outer_id: &str, entry: Option<&Value>) -> AppResult<Value> {
    let Some(entry) = entry.filter(|v| !v.is_null()) else {
        return Err(AppError::BadRequest("entry must be an object".into()));
    };
    let Some(obj) = entry.as_object() else {
        return Err(AppError::BadRequest("entry must be an object".into()));
    };
    let id = obj.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() {
        return Err(AppError::BadRequest("entry id required".into()));
    }
    if id != outer_id {
        return Err(AppError::BadRequest("entry id mismatch".into()));
    }
    Ok(entry.clone())
}

fn log_from_bulk(item: &LogIn, now_ms: i64) -> AppResult<LogWrite> {
    if item.id.is_empty() {
        return Err(AppError::BadRequest("log id required".into()));
    }
    let updated_at = require_millis(item.updated_at, now_ms)?;
    if item.deleted {
        return Ok(LogWrite {
            id: item.id.clone(),
            entry_id: item.entry_id.clone().unwrap_or_default(),
            updated_at,
            deleted: true,
            payload: json!({}),
        });
    }
    let payload = optional_object(item.log.as_ref(), "log")?;
    Ok(LogWrite {
        id: item.id.clone(),
        entry_id: resolve_log_entry_id(&item.entry_id, &payload),
        updated_at,
        deleted: false,
        payload,
    })
}

fn resolve_log_entry_id(explicit: &Option<String>, payload: &Value) -> String {
    if let Some(id) = explicit {
        if !id.is_empty() {
            return id.clone();
        }
    }
    payload
        .get("entryId")
        .or_else(|| payload.get("entry_id"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn category_from_bulk(item: &CategoryIn, now_ms: i64) -> AppResult<CategoryWrite> {
    if item.id.is_empty() {
        return Err(AppError::BadRequest("category id required".into()));
    }
    let updated_at = require_millis(item.updated_at, now_ms)?;
    let payload = if item.deleted {
        json!({})
    } else {
        optional_object(item.category.as_ref(), "category")?
    };
    Ok(CategoryWrite {
        id: item.id.clone(),
        updated_at,
        deleted: item.deleted,
        payload,
    })
}

fn weekly_from_bulk(item: &WeeklyIn, now_ms: i64) -> AppResult<WeeklyWrite> {
    if item.week_key.is_empty() {
        return Err(AppError::BadRequest("week_key required".into()));
    }
    Ok(WeeklyWrite {
        week_key: item.week_key.clone(),
        note: item.note.clone().unwrap_or_default(),
        updated_at: require_millis(item.updated_at, now_ms)?,
    })
}

fn optional_object(value: Option<&Value>, what: &str) -> AppResult<Value> {
    match value {
        None | Some(Value::Null) => Ok(json!({})),
        Some(v) if v.is_object() => Ok(v.clone()),
        Some(_) => Err(AppError::BadRequest(format!("{what} must be an object"))),
    }
}

/// 旧整包拆成按条写入。墓碑排在活条目后面，时间相等时墓碑获胜。
fn legacy_journal_batch(
    journal: &Value,
    body_updated_at: Option<i64>,
    now_ms: i64,
) -> AppResult<(SyncBatch, i64)> {
    validate_journal_shape(journal)?;
    let fallback = resolve_doc_fallback(body_updated_at, journal, now_ms)?;
    let obj = journal
        .as_object()
        .ok_or_else(|| AppError::BadRequest("journal must be an object".into()))?;
    let mut batch = SyncBatch::default();

    if let Some(arr) = obj.get("entries").and_then(Value::as_array) {
        for elem in arr {
            let Some(id) = non_empty_str(elem, &["id"]) else {
                continue;
            };
            batch.entries.push(EntryWrite {
                id,
                updated_at: resolve_element_time(elem, fallback)?,
                deleted: false,
                payload: elem.clone(),
            });
        }
    }
    if let Some(arr) = obj.get("logs").and_then(Value::as_array) {
        for elem in arr {
            let Some(id) = non_empty_str(elem, &["id"]) else {
                continue;
            };
            batch.logs.push(LogWrite {
                id,
                entry_id: json_str(elem, &["entryId", "entry_id"]).to_string(),
                updated_at: resolve_element_time(elem, fallback)?,
                deleted: false,
                payload: elem.clone(),
            });
        }
    }
    if let Some(arr) = obj.get("categories").and_then(Value::as_array) {
        for elem in arr {
            let Some(id) = non_empty_str(elem, &["id"]) else {
                continue;
            };
            batch.categories.push(CategoryWrite {
                id,
                updated_at: resolve_element_time(elem, fallback)?,
                deleted: false,
                payload: elem.clone(),
            });
        }
    }
    if let Some(arr) = obj.get("weeklies").and_then(Value::as_array) {
        for elem in arr {
            let Some(week_key) = non_empty_str(elem, &["weekKey", "week_key"]) else {
                continue;
            };
            let note = json_str(elem, &["note"]).to_string();
            batch.weeklies.push(WeeklyWrite {
                week_key,
                note,
                updated_at: resolve_element_time(elem, fallback)?,
            });
        }
    }
    // 活条目先写，墓碑后写。时间不比条目新的墓碑不会盖住更新后的条目。
    if let Some(arr) = obj.get("deleted").and_then(Value::as_array) {
        for elem in arr {
            let Some(id) = non_empty_str(elem, &["id"]) else {
                continue;
            };
            batch.entries.push(EntryWrite {
                id,
                updated_at: resolve_tombstone_time(elem, fallback)?,
                deleted: true,
                payload: json!({}),
            });
        }
    }
    Ok((batch, fallback))
}

fn non_empty_str(elem: &Value, keys: &[&str]) -> Option<String> {
    let text = json_str(elem, keys);
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn json_str<'a>(elem: &'a Value, keys: &[&str]) -> &'a str {
    for key in keys {
        if let Some(text) = elem.get(*key).and_then(Value::as_str) {
            if !text.is_empty() {
                return text;
            }
        }
    }
    ""
}

fn resolve_doc_fallback(
    body_updated_at: Option<i64>,
    journal: &Value,
    now_ms: i64,
) -> AppResult<i64> {
    if let Some(ms) = body_updated_at {
        return require_millis(Some(ms), now_ms);
    }
    match journal.get("updatedAt") {
        None | Some(Value::Null) => Ok(now_ms),
        Some(v) if !v.is_number() => Err(AppError::BadRequest("updatedAt must be a number".into())),
        Some(v) => {
            let ms =
                json_i64(v).ok_or_else(|| AppError::BadRequest("updated_at invalid".into()))?;
            require_millis(Some(ms), now_ms)
        }
    }
}

fn resolve_element_time(element: &Value, fallback_ms: i64) -> AppResult<i64> {
    match own_number(element, &["updatedAt", "updated_at"])? {
        Some(ms) => require_millis(Some(ms), fallback_ms),
        None => Ok(fallback_ms),
    }
}

fn resolve_tombstone_time(element: &Value, fallback_ms: i64) -> AppResult<i64> {
    match own_number(element, &["at"])? {
        Some(ms) if valid_client_millis(ms) => Ok(ms),
        Some(_) => Err(AppError::BadRequest("deleted at invalid".into())),
        None => Ok(fallback_ms),
    }
}

fn own_number(element: &Value, keys: &[&str]) -> AppResult<Option<i64>> {
    for key in keys {
        let Some(v) = element.get(*key) else {
            continue;
        };
        if v.is_null() {
            continue;
        }
        if !v.is_number() {
            return Err(AppError::BadRequest(format!("{key} must be a number")));
        }
        let ms = json_i64(v).ok_or_else(|| AppError::BadRequest("updated_at invalid".into()))?;
        return Ok(Some(ms));
    }
    Ok(None)
}

fn validate_journal_shape(payload: &Value) -> AppResult<()> {
    let obj = payload
        .as_object()
        .ok_or_else(|| AppError::BadRequest("journal must be an object".into()))?;

    for key in ["categories", "entries", "logs", "weeklies", "deleted"] {
        if let Some(v) = obj.get(key) {
            if !v.is_array() {
                return Err(AppError::BadRequest(format!("{key} must be an array")));
            }
        }
    }
    if let Some(v) = obj.get("updatedAt") {
        if !v.is_null() && !v.is_number() {
            return Err(AppError::BadRequest("updatedAt must be a number".into()));
        }
    }
    if let Some(arr) = obj.get("entries").and_then(Value::as_array) {
        if arr.len() > 20_000 {
            return Err(AppError::BadRequest("too many journal entries".into()));
        }
    }
    if let Some(arr) = obj.get("logs").and_then(Value::as_array) {
        if arr.len() > 50_000 {
            return Err(AppError::BadRequest("too many journal logs".into()));
        }
    }
    if let Some(arr) = obj.get("categories").and_then(Value::as_array) {
        if arr.len() > 200 {
            return Err(AppError::BadRequest("too many journal categories".into()));
        }
    }
    if let Some(arr) = obj.get("deleted").and_then(Value::as_array) {
        if arr.len() > 20_000 {
            return Err(AppError::BadRequest("too many journal deletions".into()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn bad(result: AppResult<impl std::fmt::Debug>) -> String {
        match result {
            Err(AppError::BadRequest(msg)) => msg,
            Err(other) => panic!("unexpected error: {other:?}"),
            Ok(value) => panic!("expected error, got {value:?}"),
        }
    }

    fn entry_in(id: &str, updated_at: Option<i64>, deleted: bool, entry: Option<Value>) -> EntryIn {
        EntryIn {
            id: id.to_string(),
            updated_at,
            deleted,
            entry,
        }
    }

    /// 与 SQL `EXCLUDED.updated_at >= row.updated_at` 一致，时间相等时后写的获胜。
    fn fold_entries(rows: &[EntryWrite]) -> HashMap<String, EntryWrite> {
        let mut out = HashMap::new();
        for row in rows {
            let prev = out.get(&row.id).map(|item: &EntryWrite| item.updated_at);
            if prev.map(|ms| row.updated_at >= ms).unwrap_or(true) {
                out.insert(row.id.clone(), row.clone());
            }
        }
        out
    }

    #[test]
    fn live_entry_requires_object_and_matching_id() {
        let now = 5_000;
        let ok = entry_from_bulk(
            &entry_in(
                "e1",
                Some(10),
                false,
                Some(json!({"id": "e1", "title": "t"})),
            ),
            now,
        )
        .unwrap();
        assert_eq!(ok.updated_at, 10);
        assert!(!ok.deleted);
        assert_eq!(ok.payload["title"], "t");

        let mismatch = entry_from_bulk(
            &entry_in("e1", Some(10), false, Some(json!({"id": "other"}))),
            now,
        );
        assert_eq!(bad(mismatch), "entry id mismatch");

        let missing = entry_from_bulk(&entry_in("e1", Some(10), false, None), now);
        assert_eq!(bad(missing), "entry must be an object");

        let not_obj = entry_from_bulk(&entry_in("e1", Some(10), false, Some(json!("x"))), now);
        assert_eq!(bad(not_obj), "entry must be an object");

        let empty_inner = entry_from_bulk(
            &entry_in("e1", Some(10), false, Some(json!({"id": ""}))),
            now,
        );
        assert_eq!(bad(empty_inner), "entry id required");
    }

    #[test]
    fn tombstone_drops_body_and_default_time_is_now() {
        let row = entry_from_bulk(
            &entry_in(
                "e1",
                None,
                true,
                Some(json!({"id": "e1", "title": "secret"})),
            ),
            42,
        )
        .unwrap();
        assert!(row.deleted);
        assert_eq!(row.updated_at, 42);
        assert_eq!(row.payload, json!({}));
        assert_eq!(
            bad(entry_from_bulk(&entry_in("", Some(1), true, None), 42)),
            "entry id required"
        );
        assert_eq!(
            bad(entry_from_bulk(
                &entry_in("e1", Some(-1), false, Some(json!({"id": "e1"}))),
                42
            )),
            "updated_at invalid"
        );
    }

    #[test]
    fn reset_skips_only_strictly_older_writes() {
        assert!(!stale_against_reset(100, None));
        assert!(stale_against_reset(99, Some(100)));
        assert!(!stale_against_reset(100, Some(100)));
        assert!(!stale_against_reset(101, Some(100)));
    }

    #[test]
    fn cap_counts_new_ids_once_and_allows_existing_updates() {
        let existing: HashSet<String> = ["a".to_string()].into_iter().collect();
        assert_eq!(count_new_ids(&["a".into(), "a".into()], &existing), 0);
        assert_eq!(
            count_new_ids(&["b".into(), "b".into(), "c".into()], &existing),
            2
        );
        assert!(!would_exceed_cap(20_000, 0, MAX_ENTRIES));
        assert!(would_exceed_cap(20_000, 1, MAX_ENTRIES));
        assert!(!would_exceed_cap(19_999, 1, MAX_ENTRIES));
        assert!(would_exceed_cap(19_999, 2, MAX_ENTRIES));
        assert!(would_exceed_cap(20_001, 1, MAX_ENTRIES));
        assert!(!would_exceed_cap(20_001, 0, MAX_ENTRIES));
    }

    #[test]
    fn deleted_body_is_null_and_live_null_payload_becomes_object() {
        assert_eq!(present_body(true, json!({"title": "secret"})), Value::Null);
        assert_eq!(present_body(false, Value::Null), json!({}));
        assert_eq!(
            present_body(false, json!({"id": "e1"})),
            json!({"id": "e1"})
        );
    }

    #[test]
    fn legacy_uses_element_time_then_doc_time_and_tombstone_at() {
        let journal = json!({
            "entries": [
                {"id": "e1", "updatedAt": 100, "title": "keep"},
                {"id": "", "title": "skip"},
                "not-an-object"
            ],
            "logs": [{"id": "l1", "entryId": "e1", "result": "pass"}],
            "categories": [{"id": "c1", "name": "数学"}],
            "weeklies": [
                {"weekKey": "2026-01-05", "note": "n", "updatedAt": 300},
                {"weekKey": "2026-01-12"}
            ],
            "deleted": [
                {"id": "e2", "at": 250},
                {"id": "", "at": 1},
                {"id": "e1", "at": 50}
            ],
            "updatedAt": 400
        });
        let (batch, doc_ms) = legacy_journal_batch(&journal, Some(500), 9_999).unwrap();
        assert_eq!(doc_ms, 500);
        assert_eq!(batch.entries.len(), 3);
        assert_eq!(batch.entries[0].id, "e1");
        assert_eq!(batch.entries[0].updated_at, 100);
        assert_eq!(batch.entries[0].payload["title"], "keep");
        assert!(!batch.entries[0].deleted);
        assert_eq!(batch.entries[1].id, "e2");
        assert!(batch.entries[1].deleted);
        assert_eq!(batch.entries[1].updated_at, 250);
        assert_eq!(batch.entries[1].payload, json!({}));
        assert_eq!(batch.entries[2].id, "e1");
        assert!(batch.entries[2].deleted);
        assert_eq!(batch.entries[2].updated_at, 50);

        let folded = fold_entries(&batch.entries);
        assert!(!folded["e1"].deleted, "更新更晚的条目不被旧墓碑盖住");
        assert_eq!(folded["e1"].updated_at, 100);
        assert!(folded["e2"].deleted);

        assert_eq!(batch.logs.len(), 1);
        assert_eq!(batch.logs[0].entry_id, "e1");
        assert_eq!(batch.logs[0].updated_at, 500);
        assert_eq!(batch.categories[0].updated_at, 500);
        assert_eq!(batch.weeklies[0].updated_at, 300);
        assert_eq!(batch.weeklies[0].note, "n");
        assert_eq!(batch.weeklies[1].updated_at, 500);
        assert_eq!(batch.weeklies[1].note, "");
    }

    #[test]
    fn equal_tombstone_time_wins_over_the_live_entry() {
        let journal = json!({
            "entries": [{"id": "e1", "updatedAt": 200}],
            "deleted": [{"id": "e1", "at": 200}]
        });
        let (batch, _) = legacy_journal_batch(&journal, None, 9).unwrap();
        let folded = fold_entries(&batch.entries);
        assert!(folded["e1"].deleted);
        assert_eq!(folded["e1"].updated_at, 200);
    }

    #[test]
    fn doc_time_falls_back_to_journal_updated_at_then_now() {
        let journal = json!({
            "logs": [{"id": "l1", "entryId": "e1"}],
            "updatedAt": 400
        });
        let (batch, doc_ms) = legacy_journal_batch(&journal, None, 9_999).unwrap();
        assert_eq!(doc_ms, 400);
        assert_eq!(batch.logs[0].updated_at, 400);

        let bare = json!({"entries": [{"id": "e1"}]});
        let (batch, doc_ms) = legacy_journal_batch(&bare, None, 9_999).unwrap();
        assert_eq!(doc_ms, 9_999);
        assert_eq!(batch.entries[0].updated_at, 9_999);
        assert_eq!(
            bad(legacy_journal_batch(&json!({}), Some(-5), 1)),
            "updated_at invalid"
        );
    }

    #[test]
    fn fractional_updated_at_and_bad_tombstone_are_rejected() {
        let journal = json!({"entries": [{"id": "e1", "updatedAt": 1.5}]});
        assert_eq!(
            bad(legacy_journal_batch(&journal, Some(10), 1)),
            "updated_at invalid"
        );
        let tomb = json!({"deleted": [{"id": "e1", "at": -1}]});
        assert_eq!(
            bad(legacy_journal_batch(&tomb, Some(10), 1)),
            "deleted at invalid"
        );
    }

    #[test]
    fn bulk_helpers_reject_bad_log_category_and_week() {
        assert_eq!(bulk_item_count(1999, 1, 0, 0), 2000);
        assert!(bulk_item_count(2000, 1, 0, 0) > MAX_BULK);
        let log = log_from_bulk(
            &LogIn {
                id: "l1".into(),
                entry_id: None,
                updated_at: None,
                deleted: false,
                log: Some(json!({"id": "l1", "entryId": "e9"})),
            },
            7,
        )
        .unwrap();
        assert_eq!(log.entry_id, "e9");
        assert_eq!(log.updated_at, 7);
        let bad_log = log_from_bulk(
            &LogIn {
                id: "l1".into(),
                entry_id: None,
                updated_at: Some(1),
                deleted: false,
                log: Some(json!([1])),
            },
            7,
        );
        assert_eq!(bad(bad_log), "log must be an object");
        let week = weekly_from_bulk(
            &WeeklyIn {
                week_key: "".into(),
                note: None,
                updated_at: Some(1),
            },
            7,
        );
        assert_eq!(bad(week), "week_key required");
    }
}
