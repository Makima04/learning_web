//! 进度导入的统一事务边界，承接文件导入、访客数据与旧浏览器待同步队列。
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::collections::{BTreeSet, HashMap};

use super::{
    cards::{upsert_card, CardState},
    study::lock_progress,
};
use crate::error::{AppError, AppResult};

#[derive(Clone, Serialize, Deserialize)]
pub struct ImportedEvent {
    pub word_idx: i32,
    pub event_type: String,
    pub quality: Option<String>,
    pub day_key: String,
    pub client_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ImportedMeta {
    pub day_key: String,
    pub new_today: Option<i32>,
    pub review_today: Option<i32>,
    pub learn_today: Option<i32>,
    pub done_today: Option<i32>,
    pub client_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub operation_id: String,
    pub client_at: i64,
    #[serde(default)]
    pub cards: HashMap<String, CardState>,
    #[serde(default)]
    pub events: Vec<ImportedEvent>,
    pub meta: Option<ImportedMeta>,
}

fn valid_day(day: &str) -> bool {
    NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == day)
}

pub async fn import(pool: &PgPool, user_id: i64, snapshot: &Snapshot) -> AppResult<Value> {
    if snapshot.operation_id.is_empty()
        || snapshot.operation_id.len() > 128
        || snapshot.client_at <= 0
        || !snapshot
            .operation_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || snapshot.cards.len() > 6550
        || snapshot.events.len() > 200
        || snapshot.cards.iter().any(|(idx, card)| {
            idx.parse::<i32>()
                .map_or(true, |n| !(1..=6550).contains(&n))
                || card
                    .state
                    .as_deref()
                    .is_some_and(|state| !matches!(state, "new" | "learn" | "review"))
        })
        || snapshot.events.iter().any(|event| {
            !(1..=6550).contains(&event.word_idx)
                || !valid_day(&event.day_key)
                || !matches!(event.event_type.as_str(), "new" | "review" | "learn")
        })
        || snapshot.meta.as_ref().is_some_and(|meta| {
            !valid_day(&meta.day_key)
                || [
                    meta.new_today,
                    meta.review_today,
                    meta.learn_today,
                    meta.done_today,
                ]
                .into_iter()
                .flatten()
                .any(|count| count < 0)
        })
    {
        return Err(AppError::BadRequest("invalid study import".into()));
    }

    let payload =
        serde_json::to_value(snapshot).map_err(|error| AppError::Internal(error.into()))?;
    let mut tx = pool.begin().await?;
    let reset = lock_progress(&mut tx, user_id).await?;
    let inserted: Option<String> = sqlx::query_scalar("INSERT INTO study_commands(user_id,operation_id,client_at,payload) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,operation_id) DO NOTHING RETURNING operation_id")
        .bind(user_id).bind(&snapshot.operation_id).bind(snapshot.client_at).bind(&payload).fetch_optional(&mut *tx).await?;
    if inserted.is_none() {
        let previous: Value = sqlx::query_scalar(
            "SELECT payload FROM study_commands WHERE user_id=$1 AND operation_id=$2",
        )
        .bind(user_id)
        .bind(&snapshot.operation_id)
        .fetch_one(&mut *tx)
        .await?;
        if previous != payload {
            return Err(AppError::Conflict(
                "operation_id reused with different content".into(),
            ));
        }
        tx.commit().await?;
        return Ok(json!({"ok":true,"duplicate":true}));
    }
    for (idx, card) in &snapshot.cards {
        // 缺少版本的旧卡按 0 处理，不能绕过服务端重置水位。
        let mut card = card.clone();
        card.updated_at = Some(card.updated_at.unwrap_or(0));
        upsert_card(&mut *tx, user_id, idx.parse().unwrap(), &card, reset).await?;
    }
    let mut days = BTreeSet::new();
    for event in &snapshot.events {
        let at = event.client_at.unwrap_or(0);
        if at < reset {
            continue;
        }
        days.insert(&event.day_key);
        sqlx::query(r#"
            INSERT INTO study_events(user_id,word_idx,event_type,quality,day_key,studied_at,client_at)
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(user_id,day_key,word_idx,client_at) WHERE client_at IS NOT NULL AND client_at > 0 DO NOTHING
        "#).bind(user_id).bind(event.word_idx).bind(&event.event_type).bind(&event.quality).bind(&event.day_key)
            .bind(Utc::now()).bind(if at>0 {Some(at)} else {None}).execute(&mut *tx).await?;
    }
    for day in days {
        super::study::refresh_day(&mut tx, user_id, day).await?;
    }
    if let Some(meta) = &snapshot.meta {
        if meta.client_at.unwrap_or(0) >= reset {
            sqlx::query(r#"
                INSERT INTO meta(user_id,day_key,new_today,review_today,learn_today,done_today,updated_at)
                VALUES($1,$2,$3,$4,$5,$6,NOW())
                ON CONFLICT(user_id,day_key) DO UPDATE SET new_today=GREATEST(meta.new_today,EXCLUDED.new_today),
                    review_today=GREATEST(meta.review_today,EXCLUDED.review_today),learn_today=GREATEST(meta.learn_today,EXCLUDED.learn_today),
                    done_today=GREATEST(meta.done_today,EXCLUDED.done_today),updated_at=EXCLUDED.updated_at
            "#).bind(user_id).bind(&meta.day_key).bind(meta.new_today.unwrap_or(0)).bind(meta.review_today.unwrap_or(0))
                .bind(meta.learn_today.unwrap_or(0)).bind(meta.done_today.unwrap_or(0)).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    Ok(json!({"ok":true,"duplicate":false}))
}
