//! 题库是输入边界，模型结果是未可信数据；任务、租约与共享缓存全部保存在服务端。
use crate::{
    config::Config,
    error::{AppError, AppResult},
    llm,
    state::AppState,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{path::Path, time::Duration};

const SOLVE: &str = include_str!("../../prompts/math_solution.v1.system.txt");
const TEACH: &str = include_str!("../../prompts/math_explanation.v1.system.txt");
const SCHEMA: &str = include_str!("../../prompts/math_explanation.v1.schema.json");
const SEED: &str = include_str!("../../data/math_explanation_seed.json");
const QUEUE_LOCK: i64 = 7_291_422_061;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Block {
    Text { text: String },
    Math { tex: String },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Breakthrough {
    pub id: String,
    pub clue: String,
    pub r#move: String,
    pub why: String,
    pub step_ids: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub id: String,
    pub title: String,
    pub brief: String,
    pub details: Vec<Block>,
    pub pitfalls: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Check {
    pub target: String,
    pub evidence: Vec<Block>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Transfer {
    pub signal: String,
    pub r#move: String,
    pub conditions: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Explanation {
    pub schema_version: String,
    pub status: String,
    pub problem_readback: Vec<Block>,
    pub missing_information: Vec<String>,
    pub review_notes: Vec<String>,
    pub breakthroughs: Vec<Breakthrough>,
    pub steps: Vec<Step>,
    pub final_answer: Vec<Block>,
    pub checks: Vec<Check>,
    pub transfer: Option<Transfer>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceCheck {
    original_condition: String,
    substitution: String,
    result: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Solution {
    status: String,
    problem_readback: String,
    derivation: Vec<String>,
    final_answer_tex: String,
    source_checks: Vec<SourceCheck>,
    issues: Vec<String>,
}

fn text(s: &str, max: usize) -> bool {
    !s.trim().is_empty() && s.chars().count() <= max
}
fn strings(v: &[String], max: usize, count: usize) -> bool {
    v.len() <= count && v.iter().all(|s| text(s, max))
}
fn blocks(v: &[Block], min: usize) -> bool {
    v.len() >= min
        && v.len() <= 32
        && v.iter().all(|b| match b {
            Block::Text { text: s } => text(s, 4000),
            Block::Math { tex: s } => text(s, 4000),
        })
}
impl Explanation {
    pub fn validate(&self) -> bool {
        if self.schema_version != "math_explanation.v1"
            || !blocks(&self.problem_readback, 1)
            || !strings(&self.missing_information, 800, 8)
            || !strings(&self.review_notes, 800, 8)
        {
            return false;
        }
        if self.status != "draft" {
            return matches!(self.status.as_str(), "needs_input" | "needs_review")
                && self.steps.is_empty()
                && self.breakthroughs.is_empty()
                && self.final_answer.is_empty()
                && self.checks.is_empty()
                && self.transfer.is_none()
                && if self.status == "needs_input" {
                    !self.missing_information.is_empty() && self.review_notes.is_empty()
                } else {
                    !self.review_notes.is_empty() && self.missing_information.is_empty()
                };
        }
        if !self.missing_information.is_empty()
            || !self.review_notes.is_empty()
            || !(1..=3).contains(&self.breakthroughs.len())
            || !(1..=16).contains(&self.steps.len())
            || !blocks(&self.final_answer, 1)
            || !(1..=3).contains(&self.checks.len())
        {
            return false;
        }
        self.steps.iter().enumerate().all(|(i, s)| {
            s.id == format!("s{}", i + 1)
                && text(&s.title, 100)
                && text(&s.brief, 300)
                && blocks(&s.details, 1)
                && strings(&s.pitfalls, 500, 3)
        }) && self.breakthroughs.iter().enumerate().all(|(i, b)| {
            b.id == format!("b{}", i + 1)
                && text(&b.clue, 200)
                && text(&b.r#move, 200)
                && text(&b.why, 400)
                && !b.step_ids.is_empty()
                && b.step_ids.len() <= 16
                && b.step_ids
                    .iter()
                    .all(|id| self.steps.iter().any(|s| &s.id == id))
        }) && self
            .checks
            .iter()
            .all(|c| text(&c.target, 100) && blocks(&c.evidence, 1))
            && self.transfer.as_ref().is_some_and(|t| {
                text(&t.signal, 300) && text(&t.r#move, 300) && text(&t.conditions, 500)
            })
    }
}
impl Solution {
    fn valid(&self) -> bool {
        text(&self.problem_readback, 16000)
            && strings(&self.derivation, 6000, 32)
            && strings(&self.issues, 800, 8)
            && self.source_checks.len() <= 12
            && self.source_checks.iter().all(|c| {
                text(&c.original_condition, 2000)
                    && text(&c.substitution, 6000)
                    && text(&c.result, 1000)
            })
            && match self.status.as_str() {
                "solved" => {
                    !self.derivation.is_empty()
                        && text(&self.final_answer_tex, 8000)
                        && !self.source_checks.is_empty()
                        && self.issues.is_empty()
                }
                "needs_input" | "needs_review" => {
                    self.final_answer_tex.is_empty() && !self.issues.is_empty()
                }
                _ => false,
            }
    }
}
fn digest(data: &[u8]) -> String {
    hex::encode(openssl::sha::sha256(data))
}
fn prompt_version() -> String {
    digest(format!("{SOLVE}{TEACH}{SCHEMA}{SEED}").as_bytes())
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
}

pub struct Question {
    pub item: Value,
    pub image: Vec<u8>,
    pub image_hash: String,
    pub source_hash: String,
    pub mime: &'static str,
}
/// 仅允许库中已有题目和静态目录内的题图；不接收浏览器传来的 URL、文件路径、题干或模型名。
pub async fn question(root: &Path, id: &str) -> AppResult<Question> {
    if !valid_id(id) {
        return Err(AppError::BadRequest("题目编号无效".into()));
    }
    let mut found = None;
    for source in ["lilin880", "zhangyu1000"] {
        let raw = tokio::fs::read(root.join(format!("math/{source}/index.json")))
            .await
            .map_err(|_| AppError::NotFound("题库目录不可用".into()))?;
        let index: Value = serde_json::from_slice(&raw)
            .map_err(|_| AppError::BadRequest("题库目录格式错误".into()))?;
        if let Some(item) = index
            .get("items")
            .and_then(Value::as_array)
            .and_then(|items| {
                items
                    .iter()
                    .find(|q| q.get("id").and_then(Value::as_str) == Some(id))
            })
        {
            found = Some(item.clone());
            break;
        }
    }
    let mut item = found.ok_or_else(|| AppError::NotFound("未找到这道数学题".into()))?;
    let img = item
        .get("img")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::BadRequest("题目缺少题图".into()))?;
    let (image, mime) = read_image(root, img).await?;
    let image_hash = digest(&image);
    // OCR 不是权威题面，也不通过 API 暴露给生成器。原书答案仅供页面对照，不喂给解题阶段。
    if let Some(o) = item.as_object_mut() {
        o.remove("stem");
        o.remove("options");
    }
    let source_hash = digest(
        format!(
            "{}:{image_hash}",
            serde_json::to_string(&item).unwrap_or_default()
        )
        .as_bytes(),
    );
    Ok(Question {
        item,
        image,
        image_hash,
        source_hash,
        mime,
    })
}
async fn read_image(root: &Path, img: &str) -> AppResult<(Vec<u8>, &'static str)> {
    if !img.starts_with("/math/img/") || img.contains("..") || img.contains('\\') {
        return Err(AppError::BadRequest("题图路径无效".into()));
    }
    let dir = tokio::fs::canonicalize(root.join("math/img"))
        .await
        .map_err(|_| AppError::NotFound("题图目录不存在".into()))?;
    let path = tokio::fs::canonicalize(root.join(img.trim_start_matches('/')))
        .await
        .map_err(|_| AppError::NotFound("题图不存在".into()))?;
    if !path.starts_with(&dir) {
        return Err(AppError::BadRequest("题图不在目录内".into()));
    }
    let mime = match path.extension().and_then(|s| s.to_str()) {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => return Err(AppError::BadRequest("题图格式不支持".into())),
    };
    if tokio::fs::metadata(&path)
        .await
        .map_err(|_| AppError::NotFound("题图不存在".into()))?
        .len()
        > 4_000_000
    {
        return Err(AppError::BadRequest("题图过大".into()));
    }
    let image = tokio::fs::read(path)
        .await
        .map_err(|_| AppError::NotFound("题图读取失败".into()))?;
    Ok((image, mime))
}
fn cache_key(q: &Question, model: &str, conf: &Config) -> String {
    digest(
        format!(
            "{}:{}:{model}:{}",
            q.source_hash,
            prompt_version(),
            conf.llm_url
        )
        .as_bytes(),
    )
}

pub async fn get(state: &AppState, id: &str) -> AppResult<Value> {
    let q = question(&state.config.static_dir, id).await?;
    let conf = state.llm_config().await;
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    let key = cache_key(&q, &model, &conf);
    ensure_seed(&state.pool, &q, &key, &model).await?;
    response(&state.pool, &q, &key, &model, conf.llm_configured()).await
}
pub async fn enqueue(
    state: &AppState,
    id: &str,
    user_id: i64,
    regenerate: bool,
) -> AppResult<Value> {
    let q = question(&state.config.static_dir, id).await?;
    let conf = state.llm_config().await;
    let model = llm::active_model(&state.pool, &state.config.llm_model).await;
    if !conf.llm_configured() || model.is_empty() {
        return Err(AppError::BadRequest("请管理员先配置 LLM".into()));
    }
    let key = cache_key(&q, &model, &conf);
    ensure_seed(&state.pool, &q, &key, &model).await?;
    sqlx::query("INSERT INTO math_explanations(cache_key,item_id,source_hash,prompt_version,model,status,requested_by) VALUES($1,$2,$3,$4,$5,'queued',$6) ON CONFLICT(cache_key) DO UPDATE SET status='queued',phase='queued',message='',attempts=0,updated_at=NOW() WHERE (math_explanations.status IN ('error','needs_input','needs_review') OR ($7 AND math_explanations.status='ready' AND math_explanations.review_status='model_draft')) AND math_explanations.updated_at<NOW()-INTERVAL '15 seconds'")
        .bind(&key).bind(id).bind(&q.source_hash).bind(prompt_version()).bind(&model).bind(user_id).bind(regenerate).execute(&state.pool).await?;
    response(&state.pool, &q, &key, &model, true).await
}
async fn response(
    pool: &PgPool,
    q: &Question,
    key: &str,
    model: &str,
    configured: bool,
) -> AppResult<Value> {
    let row:Option<Value>=sqlx::query_scalar("SELECT jsonb_build_object('status',status,'phase',phase,'explanation',explanation,'model',model,'returned_models',returned_models,'review_status',review_status,'message',message,'updated_at',updated_at,'retry_after_seconds',GREATEST(0,CEIL(EXTRACT(EPOCH FROM updated_at+INTERVAL '15 seconds'-NOW()))::INTEGER)) FROM math_explanations WHERE cache_key=$1")
        .bind(key).fetch_optional(pool).await?;
    let mut out = row.unwrap_or_else(|| json!({"status":"missing","model":model}));
    out["question"] = q.item.clone();
    out["configured"] = json!(configured);
    out["protocol"] = json!("math_explanation.v1");
    Ok(out)
}
/// 仅预置已核对过的例题，且绑定实际题图哈希与生成模型；其他题走同一配置模型的实时任务。
async fn ensure_seed(pool: &PgPool, q: &Question, key: &str, model: &str) -> AppResult<()> {
    let seed: Value = serde_json::from_str(SEED).map_err(|e| AppError::Internal(e.into()))?;
    if seed["item_id"] != q.item["id"]
        || seed["model"].as_str() != Some(model)
        || !seed["image_hashes"]
            .as_array()
            .is_some_and(|hashes| hashes.iter().any(|h| h.as_str() == Some(&q.image_hash)))
    {
        return Ok(());
    }
    let parsed: Explanation = serde_json::from_value(seed["explanation"].clone())
        .map_err(|e| AppError::Internal(e.into()))?;
    if !parsed.validate() {
        return Err(AppError::Internal(anyhow::anyhow!(
            "invalid reviewed explanation"
        )));
    }
    sqlx::query("INSERT INTO math_explanations(cache_key,item_id,source_hash,prompt_version,model,status,phase,explanation,review_status,returned_models,message) VALUES($1,$2,$3,$4,$5,'ready','complete',$6,'reviewed',$7,'原方程与初值已核对，教学说明已校对') ON CONFLICT(cache_key) DO NOTHING")
        .bind(key).bind(q.item["id"].as_str().unwrap_or_default()).bind(&q.source_hash).bind(prompt_version()).bind(model).bind(serde_json::to_value(parsed).unwrap()).bind(&seed["returned_models"]).execute(pool).await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct Job {
    cache_key: String,
    item_id: String,
    source_hash: String,
    model: String,
    attempt_id: String,
}
/// 全局调度锁只包住认领；网络调用在事务外。租约心跳使进程重启后可恢复，又不覆盖新尝试。
async fn claim(pool: &PgPool, limit: i64) -> AppResult<Option<Job>> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(QUEUE_LOCK)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE math_explanations SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'error' END,phase='queued',message='生成中断，可重试',attempt_id=NULL,lease_until=NULL WHERE status='processing' AND lease_until<NOW()")
        .execute(&mut *tx).await?;
    let active: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM math_explanations WHERE status='processing'")
            .fetch_one(&mut *tx)
            .await?;
    if active >= limit {
        tx.commit().await?;
        return Ok(None);
    }
    let token = hex::encode(rand::random::<[u8; 16]>());
    let job=sqlx::query_as::<_,Job>("UPDATE math_explanations SET status='processing',phase='solving',attempt_id=$1,attempts=attempts+1,lease_until=NOW()+INTERVAL '60 seconds',updated_at=NOW() WHERE cache_key=(SELECT cache_key FROM math_explanations WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING cache_key,item_id,source_hash,model,attempt_id")
        .bind(token).fetch_optional(&mut *tx).await?;
    tx.commit().await?;
    Ok(job)
}
pub fn start_worker(state: AppState) {
    tokio::spawn(async move {
        loop {
            if state
                .config
                .update_maintenance_file
                .as_ref()
                .is_some_and(|path| path.try_exists().unwrap_or(true))
            {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
            let limit = llm::active_concurrency(&state.pool).await;
            match claim(&state.pool, limit).await {
                Ok(Some(job)) => {
                    let s = state.clone();
                    tokio::spawn(async move {
                        run_leased(s, job).await;
                    });
                    continue;
                }
                Err(_) => tracing::warn!("math explanation scheduler temporarily unavailable"),
                _ => {}
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}
async fn phase(state: &AppState, job: &Job, name: &str) -> AppResult<()> {
    sqlx::query("UPDATE math_explanations SET phase=$3,updated_at=NOW() WHERE cache_key=$1 AND attempt_id=$2 AND status='processing'")
        .bind(&job.cache_key).bind(&job.attempt_id).bind(name).execute(&state.pool).await?;
    Ok(())
}
async fn run_leased(state: AppState, job: Job) {
    let work = generate(&state, &job);
    tokio::pin!(work);
    loop {
        tokio::select! {
            result=&mut work=>{
                let (status,data,message,models,solution)=match result {
                    Ok((data,models,solution))=>if data.status=="draft" {("ready",Some(data),String::new(),models,Some(solution))}
                        else {let status=if data.status=="needs_input"{"needs_input"}else{"needs_review"};let msg=data.missing_information.iter().chain(data.review_notes.iter()).cloned().collect::<Vec<_>>().join("；");(status,None,msg,models,Some(solution))},
                    Err(_)=>{tracing::warn!(item_id=%job.item_id,"math explanation generation failed validation or request");("error",None,"生成未完成，当前模型可能未能读取题图或返回合格解析；请稍后重试或检查模型配置。".into(),json!([]),None)}
                };
                let _=sqlx::query("UPDATE math_explanations SET status=$3,phase='complete',explanation=$4,message=$5,returned_models=$6,solution=$7,lease_until=NULL,attempt_id=NULL,updated_at=NOW() WHERE cache_key=$1 AND attempt_id=$2 AND status='processing'")
                    .bind(&job.cache_key).bind(&job.attempt_id).bind(status).bind(data.map(|d|serde_json::to_value(d).unwrap())).bind(message).bind(models).bind(solution).execute(&state.pool).await;
                return;
            },
            _=tokio::time::sleep(Duration::from_secs(15))=>{
                let updated=sqlx::query("UPDATE math_explanations SET lease_until=NOW()+INTERVAL '60 seconds' WHERE cache_key=$1 AND attempt_id=$2 AND status='processing'")
                    .bind(&job.cache_key).bind(&job.attempt_id).execute(&state.pool).await;
                if updated.is_ok_and(|r|r.rows_affected()==0){return;}
            }
        }
    }
}
fn unresolved(status: String, readback: String, issues: Vec<String>) -> Explanation {
    let input = status == "needs_input";
    Explanation {
        schema_version: "math_explanation.v1".into(),
        status: if input {
            "needs_input".into()
        } else {
            "needs_review".into()
        },
        problem_readback: vec![Block::Text { text: readback }],
        missing_information: if input { issues.clone() } else { vec![] },
        review_notes: if input { vec![] } else { issues },
        breakthroughs: vec![],
        steps: vec![],
        final_answer: vec![],
        checks: vec![],
        transfer: None,
    }
}
async fn generate(state: &AppState, job: &Job) -> AppResult<(Explanation, Value, Value)> {
    let q = question(&state.config.static_dir, &job.item_id).await?;
    let conf = state.llm_config().await;
    let current = llm::active_model(&state.pool, &state.config.llm_model).await;
    if q.source_hash != job.source_hash
        || current != job.model
        || cache_key(&q, &current, &conf) != job.cache_key
    {
        return Err(AppError::BadRequest("题目或模型配置已更新".into()));
    }
    let input = json!({"task":"请以附图为原题完成解答与原条件核对，只输出指定 JSON；不要使用不可靠的 OCR 文本。","problem":{"item_id":job.item_id,"kind":q.item["kind"],"stem_text":"原题见附图，请完整读取全部分问和数学符号。"}});
    let image = base64::engine::general_purpose::STANDARD.encode(&q.image);
    let (raw,first_model)=llm::chat_reply(&state.http,&conf,&job.model,SOLVE,json!([
        {"type":"text","text":input.to_string()},{"type":"image_url","image_url":{"url":format!("data:{};base64,{image}",q.mime)}}
    ])).await.map_err(AppError::Internal)?;
    let solved: Solution = serde_json::from_str(&raw).map_err(|e| AppError::Internal(e.into()))?;
    if !solved.valid() {
        return Err(AppError::BadRequest("解题稿格式不合格".into()));
    }
    let solution: Value = serde_json::from_str(&raw).unwrap();
    if solved.status != "solved" {
        return Ok((
            unresolved(solved.status, solved.problem_readback, solved.issues),
            json!([first_model]),
            solution,
        ));
    }
    // 教学阶段同时保留原图，防止把第一阶段读错的题目反过来当成原题。
    phase(state, job, "formatting").await?;
    let teaching = json!({"task":"依据原题和先行解题稿组织分层教学解析。校对后输出符合 schema 的 JSON。","problem":{"item_id":job.item_id,"stem_text":solved.problem_readback},"source_solution":solution,"output_schema":serde_json::from_str::<Value>(SCHEMA).unwrap()});
    let (raw,second_model)=llm::chat_reply(&state.http,&conf,&job.model,TEACH,json!([
        {"type":"text","text":teaching.to_string()},{"type":"image_url","image_url":{"url":format!("data:{};base64,{image}",q.mime)}}
    ])).await.map_err(AppError::Internal)?;
    let explanation: Explanation =
        serde_json::from_str(&raw).map_err(|e| AppError::Internal(e.into()))?;
    if !explanation.validate() {
        return Err(AppError::BadRequest("教学解析结构不合格".into()));
    }
    Ok((explanation, json!([first_model, second_model]), solution))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    #[test]
    fn reviewed_seed_is_valid_and_rejects_missing_or_dangling_fields() {
        let seed: Value = serde_json::from_str(SEED).unwrap();
        let mut data: Explanation = serde_json::from_value(seed["explanation"].clone()).unwrap();
        assert!(data.validate());
        data.breakthroughs[0].step_ids = vec!["s99".into()];
        assert!(!data.validate());
        let mut v = seed["explanation"].clone();
        v["unexpected"] = json!(true);
        assert!(serde_json::from_value::<Explanation>(v).is_err());
    }
    #[test]
    fn unresolved_never_publishes_an_answer() {
        let mut e = unresolved(
            "needs_input".into(),
            "读不清指数".into(),
            vec!["请补充指数".into()],
        );
        assert!(e.validate());
        e.final_answer = vec![Block::Math { tex: "42".into() }];
        assert!(!e.validate());
        assert!(!valid_id("../config"));
        assert!(!valid_id("http://test"));
        assert!(valid_id("ll-hard-9-big-1"));
    }
    fn state(pool: PgPool, root: PathBuf) -> AppState {
        let config = Config::from_env();
        let mut config = config;
        config.static_dir = root;
        config.llm_model = "deepseek-flash".into();
        AppState::new(
            pool,
            config,
            crate::state::LlmRuntime {
                url: "http://test.invalid/v1".into(),
                key: "test".into(),
            },
        )
    }
    #[sqlx::test(migrations = "./migrations")]
    async fn catalog_input_is_authoritative_and_jobs_are_deduplicated(pool: PgPool) {
        let root = std::env::temp_dir().join(format!(
            "math-explanation-test-{}",
            hex::encode(rand::random::<[u8; 8]>())
        ));
        std::fs::create_dir_all(root.join("math/img/test")).unwrap();
        std::fs::create_dir_all(root.join("math/lilin880")).unwrap();
        std::fs::create_dir_all(root.join("math/zhangyu1000")).unwrap();
        std::fs::write(root.join("math/img/test/q.jpg"), b"fixture").unwrap();
        std::fs::write(root.join("math/lilin880/index.json"),json!({"items":[{"id":"ll-test","source":"lilin880","img":"/math/img/test/q.jpg","stem":"untrusted OCR"}]}).to_string()).unwrap();
        std::fs::write(root.join("math/zhangyu1000/index.json"), "{\"items\":[]}").unwrap();
        let user: i64 = sqlx::query_scalar(
            "INSERT INTO users(username,pw_hash,salt) VALUES('math-test','x','x') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let state = state(pool.clone(), root.clone());
        assert!(question(&root, "missing").await.is_err());
        assert!(read_image(&root, "/math/img/../../ew_llm.json")
            .await
            .is_err());
        #[cfg(unix)]
        {
            std::fs::write(root.join("outside.txt"), b"not a question image").unwrap();
            std::os::unix::fs::symlink(
                root.join("outside.txt"),
                root.join("math/img/test/escape.jpg"),
            )
            .unwrap();
            assert!(read_image(&root, "/math/img/test/escape.jpg")
                .await
                .is_err());
        }
        let q = question(&root, "ll-test").await.unwrap();
        assert!(q.item.get("stem").is_none());
        let (a, b) = tokio::join!(
            enqueue(&state, "ll-test", user, false),
            enqueue(&state, "ll-test", user, false)
        );
        assert_eq!(a.unwrap()["status"], "queued");
        assert_eq!(b.unwrap()["status"], "queued");
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM math_explanations")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
        assert!(claim(&pool, 1).await.unwrap().is_some());
        assert!(claim(&pool, 1).await.unwrap().is_none());
        sqlx::query("UPDATE math_explanations SET lease_until=NOW()-INTERVAL '1 second'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(claim(&pool, 1).await.unwrap().is_some());
        sqlx::query("UPDATE math_explanations SET status='ready',review_status='reviewed',updated_at=NOW()-INTERVAL '1 minute'").execute(&pool).await.unwrap();
        assert_eq!(
            enqueue(&state, "ll-test", user, true).await.unwrap()["status"],
            "ready"
        );
        sqlx::query("UPDATE math_explanations SET review_status='model_draft'")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            enqueue(&state, "ll-test", user, false).await.unwrap()["status"],
            "ready"
        );
        assert_eq!(
            enqueue(&state, "ll-test", user, true).await.unwrap()["status"],
            "queued"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn generation_uses_configured_model_and_images_without_promoting_model_checks(
        pool: PgPool,
    ) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let root = std::env::temp_dir().join(format!(
            "math-network-test-{}",
            hex::encode(rand::random::<[u8; 8]>())
        ));
        std::fs::create_dir_all(root.join("math/img/test")).unwrap();
        std::fs::create_dir_all(root.join("math/lilin880")).unwrap();
        std::fs::write(root.join("math/img/test/q.jpg"), b"image-fixture").unwrap();
        std::fs::write(root.join("math/lilin880/index.json"),json!({"items":[{"id":"ll-network-test","source":"lilin880","kind":"big","img":"/math/img/test/q.jpg"}]}).to_string()).unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let seed: Value = serde_json::from_str(SEED).unwrap();
        let outputs=[json!({"status":"solved","problem_readback":"题图中的题目","derivation":["可核对的推导"],"final_answer_tex":"1","source_checks":[{"original_condition":"原条件","substitution":"具体代入","result":"成立"}],"issues":[]}).to_string(),seed["explanation"].to_string()];
        let server = tokio::spawn(async move {
            for output in outputs {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut data = Vec::new();
                let mut chunk = [0; 8192];
                let end = loop {
                    let n = stream.read(&mut chunk).await.unwrap();
                    assert!(n > 0);
                    data.extend_from_slice(&chunk[..n]);
                    if let Some(i) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                        break i + 4;
                    }
                };
                let headers = String::from_utf8_lossy(&data[..end]).to_lowercase();
                let length: usize = headers
                    .lines()
                    .find_map(|s| s.strip_prefix("content-length:"))
                    .unwrap()
                    .trim()
                    .parse()
                    .unwrap();
                while data.len() < end + length {
                    let n = stream.read(&mut chunk).await.unwrap();
                    assert!(n > 0);
                    data.extend_from_slice(&chunk[..n]);
                }
                let request: Value = serde_json::from_slice(&data[end..end + length]).unwrap();
                assert_eq!(request["model"], "deepseek-flash");
                assert!(headers.contains("authorization: bearer only-auth-header-test-secret"));
                assert!(!request["messages"]
                    .to_string()
                    .contains("only-auth-header-test-secret"));
                assert!(request["messages"][1]["content"][1]["image_url"]["url"]
                    .as_str()
                    .unwrap()
                    .starts_with("data:image/jpeg;base64,"));
                let body=json!({"model":"returned-test-model","choices":[{"message":{"content":output}}]}).to_string();
                stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).as_bytes()).await.unwrap();
            }
        });
        let user: i64 = sqlx::query_scalar(
            "INSERT INTO users(username,pw_hash,salt) VALUES('network-test','x','x') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let state = state(pool.clone(), root.clone());
        state
            .set_llm_runtime(Some(url), Some("only-auth-header-test-secret".into()))
            .await;
        enqueue(&state, "ll-network-test", user, false)
            .await
            .unwrap();
        let job = claim(&pool, 1).await.unwrap().unwrap();
        run_leased(state.clone(), job).await;
        server.await.unwrap();
        let result = get(&state, "ll-network-test").await.unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["review_status"], "model_draft");
        assert_eq!(
            result["returned_models"],
            json!(["returned-test-model", "returned-test-model"])
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
