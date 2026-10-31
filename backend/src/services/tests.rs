use super::{
    cards::CardState,
    documents::{self, DocumentKind},
    study::{self, Completion},
};
use serde_json::json;
use sqlx::PgPool;

async fn user(pool: &PgPool, name: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO users(username,pw_hash,salt) VALUES($1,'test','test') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

fn command(operation_id: &str, word_idx: i32) -> Completion {
    let now = chrono::DateTime::parse_from_rfc3339("2026-10-31T20:00:00+08:00")
        .unwrap()
        .timestamp_millis();
    Completion {
        operation_id: operation_id.into(),
        word_idx,
        event_type: "new".into(),
        day_key: "2026-10-31".into(),
        client_at: now,
        card: CardState {
            learned: Some(true),
            state: Some("review".into()),
            due: Some(now + 4 * 3_600_000),
            ivl: Some(1),
            ease: Some(2.5),
            reps: Some(1),
            lapses: Some(0),
            quiz: Some(0),
            updated_at: Some(now),
            ..Default::default()
        },
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn concurrent_documents_keep_the_newest_version(pool: PgPool) {
    let id = user(&pool, "documents").await;
    for kind in [DocumentKind::Kg, DocumentKind::Politics] {
        let writes = (1..=30).rev().map(|version| {
            documents::put(&pool, id, kind, json!({"value":version}), Some(version))
        });
        for result in futures::future::join_all(writes).await {
            result.unwrap();
        }
        let saved = documents::get(&pool, id, kind).await.unwrap();
        assert_eq!(saved["updated_at"], 30);
        let stale = documents::put(&pool, id, kind, json!({"value":0}), Some(0))
            .await
            .unwrap();
        assert_eq!(stale["skipped"], true);
        assert_eq!(stale["updated_at"], 30);
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn documents_validate_input_and_isolate_accounts(pool: PgPool) {
    let a = user(&pool, "a").await;
    let b = user(&pool, "b").await;
    assert!(
        documents::put(&pool, a, DocumentKind::Kg, json!([]), Some(1))
            .await
            .is_err()
    );
    assert!(
        documents::put(&pool, a, DocumentKind::Kg, json!({}), Some(-1))
            .await
            .is_err()
    );
    documents::put(
        &pool,
        a,
        DocumentKind::Kg,
        json!({"updatedAt":999,"note":"a"}),
        Some(1),
    )
    .await
    .unwrap();
    let saved = documents::get(&pool, a, DocumentKind::Kg).await.unwrap();
    assert_eq!(saved["kg"]["updatedAt"], 1);
    assert!(documents::get(&pool, b, DocumentKind::Kg).await.unwrap()["kg"].is_null());
}

#[sqlx::test(migrations = "./migrations")]
async fn study_retries_are_idempotent_and_commit_all_projections(pool: PgPool) {
    let id = user(&pool, "study").await;
    let first = command("first", 1);
    study::complete(&pool, id, &[first.clone()]).await.unwrap();
    let retry = study::complete(&pool, id, &[first]).await.unwrap();
    assert_eq!(retry["ignored"], 1);
    let counts: (i64,i64,i64) = sqlx::query_as("SELECT (SELECT COUNT(*) FROM cards),(SELECT COUNT(*) FROM study_events),(SELECT COUNT(*) FROM study_commands)")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (1, 1, 1));
    let meta: (i32, i32) = sqlx::query_as("SELECT new_today,done_today FROM meta WHERE user_id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(meta, (1, 1));
}

#[sqlx::test(migrations = "./migrations")]
async fn study_batch_rolls_back_when_operation_id_is_reused(pool: PgPool) {
    let id = user(&pool, "rollback").await;
    assert!(
        study::complete(&pool, id, &[command("same", 1), command("same", 2)])
            .await
            .is_err()
    );
    let counts: (i64,i64,i64,i64) = sqlx::query_as("SELECT (SELECT COUNT(*) FROM cards),(SELECT COUNT(*) FROM study_events),(SELECT COUNT(*) FROM study_commands),(SELECT COUNT(*) FROM meta)")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (0, 0, 0, 0));
}

#[sqlx::test(migrations = "./migrations")]
async fn simultaneous_study_commands_merge_daily_counts(pool: PgPool) {
    let id = user(&pool, "parallel").await;
    let one = [command("one", 1)];
    let two = [command("two", 2)];
    let (a, b) = tokio::join!(
        study::complete(&pool, id, &one),
        study::complete(&pool, id, &two)
    );
    a.unwrap();
    b.unwrap();
    let meta: (i32, i32) = sqlx::query_as("SELECT new_today,done_today FROM meta WHERE user_id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(meta, (2, 2));
}

#[sqlx::test(migrations = "./migrations")]
async fn reset_blocks_old_commands_and_invalid_input_is_rejected(pool: PgPool) {
    let id = user(&pool, "reset").await;
    let old = command("old", 1);
    let mut tx = pool.begin().await.unwrap();
    study::lock_progress(&mut tx, id).await.unwrap();
    sqlx::query("INSERT INTO progress_reset(user_id,reset_at,day_key) VALUES($1,to_timestamp($2::DOUBLE PRECISION/1000),'2026-10-31')")
        .bind(id).bind(old.client_at + 1).execute(&mut *tx).await.unwrap();
    tx.commit().await.unwrap();
    let result = study::complete(&pool, id, &[old.clone()]).await.unwrap();
    assert_eq!(result["ignored"], 1);
    let mut invalid = old;
    invalid.day_key = "2026-10-30".into();
    assert!(study::complete(&pool, id, &[invalid]).await.is_err());
    let events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM study_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(events, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn old_progress_import_is_atomic_and_retry_safe(pool: PgPool) {
    use super::study_import::{self, ImportedEvent, ImportedMeta, Snapshot};
    let id = user(&pool, "import").await;
    let first = command("unused", 1);
    let snapshot = Snapshot {
        operation_id: "legacy-import".into(),
        client_at: first.client_at,
        cards: std::collections::HashMap::from([("1".into(), first.card.clone())]),
        events: vec![ImportedEvent {
            word_idx: 1,
            event_type: "new".into(),
            quality: Some("good".into()),
            day_key: first.day_key.clone(),
            client_at: Some(first.client_at),
        }],
        meta: Some(ImportedMeta {
            day_key: first.day_key.clone(),
            new_today: Some(3),
            review_today: Some(2),
            learn_today: Some(0),
            done_today: Some(5),
            client_at: Some(first.client_at),
        }),
    };
    study_import::import(&pool, id, &snapshot).await.unwrap();
    assert_eq!(
        study_import::import(&pool, id, &snapshot).await.unwrap()["duplicate"],
        true
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM study_events WHERE user_id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let counts: (i32, i32) =
        sqlx::query_as("SELECT new_today,done_today FROM meta WHERE user_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(counts, (3, 5));
    let mut changed = snapshot;
    changed.events[0].word_idx = 2;
    assert!(study_import::import(&pool, id, &changed).await.is_err());
}

#[sqlx::test(migrations = "./migrations")]
async fn old_import_cannot_revive_progress_after_reset(pool: PgPool) {
    use super::study_import::{self, Snapshot};
    let id = user(&pool, "old-import").await;
    let old = command("unused", 1);
    sqlx::query("INSERT INTO progress_reset(user_id,reset_at,day_key) VALUES($1,to_timestamp($2::DOUBLE PRECISION/1000),'2026-10-31')")
        .bind(id).bind(old.client_at+1).execute(&pool).await.unwrap();
    let snapshot = Snapshot {
        operation_id: "old-snapshot".into(),
        client_at: old.client_at + 2,
        cards: std::collections::HashMap::from([("1".into(), old.card)]),
        events: vec![],
        meta: None,
    };
    study_import::import(&pool, id, &snapshot).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cards WHERE user_id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn calendar_migration_preserves_progress_and_minute_steps(pool: PgPool) {
    let id = user(&pool, "calendar").await;
    let now = command("unused", 1).client_at;
    sqlx::query("INSERT INTO cards(user_id,word_idx,learned,state,due,quiz,reps,lapses,updated_at) VALUES($1,1,true,'review',$2,0,7,2,to_timestamp($3::DOUBLE PRECISION/1000)),($1,2,true,'learn',$2,1,3,1,to_timestamp($3::DOUBLE PRECISION/1000))")
        .bind(id).bind(now+86400000).bind(now).execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!("../../migrations/003_study_calendar_due.sql"))
        .execute(&pool)
        .await
        .unwrap();
    let rows:Vec<(i32,i64,i32,i32,i64)>=sqlx::query_as("SELECT word_idx,due,reps,lapses,(EXTRACT(EPOCH FROM updated_at)*1000)::BIGINT FROM cards WHERE user_id=$1 ORDER BY word_idx")
        .bind(id).fetch_all(&pool).await.unwrap();
    assert_eq!(rows[0], (1, now + 4 * 3600000, 7, 2, now));
    assert_eq!(rows[1], (2, now + 86400000, 3, 1, now));
}
