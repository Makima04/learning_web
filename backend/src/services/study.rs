//! 学习完成事务：幂等命令、卡片、学习事件与每日统计共同提交或回滚。
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgConnection, PgPool};
use std::collections::BTreeSet;

use super::cards::{upsert_card, CardState};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Completion {
    pub operation_id: String,
    pub word_idx: i32,
    pub card: CardState,
    pub event_type: String,
    pub day_key: String,
    pub client_at: i64,
}

fn validate(command: &Completion) -> AppResult<()> {
    let card = &command.card;
    let date = DateTime::from_timestamp_millis(command.client_at)
        .and_then(|at| {
            at.checked_add_signed(Duration::minutes(i64::from(crate::day::DAY_TZ_OFFSET_MIN)))
        })
        .map(|at| at.format("%Y-%m-%d").to_string());
    if command.operation_id.is_empty()
        || command.operation_id.len() > 128
        || !command
            .operation_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || !(1..=6550).contains(&command.word_idx)
        || !matches!(command.event_type.as_str(), "new" | "review")
        || command.client_at <= 0
        || date.as_deref() != Some(command.day_key.as_str())
        || card.updated_at != Some(command.client_at)
        || card.state.as_deref() != Some("review")
        || card.learned != Some(true)
        || !card.due.is_some_and(|due| due > command.client_at)
        || !card.ivl.is_some_and(|ivl| (1..=36500).contains(&ivl))
        || !card
            .ease
            .is_some_and(|ease| ease.is_finite() && (1.3..=3.0).contains(&ease))
        || !card.reps.is_some_and(|reps| reps >= 1)
        || !card.lapses.is_some_and(|lapses| lapses >= 0)
        || card.quiz.unwrap_or(0) != 0
    {
        return Err(AppError::BadRequest("invalid study completion".into()));
    }
    Ok(())
}

/// 同一账号的进度写入与权威清空共用行锁，清空期间不允许旧学习复活。
pub async fn lock_progress(connection: &mut PgConnection, user_id: i64) -> AppResult<i64> {
    sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_one(&mut *connection)
        .await?;
    let reset: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT reset_at FROM progress_reset WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(&mut *connection)
            .await?;
    Ok(reset.map(|at| at.timestamp_millis()).unwrap_or(0))
}

pub async fn complete(pool: &PgPool, user_id: i64, commands: &[Completion]) -> AppResult<Value> {
    if commands.len() > 200 {
        return Err(AppError::BadRequest("max 200 completions".into()));
    }
    for command in commands {
        validate(command)?;
    }
    let mut tx = pool.begin().await?;
    let reset_at = lock_progress(&mut tx, user_id).await?;
    let mut applied = 0;
    let mut ignored = 0;
    let mut days = BTreeSet::new();
    for command in commands {
        if command.client_at < reset_at {
            ignored += 1;
            continue;
        }
        let payload = serde_json::to_value(command).map_err(|e| AppError::Internal(e.into()))?;
        let inserted: Option<String> = sqlx::query_scalar(r#"
            INSERT INTO study_commands (user_id, operation_id, client_at, payload) VALUES ($1,$2,$3,$4)
            ON CONFLICT (user_id, operation_id) DO NOTHING RETURNING operation_id
        "#).bind(user_id).bind(&command.operation_id).bind(command.client_at).bind(&payload)
            .fetch_optional(&mut *tx).await?;
        if inserted.is_none() {
            let previous: Value = sqlx::query_scalar(
                "SELECT payload FROM study_commands WHERE user_id=$1 AND operation_id=$2",
            )
            .bind(user_id)
            .bind(&command.operation_id)
            .fetch_one(&mut *tx)
            .await?;
            if previous != payload {
                return Err(AppError::Conflict(
                    "operation_id reused with different content".into(),
                ));
            }
            ignored += 1;
            continue;
        }
        upsert_card(&mut *tx, user_id, command.word_idx, &command.card, reset_at).await?;
        // 操作 ID 已幂等去重；client_at 留空，避免同毫秒的两个有效操作被旧索引误合并。
        sqlx::query("INSERT INTO study_events (user_id,word_idx,event_type,quality,day_key,studied_at) VALUES ($1,$2,$3,'good',$4,$5)")
            .bind(user_id).bind(command.word_idx).bind(&command.event_type).bind(&command.day_key)
            .bind(DateTime::from_timestamp_millis(command.client_at).unwrap())
            .execute(&mut *tx).await?;
        days.insert(&command.day_key);
        applied += 1;
    }
    for day in days {
        refresh_day(&mut tx, user_id, day).await?;
    }
    tx.commit().await?;
    Ok(json!({ "ok": true, "applied": applied, "ignored": ignored }))
}

/// 历史导入可能只有计数，保留这部分基线；新命令与导入事件共同更新每日投影。
pub async fn refresh_day(connection: &mut PgConnection, user_id: i64, day: &str) -> AppResult<()> {
    sqlx::query(r#"
            INSERT INTO meta (user_id,day_key,new_today,review_today,learn_today,done_today,updated_at)
            SELECT $1,$2,COUNT(*) FILTER (WHERE event_type='new'),COUNT(*) FILTER (WHERE event_type='review'),
                COUNT(*) FILTER (WHERE event_type='learn'),COUNT(*),NOW()
            FROM study_events WHERE user_id=$1 AND day_key=$2
            ON CONFLICT (user_id,day_key) DO UPDATE SET new_today=GREATEST(meta.new_today,EXCLUDED.new_today),
                review_today=GREATEST(meta.review_today,EXCLUDED.review_today),learn_today=GREATEST(meta.learn_today,EXCLUDED.learn_today),
                done_today=GREATEST(meta.done_today,EXCLUDED.done_today),updated_at=EXCLUDED.updated_at
        "#).bind(user_id).bind(day).execute(&mut *connection).await?;
    Ok(())
}
