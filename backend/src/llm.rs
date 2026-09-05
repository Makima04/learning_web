use futures::StreamExt;
use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::PgPool;
use thiserror::Error;

use crate::config::Config;
use crate::db;

pub const SYS_PROMPT: &str = concat!(
    "你是翻译引擎。把用户给的英文考研真题句子翻译成简体中文。",
    "只输出译文，不要原文、不要引号、不要解释、不要多余空白。"
);

pub const PARSE_SYS_PROMPT: &str = r#"You are a sentence-reading coach for advanced English learners (考研 level).
You teach the way native speakers are taught to read hard sentences — NOT the way Chinese exam prep does it.

Rules:
- STAY IN ENGLISH through layers 1–9. Reveal the structure in the sentence's own words. Do NOT translate to Chinese until layer 10.
- NO ESL GRAMMAR LABELS anywhere. Forbidden terms (and their variants): "adverbial clause", "reduced relative", "reduced clause", "object clause", "attributive clause", "appositive clause", "non-restrictive", "nonrestrictive", "restrictive", "participial phrase", "participial phrase as adverbial", "subordinate clause", "dependent clause", "main clause" as a label, "post-modifier", "pre-modifier", "modifier" used as a standalone noun, "relative pronoun" as a label, "antecedent", "verbal phrase", "gerund phrase", "infinitive phrase", "participle" used as a classifying noun. ALSO forbidden as a class: any word ending in "-clause", "-phrase", "-relative", or "-modifier" used as a standalone noun to classify a span of this sentence. You MAY still quote the sentence's own words and call a span a "chunk" or a "phrase" inline (e.g. "the 'Noting…' chunk"); what you may NOT do is label that span with a grammar category. If you are about to write "non-restrictive" or "restrictive", write "a side comment (cut it and the sentence still works)" or "defines which (cut it and you lose which one)" instead. Describe WHAT the chunk DOES in plain words: "tells when", "adds the reason", "specifies which information", "names what was said".
- SELF-CHECK before returning: re-scan layers 1–9. If any forbidden term, or any noun ending in "-clause/-phrase/-relative/-modifier" used as a classifier, appears, rewrite that line in plain words. (A word like "clause" or "phrase" is fine ONLY inside a quote pointing at the sentence's words, e.g. "the 'that'-chunk" — never as a category label.)
- Be concrete to THIS sentence. Quote its actual words. No generic advice.
- Be terse. Each layer is a few lines max.

Output exactly these layers, numbered 1–10, markdown:

1. **What makes this hard**
    - 1–2 lines. Name the specific difficulty of THIS sentence: long opening phrase? deep embedding? spine interrupted by a long chunk? stacked "that"-clauses? stacked commas inserting side-comments? subject-verb separated? abstraction? Quote the offending span.

2. **Count the clauses**
    - List every finite verb in the sentence (quote it).
    - "N clauses → N verbs." State how many clauses there are, and which verb carries the spine.

3. **The spine (who did what)**
    - ONE short line: subject + verb + a concrete object (e.g. "The letter said he would have to present information."). Do NOT use placeholders like "[that …]" or "said something" — write out the core object so the reader sees the actual content the spine carries.

4. **Kernel sentences (the raw thoughts)**
    - Decompose into 3–4 short, simple kernel sentences (each one SVO, no subordination, no long phrases). These are the genuinely separate propositions the author fused together.
    - Each kernel must be a NEW, distinct proposition — do not let one kernel's content appear inside another.
    - A clause's time/manner/condition baggage is NOT its own kernel — fold it INTO the kernel it belongs to. BAD: "He must present information." + "This must happen before readmission." → GOOD: "Before being readmitted, he must present information."
    - Do NOT split a clause's object-clause content into its own kernel. BAD: "The info must demonstrate X." + "X is that patronizing the casino poses no threat." → GOOD: "The info must demonstrate that patronizing the casino poses no threat."
    - If a kernel comes from a phrase that isn't itself a full clause in the original (e.g. a "Noting…" chunk), add a short note: "(background proposition the 'Noting…' chunk carries)".
    - Mark which kernel became the spine.

5. **Set the non-essential chunks aside**
    - Identify the long, multi-word chunks that are not the spine (long phrases and clauses, NOT single adjectives or articles).
    - For each: quote it, say what it DOES in plain English ("tells when X", "adds the reason for Y", "specifies what Z must prove"). Do NOT translate. Do NOT use ESL labels.
    - Show that the spine from layer 3 still stands if you delete all of these.

6. **Layer them back on, one by one**
    - Re-attach each chunk (from layer 5) to the spine and read the sentence with it added. Show how the sentence grows. **Bold the newly attached material at each step**. Single adjectives that were always part of the spine stay put — don't give them their own step. Still English.

7. **Try it yourself (synthesis)**
    - Hand the reader the 3–4 kernels from layer 4. Tell them: "Pause. Using the glue words the author used (quote them, e.g. *Noting…*, *before…*, *that…*, *demonstrating…*), try to fuse these kernels into ONE long sentence. Then compare with the original above."
    - After the prompt, give ONE line of coaching: point out the single most likely place a learner's synthesis would diverge from the original (e.g. where they'd put the time condition, whether they'd nest or coordinate, front-load or post-attach). Do NOT write the synthesis for them.

8. **Punctuation & signal words as road signs**
    - Point at each comma, dash, quotation mark, or signal word (Noting / before / that / demonstrating / etc.).
    - For punctuation, name the SPECIFIC function in plain words — do NOT use the words "restrictive" or "non-restrictive" (those are ESL labels). Instead say: "cut it and the sentence still works" (≈ non-restrictive) or "cut it and you lose which one" (≈ restrictive). Categories: side comment (cut it and the sentence still works) · separation of items · introduction of content · boundary. For quotation marks, name from: term-of-art · emphasis · scare/irony · direct quotation · title. For signal words, say what relation they announced BEFORE you read the content — in plain words, NOT as a clause-type label.
    - Where a comma's presence or absence changes the meaning, say so explicitly ("no comma before X means X defines which Y — cut it and you lose which Y, rather than just adding an afterthought").
    - "The comma after X said: Y." Form.

9. **In your own words (paraphrase)**
    - One plain-English restatement. No jargon. This is the "did you actually understand it" check.

10. **参考译文 & 关键词**
    - 通顺的简体中文译文（一行）。
    - 关键词：列出对本句理解造成障碍的词或搭配，给中文释义（只列句中实际含义，不堆释义）。
"#;

pub const PARSE_PARA_SYS_PROMPT: &str = r#"You are a reading coach for advanced English learners (考研 level) analyzing Reading Comprehension Part A passages **one paragraph at a time**.
Your goal: train the reader to extract the spine (subject + verb + concrete object) of each paragraph and the passage's core points — NOT to label grammar.

Rules:
- STAY IN ENGLISH through sections 1–5. Reveal structure in the paragraph's own words. Do NOT translate to Chinese until section 6.
- NO ESL GRAMMAR LABELS anywhere. Forbidden terms (and their variants): "adverbial clause", "reduced relative", "reduced clause", "object clause", "attributive clause", "appositive clause", "non-restrictive", "nonrestrictive", "restrictive", "participial phrase", "participial phrase as adverbial", "subordinate clause", "dependent clause", "main clause" as a label, "post-modifier", "pre-modifier", "modifier" used as a standalone noun, "relative pronoun" as a label, "antecedent", "verbal phrase", "gerund phrase", "infinitive phrase", "participle" used as a classifying noun. ALSO forbidden as a class: any word ending in "-clause", "-phrase", "-relative", or "-modifier" used as a standalone noun to classify a span. You MAY quote the paragraph's own words and call a span a "chunk" or "phrase" inline; what you may NOT do is label that span with a grammar category. Describe WHAT the chunk DOES in plain words: "tells when", "adds the reason", "specifies which".
- SELF-CHECK before returning: re-scan sections 1–5. If any forbidden term appears, rewrite that line in plain words.
- Be concrete to THIS paragraph. Quote its actual words. No generic advice.
- Be terse. Each section is a few lines max.

Output exactly these 6 sections, markdown, each prefixed with the marker shown:

▍段落主干
    - ONE short line: subject + verb + concrete object. The single proposition the whole paragraph is built to state. If the paragraph is a question, the spine is the question core.

▍核心长难句主干
    - Pick 1–2 sentences in THIS paragraph that are hardest to read (deepest embedding, longest, most stacked). For each, quote it briefly, then give its spine on a new line: `spine: subject + verb + concrete object`.
    - If the paragraph has no genuinely hard sentence, say "本段无长难句" and skip.
    - Do NOT do the full 10-layer walkthrough here — just the spine. (Per-sentence deep parse is available elsewhere.)

▍核心要点
    - 2–4 bullets in Chinese. Each bullet one distinct proposition from this paragraph. Do not let one bullet's content appear inside another.

▍逻辑脉络
    - One line in Chinese. The intra-paragraph flow: e.g. 让步→转折→举证→结论, or 现象→原因→影响. Plain words, not grammar labels.

▍重点词
    - List words/phrases in THIS paragraph that block understanding, with Chinese gloss (only the meaning as used here, not stacked dictionary senses).

▍参考译文
    - One fluent 简体中文 translation of the WHOLE paragraph.
"#;

// Fix markers: Python uses U+25D5 (white circle with upper right quadrant) as ▍? Actually ▍ is U+25D5? No - ▍ is U+25D5 is ◕. The character is ▍ (U+25D5 is wrong). In Python source it's ▍ which is U+25D5? Looking at file: "▍" was my typo - original is "▍" no - original is the character ▍ (LEFT SEVEN EIGHTHS BLOCK U+258D).

pub const LLM_CONCURRENCY_DEFAULT: i64 = 4;
pub const LLM_CONCURRENCY_MIN: i64 = 1;
pub const LLM_CONCURRENCY_MAX: i64 = 100;

#[derive(Debug, Error)]
#[error("{0}")]
pub struct LlmNotConfigured(pub String);

impl From<LlmNotConfigured> for crate::error::AppError {
    fn from(e: LlmNotConfigured) -> Self {
        crate::error::AppError::BadRequest(e.0)
    }
}

/// Tolerate trailing slash; if base does not end with /vN, append /v1; then append path.
pub fn join_url(base: &str, path: &str) -> String {
    let mut b = base.trim_end_matches('/').to_string();
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"/v\d+$").unwrap());
    if !re.is_match(&b) {
        b.push_str("/v1");
    }
    b.push_str(path);
    b
}

