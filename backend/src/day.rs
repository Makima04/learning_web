//! 「一天」的边界：固定按北京时间（UTC+8）0 点。
//!
//! 前端 `lib/day.ts` 是同一套规则，`day_key` 全链路（study_events / meta / stats）
//! 都是北京时间口径。客户端总是带着 day 参数来，这里的兜底也必须一致，
//! 否则凌晨请求会落到前一天。

use chrono::{Duration, NaiveDate, Utc};

/// 东八区偏移（分钟）
pub const DAY_TZ_OFFSET_MIN: i32 = 8 * 60;

/// 按给定偏移分钟数取「今天」（偏移限制在 ±24h 内）
pub fn today_naive_with_offset(tz_minutes: i32) -> NaiveDate {
    let tz = tz_minutes.clamp(-24 * 60, 24 * 60) as i64;
    (Utc::now() + Duration::minutes(tz)).date_naive()
}

/// 北京时间的「今天」
pub fn today_naive() -> NaiveDate {
    today_naive_with_offset(DAY_TZ_OFFSET_MIN)
}

/// 北京时间的「今天」YYYY-MM-DD
pub fn today_key() -> String {
    today_naive().format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_key_is_shanghai_date() {
        let expect = (Utc::now() + Duration::hours(8))
            .format("%Y-%m-%d")
            .to_string();
        assert_eq!(today_key(), expect);
    }

    #[test]
    fn offset_is_clamped() {
        // 极端偏移不 panic，仍返回合法日期
        assert!(today_naive_with_offset(100_000).format("%Y-%m-%d").to_string().len() == 10);
        assert!(today_naive_with_offset(-100_000).format("%Y-%m-%d").to_string().len() == 10);
    }

    #[test]
    fn offset_is_eight_hours() {
        assert_eq!(DAY_TZ_OFFSET_MIN, 480);
    }
}
