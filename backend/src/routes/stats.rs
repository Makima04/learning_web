use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Deserialize)]
struct StudyEventBody {
    word_idx: i32,
    event_type: String,
    quality: Option<String>,
    day_key: String,
    /// 客户端记录时间（毫秒）；缺省视为 0，重置后会被丢掉
    client_at: Option<i64>,
}

#[derive(Deserialize)]
struct DayQ {
    day: Option<String>,
}

#[derive(Deserialize)]
struct RangeQ {
    from: String,
    to: String,
}

#[derive(Deserialize)]
struct OverviewQ {
    /// 客户端时区偏移分钟（东八区 = 480）。day_key 全链路是本地时区，
    /// streak 的「今天」必须与之间隔一致，否则凌晨背完词会被判断链。
    tz: Option<i32>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/study-events", post(post_event))
        .route("/api/stats/today", get(stats_today))
        .route("/api/stats/daily", get(stats_daily))
        .route("/api/stats/overview", get(stats_overview))
}

async fn post_event(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<StudyEventBody>,
) -> AppResult<Json<Value>> {
    if body.day_key.is_empty() {
        return Err(AppError::BadRequest("day_key required".into()));
    }
    let reset_at_ms = super::cards::user_reset_at_ms(&state.pool, user.id).await?;
    let client_at = body.client_at.unwrap_or(0);
    if reset_at_ms > 0 && client_at < reset_at_ms {
        return Ok(Json(json!({ "ok": true, "ignored": "stale_after_reset" })));
    }
    sqlx::query(
        r#"
        INSERT INTO study_events (user_id, word_idx, event_type, quality, day_key, studied_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(user.id)
    .bind(body.word_idx)
    .bind(&body.event_type)
    .bind(&body.quality)
    .bind(&body.day_key)
    .bind(Utc::now())
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn stats_today(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<DayQ>,
) -> AppResult<Json<Value>> {
    let day = q
        .day
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let rows = sqlx::query_as::<_, (i32, String, Option<String>, chrono::DateTime<Utc>)>(
        r#"
        SELECT word_idx, event_type, quality, studied_at
        FROM study_events
        WHERE user_id = $1 AND day_key = $2
        ORDER BY studied_at
        "#,
    )
    .bind(user.id)
    .bind(&day)
    .fetch_all(&state.pool)
    .await?;

    let mut summary = json!({"new": 0, "review": 0, "learn": 0, "done": 0});
    let items: Vec<Value> = rows
        .into_iter()
        .map(|(word_idx, event_type, quality, studied_at)| {
            if let Some(obj) = summary.as_object_mut() {
                let key = match event_type.as_str() {
                    "new" => "new",
                    "review" => "review",
                    "learn" => "learn",
                    _ => "done",
                };
                if let Some(v) = obj.get_mut(key) {
                    *v = json!(v.as_i64().unwrap_or(0) + 1);
                }
                if let Some(v) = obj.get_mut("done") {
                    *v = json!(v.as_i64().unwrap_or(0) + 1);
                }
            }
            json!({
                "word_idx": word_idx,
                "english": "",
                "event_type": event_type,
                "quality": quality,
                "studied_at": studied_at.to_rfc3339(),
            })
        })
        .collect();

    let reset_at = super::cards::user_reset_at(&state.pool, user.id).await?;
    Ok(Json(json!({
        "items": items,
        "summary": summary,
        "reset_at": reset_at.map(|t| t.to_rfc3339()),
    })))
}

async fn stats_daily(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<RangeQ>,
) -> AppResult<Json<Value>> {
    let rows = sqlx::query_as::<_, (String, i64, i64, i64, i64, i64)>(
        r#"
        SELECT day_key,
          COUNT(*) FILTER (WHERE event_type = 'new') AS new_c,
          COUNT(*) FILTER (WHERE event_type = 'review') AS review_c,
          COUNT(*) FILTER (WHERE event_type = 'learn') AS learn_c,
          COUNT(*) AS done_c,
          COUNT(DISTINCT word_idx) AS distinct_words
        FROM study_events
        WHERE user_id = $1 AND day_key >= $2 AND day_key <= $3
        GROUP BY day_key
        ORDER BY day_key
        "#,
    )
    .bind(user.id)
    .bind(&q.from)
    .bind(&q.to)
    .fetch_all(&state.pool)
    .await?;

    let out: Vec<Value> = rows
        .into_iter()
        .map(|(day_key, n, r, l, d, dw)| {
            json!({
                "day_key": day_key,
                "new": n,
                "review": r,
                "learn": l,
                "done": d,
                "distinct_words": dw,
            })
        })
        .collect();
    Ok(Json(json!(out)))
}

async fn stats_overview(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<OverviewQ>,
) -> AppResult<Json<Value>> {
    let total_studied: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT word_idx) FROM cards WHERE user_id = $1")
            .bind(user.id)
            .fetch_one(&state.pool)
            .await?;
    let total_reviews: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM study_events WHERE user_id = $1 AND event_type = 'review'",
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await?;
    let days_active: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT day_key) FROM study_events WHERE user_id = $1")
            .bind(user.id)
            .fetch_one(&state.pool)
            .await?;

    // simple streak: count consecutive days ending today from study_events
    let days: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT day_key FROM study_events WHERE user_id = $1 ORDER BY day_key DESC",
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    // 「今天」按客户端时区换算，与本地时区 day_key 对齐；偏移限制在 ±24h 内
    let tz = q.tz.unwrap_or(0).clamp(-24 * 60, 24 * 60) as i64;
    let today = (Utc::now() + chrono::Duration::minutes(tz)).date_naive();
    let (current_streak, longest_streak) = compute_streaks(&days, today);

    Ok(Json(json!({
        "total_studied": total_studied,
        "total_reviews": total_reviews,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "retention_rate": 0.0,
        "days_active": days_active,
    })))
}

fn compute_streaks(days_desc: &[String], today: chrono::NaiveDate) -> (i64, i64) {
    if days_desc.is_empty() {
        return (0, 0);
    }
    use chrono::NaiveDate;
    let mut dates: Vec<NaiveDate> = days_desc
        .iter()
        .filter_map(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .collect();
    dates.sort();
    dates.dedup();

    let mut longest = 1i64;
    let mut run = 1i64;
    for w in dates.windows(2) {
        if (w[1] - w[0]).num_days() == 1 {
            run += 1;
            longest = longest.max(run);
        } else {
            run = 1;
        }
    }

    let mut current = 0i64;
    let last = *dates.last().unwrap();
    // allow today or yesterday as streak head
    if last == today || last == today - chrono::Duration::days(1) {
        let mut expect = today;
        if !dates.contains(&today) {
            expect = today - chrono::Duration::days(1);
        }
        let set: std::collections::HashSet<_> = dates.iter().copied().collect();
        while set.contains(&expect) {
            current += 1;
            expect -= chrono::Duration::days(1);
        }
    }

    (current, longest.max(current))
}

#[cfg(test)]
mod tests {
    use super::compute_streaks;
    use chrono::NaiveDate;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn empty_days_give_zero() {
        let (cur, long) = compute_streaks(&[], d("2026-08-22"));
        assert_eq!((cur, long), (0, 0));
    }

    #[test]
    fn today_head_counts_through_today() {
        let days = vec!["2026-08-20", "2026-08-21", "2026-08-22"];
        let days: Vec<String> = days.iter().map(|s| s.to_string()).collect();
        let (cur, long) = compute_streaks(&days, d("2026-08-22"));
        assert_eq!((cur, long), (3, 3));
    }

    #[test]
    fn yesterday_head_keeps_streak_alive_today() {
        let days = vec!["2026-08-20", "2026-08-21"];
        let days: Vec<String> = days.iter().map(|s| s.to_string()).collect();
        let (cur, _) = compute_streaks(&days, d("2026-08-22"));
        assert_eq!(cur, 2);
    }

    #[test]
    fn gap_before_yesterday_breaks_current() {
        let days = vec!["2026-08-20", "2026-08-19"];
        let days: Vec<String> = days.iter().map(|s| s.to_string()).collect();
        let (cur, _) = compute_streaks(&days, d("2026-08-22"));
        assert_eq!(cur, 0);
    }

    #[test]
    fn longest_may_differ_from_current() {
        let days = vec![
            "2026-07-01",
            "2026-07-02",
            "2026-07-03",
            "2026-07-04",
            "2026-08-21",
            "2026-08-22",
        ];
        let days: Vec<String> = days.iter().map(|s| s.to_string()).collect();
        let (cur, long) = compute_streaks(&days, d("2026-08-22"));
        assert_eq!((cur, long), (2, 4));
    }

    #[test]
    fn local_today_not_utc_today() {
        // 本地（UTC+8）8/22 凌晨：UTC 还是 8/21。链头按传入的本地今天判断
        let days = vec!["2026-08-21", "2026-08-22"];
        let days: Vec<String> = days.iter().map(|s| s.to_string()).collect();
        let (cur, _) = compute_streaks(&days, d("2026-08-22"));
        assert_eq!(cur, 2);
    }
}
