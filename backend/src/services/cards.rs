//! 卡片持久化；可复用调用方事务，避免学习记录与调度分开提交。
use crate::error::AppResult;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CardState {
    #[serde(default)]
    pub learned: Option<bool>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub due: Option<i64>,
    #[serde(default)]
    pub ivl: Option<i32>,
    #[serde(default)]
    pub ease: Option<f64>,
    #[serde(default)]
    pub reps: Option<i32>,
    #[serde(default)]
    pub lapses: Option<i32>,
    #[serde(default)]
    pub step: Option<i32>,
    #[serde(default)]
    pub quiz: Option<i32>,
    #[serde(default)]
    pub updated_at: Option<i64>,
}

/// 按天的卡片统一在北京时间 0 点到期；读旧数据与写入新数据使用同一口径。
/// quiz=1 的十分钟学习步骤不对齐日界。
pub fn normalize_due(due: Option<i64>, state: Option<&str>, quiz: Option<i32>) -> Option<i64> {
    let day_based = state == Some("review") || (state == Some("learn") && quiz.unwrap_or(0) >= 2);
    due.map(|ts| {
        if day_based && ts > 0 {
            let day_ms = 86_400_000;
            let offset_ms = i64::from(crate::day::DAY_TZ_OFFSET_MIN) * 60_000;
            ts - (ts.rem_euclid(day_ms) + offset_ms).rem_euclid(day_ms)
        } else {
            ts
        }
    })
}

pub async fn upsert_card(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    user_id: i64,
    idx: i32,
    c: &CardState,
    reset_at_ms: i64,
) -> AppResult<()> {
    let updated_at = c
        .updated_at
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    // 重置前的卡不得 INSERT 复活
    if reset_at_ms > 0 && updated_at < reset_at_ms {
        return Ok(());
    }
    sqlx::query(
        r#"
        INSERT INTO cards (user_id, word_idx, learned, state, due, ivl, ease, reps, lapses, step, quiz, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12::DOUBLE PRECISION / 1000))
        ON CONFLICT (user_id, word_idx) DO UPDATE SET
            learned = EXCLUDED.learned,
            state = EXCLUDED.state,
            due = EXCLUDED.due,
            ivl = EXCLUDED.ivl,
            ease = EXCLUDED.ease,
            reps = EXCLUDED.reps,
            lapses = EXCLUDED.lapses,
            step = EXCLUDED.step,
            quiz = EXCLUDED.quiz,
            updated_at = EXCLUDED.updated_at
        WHERE cards.updated_at IS NULL OR EXCLUDED.updated_at >= cards.updated_at
        "#,
    )
    .bind(user_id)
    .bind(idx)
    .bind(c.learned.unwrap_or(false))
    .bind(&c.state)
    .bind(normalize_due(c.due, c.state.as_deref(), c.quiz))
    .bind(c.ivl)
    .bind(c.ease)
    .bind(c.reps)
    .bind(c.lapses)
    .bind(c.step)
    .bind(c.quiz)
    .bind(updated_at)
    .execute(executor)
    .await?;
    Ok(())
}