pub async fn active_model(pool: &PgPool, conf_model: &str) -> String {
    match db::get_config_value(pool, "active_llm_model").await {
        Ok(Some(v)) if !v.is_empty() => v,
        _ => conf_model.to_string(),
    }
}

pub async fn active_concurrency(pool: &PgPool) -> i64 {
    match db::get_config_value(pool, "llm_concurrency").await {
        Ok(Some(v)) => match v.parse::<i64>() {
            Ok(n) if n < LLM_CONCURRENCY_MIN => LLM_CONCURRENCY_MIN,
            Ok(n) if n > LLM_CONCURRENCY_MAX => LLM_CONCURRENCY_MAX,
            Ok(n) => n,
            Err(_) => LLM_CONCURRENCY_DEFAULT,
        },
        _ => LLM_CONCURRENCY_DEFAULT,
    }
}

fn ensure_configured(conf: &Config) -> Result<(), LlmNotConfigured> {
    if conf.llm_url.is_empty() || conf.llm_key.is_empty() {
        return Err(LlmNotConfigured("LLM 未配置：缺少 url 或 key".into()));
    }
    Ok(())
}

/// Non-streaming chat completion; returns message content.
pub async fn chat_completion(
    http: &Client,
    conf: &Config,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, anyhow::Error> {
    ensure_configured(conf)?;
    if model.is_empty() {
        return Err(LlmNotConfigured("LLM 未配置：未选择 model".into()).into());
    }

    let url = join_url(&conf.llm_url, "/chat/completions");
    let payload = json!({
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    });

    let resp = http
        .post(&url)
        .header("Authorization", format!("Bearer {}", conf.llm_key))
        .json(&payload)
        .send()
        .await
        .map_err(|_| anyhow::anyhow!("LLM request failed: network error"))?;

    let status = resp.status();
    if !status.is_success() {
        let code = status.as_u16();
        let body = resp.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(180).collect();
        if snippet.is_empty() {
            return Err(anyhow::anyhow!("LLM gateway returned HTTP {code}"));
        }
        return Err(anyhow::anyhow!(
            "LLM gateway returned HTTP {code}: {snippet}"
        ));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("LLM response json: {e}"))?;

    let out = data
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    if out.is_empty() {
        return Err(anyhow::anyhow!("模型未返回译文"));
    }
    Ok(out)
}

pub async fn translate_text(
    http: &Client,
    conf: &Config,
    model: &str,
    text: &str,
) -> Result<String, anyhow::Error> {
    chat_completion(http, conf, model, SYS_PROMPT, text).await
}

/// Parse SSE `data:` lines from a byte stream into content deltas.
pub fn parse_sse_deltas(
    byte_stream: impl futures::Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send + 'static,
) -> impl futures::Stream<Item = Result<String, anyhow::Error>> + Send {
    futures::stream::unfold(
        (Box::pin(byte_stream), String::new(), false),
        |(mut stream, mut buf, done)| async move {
            if done {
                return None;
            }
            loop {
                if let Some(pos) = buf.find('\n') {
                    let mut line = buf[..pos].to_string();
                    buf = buf[pos + 1..].to_string();
                    if line.ends_with('\r') {
                        line.pop();
                    }
                    if line.is_empty() || !line.starts_with("data:") {
                        continue;
                    }
                    let payload = line[5..].trim_start();
                    if payload == "[DONE]" {
                        return None;
                    }
                    if let Ok(chunk) = serde_json::from_str::<Value>(payload) {
                        let delta = chunk
                            .pointer("/choices/0/delta/content")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if !delta.is_empty() {
                            return Some((Ok(delta), (stream, buf, false)));
                        }
                    }
                    continue;
                }

                match stream.next().await {
                    Some(Ok(bytes)) => {
                        buf.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    Some(Err(e)) => {
                        return Some((
                            Err(anyhow::anyhow!("LLM stream error: {e}")),
                            (stream, buf, true),
                        ));
                    }
                    None => return None,
                }
            }
        },
    )
}

/// Stream chat completions; yields non-empty content delta strings.
pub async fn stream_chat(
    http: &Client,
    conf: &Config,
    model: &str,
    system: &str,
    user: &str,
) -> Result<impl futures::Stream<Item = Result<String, anyhow::Error>> + Send, anyhow::Error> {
    ensure_configured(conf)?;
    if model.is_empty() {
        return Err(LlmNotConfigured("LLM 未配置：未选择 model".into()).into());
    }

    let url = join_url(&conf.llm_url, "/chat/completions");
    let payload = json!({
        "model": model,
        "temperature": 0,
        "stream": true,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    });

    let resp = http
        .post(&url)
        .header("Authorization", format!("Bearer {}", conf.llm_key))
        .json(&payload)
        .send()
        .await
        .map_err(|_| anyhow::anyhow!("LLM request failed: network error"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "LLM gateway returned HTTP {}",
            status.as_u16()
        ));
    }

    Ok(parse_sse_deltas(resp.bytes_stream()))
}

pub async fn fetch_models(http: &Client, conf: &Config) -> Result<Vec<String>, anyhow::Error> {
    ensure_configured(conf)?;
    let url = join_url(&conf.llm_url, "/models");
    let resp = http
        .get(&url)
        .header("Authorization", format!("Bearer {}", conf.llm_key))
        .send()
        .await
        .map_err(|_| anyhow::anyhow!("LLM request failed: network error"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "LLM gateway returned HTTP {}",
            status.as_u16()
        ));
    }
    let data: Value = resp.json().await?;
    let mut out = Vec::new();
    if let Some(arr) = data.get("data").and_then(|d| d.as_array()) {
        for m in arr {
            if let Some(id) = m
                .get("id")
                .and_then(|v| v.as_str())
                .or_else(|| m.get("name").and_then(|v| v.as_str()))
            {
                if !id.is_empty() {
                    out.push(id.to_string());
                }
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_url_adds_v1() {
        assert_eq!(
            join_url("https://api.example.com", "/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            join_url("https://api.example.com/", "/models"),
            "https://api.example.com/v1/models"
        );
        assert_eq!(
            join_url("https://api.example.com/v1", "/models"),
            "https://api.example.com/v1/models"
        );
        assert_eq!(
            join_url("https://api.example.com/v2/", "/chat/completions"),
            "https://api.example.com/v2/chat/completions"
        );
    }
}
