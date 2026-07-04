"""llm.py — OpenAI 兼容网关调用（stdlib urllib only，与 scripts/llm_translate.py 一致）。

读项目根 ew_llm.json 得 {url,key,model}。translate_text 用的 model 取 config 表
active_llm_model（若已写）覆盖 ew_llm.json 的 model。
"""
import json
import os
import re
import urllib.request
import urllib.error
from pathlib import Path

from .db import CONF_PATH, get_db, get_config_value

# 与 web/llm.js / scripts/llm_translate.py 一致的系统 prompt
SYS_PROMPT = (
    "你是翻译引擎。把用户给的英文考研真题句子翻译成简体中文。"
    "只输出译文，不要原文、不要引号、不要解释、不要多余空白。"
)

# 长难句解析 prompt（母语式 10 层走查）。与 scripts/sentence_parse.py 的 SYS_PROMPT
# 保持一致——CLAUDE.md 点名"server/llm.py 与 scripts/llm_translate.py 两处一致"，
# 解析 prompt 是第三处同源约束，改一处要同步另一处。
PARSE_SYS_PROMPT = """You are a sentence-reading coach for advanced English learners (考研 level).
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
"""


PARSE_PARA_SYS_PROMPT = """You are a reading coach for advanced English learners (考研 level) analyzing Reading Comprehension Part A passages **one paragraph at a time**.
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
"""


class LlmNotConfigured(Exception):
    """ew_llm.json 没配 url+key（或没选 model）。"""


def load_conf():
    """读 LLM 配置，返回 {url,key,model}（trim）。

    优先级：环境变量 EW_LLM_URL/EW_LLM_KEY/EW_LLM_MODEL > ew_llm.json。
    两者都缺 → 全空串（翻译功能不可用，背词照常）。
    """
    c = {"url": "", "key": "", "model": ""}
    # 1) 环境变量（Docker 场景）
    for k, env in (("url", "EW_LLM_URL"), ("key", "EW_LLM_KEY"), ("model", "EW_LLM_MODEL")):
        v = os.environ.get(env)
        if v and v.strip():
            c[k] = v.strip()
    # 2) ew_llm.json 补齐未设字段（本地开发场景）
    try:
        if CONF_PATH.exists():
            raw = json.load(open(CONF_PATH))
            for k in ("url", "key", "model"):
                if not c[k]:
                    c[k] = (raw.get(k) or "").strip()
    except Exception:
        pass
    return c


def join_url(base, path):
    """与 llm.js / llm_translate.py 一致：容忍尾斜杠，无 /vN 时补 /v1。"""
    b = (base or "").rstrip("/")
    if not re.search(r"/v\d+$", b):
        b += "/v1"
    return b + path


def http_json(url, headers, payload=None, method="GET"):
    """urllib 版 fetch JSON。成功返 (status, data)，失败抛 RuntimeError 带 message。"""
    data = None
    hdrs = dict(headers)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        msg = body
        try:
            j = json.loads(body)
            err = j.get("error")
            if isinstance(err, dict):
                msg = err.get("message") or body
            elif err is not None:
                msg = str(err)
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code}: {str(msg)[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")


def _active_model(conf_model):
    """config 表 active_llm_model 覆盖 ew_llm.json model；空则用 conf_model。"""
    try:
        conn = get_db()
        try:
            v = get_config_value(conn, "active_llm_model")
            return v if v else (conf_model or "")
        finally:
            conn.close()
    except Exception:
        return conf_model or ""


def active_model():
    """当前生效的 LLM model：config.active_llm_model 优先，否则 fallback ew_llm.json 的 model。

    公开别名包装私有 _active_model，供 app.py 的 GET /api/llm/config 等处复用，
    保证 UI 展示的 model 与 translate_text 实际使用的 model 一致。
    """
    c = load_conf()
    return _active_model(c.get("model", ""))


# 并发默认值与上下限。批量翻译用 ThreadPoolExecutor 时 max_workers 取此值。
# MAX 抬到 100：默认 16 在 LLM 网关延迟下吞吐偏低，单次批量翻译（~2000 句）
# 耗时太久；网关在内网，百并发实测可承受，故放开到 100。
LLM_CONCURRENCY_DEFAULT = 4
LLM_CONCURRENCY_MIN = 1
LLM_CONCURRENCY_MAX = 100


def _active_concurrency():
    """config 表 llm_concurrency 覆盖默认；空/坏/越界 → 默认值。"""
    try:
        conn = get_db()
        try:
            v = get_config_value(conn, "llm_concurrency")
            if v is None:
                return LLM_CONCURRENCY_DEFAULT
            n = int(v)
            if n < LLM_CONCURRENCY_MIN:
                return LLM_CONCURRENCY_MIN
            if n > LLM_CONCURRENCY_MAX:
                return LLM_CONCURRENCY_MAX
            return n
        finally:
            conn.close()
    except Exception:
        return LLM_CONCURRENCY_DEFAULT


def active_concurrency():
    """当前生效的 LLM 并发数（config.llm_concurrency 或默认 4，限 1..100）。

    供 app.py 的 GET /api/llm/config 与 translate_batch 复用，
    保证 UI 展示的并发数与批量翻译实际使用的并发数一致。
    """
    return _active_concurrency()


def fetch_models():
    """GET /models → 返回 [model_id,...]。未配 url+key 抛 ValueError。失败抛 RuntimeError。"""
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise ValueError("LLM 未配置：缺少 url 或 key")
    url = join_url(c["url"], "/models")
    _, data = http_json(url, {"Authorization": "Bearer " + c["key"]})
    out = []
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        out = [m.get("id") or m.get("name") for m in data["data"] if isinstance(m, dict)]
    out = [x for x in out if x]
    return sorted(set(out))


def translate_text(text):
    """POST /chat/completions → 译文 str。未配置抛 LlmNotConfigured；调用失败抛 RuntimeError。

    model 取 config.active_llm_model 或 ew_llm.json.model。
    """
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = _active_model(c["model"])
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选择 model")

    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    _, data = http_json(
        url, {"Authorization": "Bearer " + c["key"]}, payload, "POST"
    )
    try:
        out = data["choices"][0]["message"]["content"].strip()
    except Exception:
        out = ""
    if not out:
        raise RuntimeError("模型未返回译文")
    return out


def is_configured():
    """ew_llm.json 有 url+key 即视为已配置（model 可后端选）。"""
    c = load_conf()
    return bool(c["url"] and c["key"])


def parse_sentence_stream(text):
    """流式调 LLM 做长难句解析。生成器：yield 每个 delta 文本片段，结尾 yield {"_done":..., "content":...}。

    与 translate_text 共用 load_conf/join_url/_active_model；不同点：
    - 用 PARSE_SYS_PROMPT（10 层母语式走查）
    - stream=True，逐 chunk 吐
    - timeout=180（解析输出远长于翻译，50–170s 实测）
    未配置抛 LlmNotConfigured；调用失败抛 RuntimeError。
    """
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = _active_model(c["model"])
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选择 model")

    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model,
        "temperature": 0,
        "stream": True,
        "messages": [
            {"role": "system", "content": PARSE_SYS_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + c["key"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    # 流式下 urlopen 的 timeout 是每读一次的超时，180s 足够长输出
    try:
        r = urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        msg = body
        try:
            j = json.loads(body)
            err = j.get("error")
            if isinstance(err, dict):
                msg = err.get("message") or body
            elif err is not None:
                msg = str(err)
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code}: {str(msg)[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")

    full = []
    try:
        with r:
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                if not line or not line.startswith("data:"):
                    continue
                payload_str = line[5:].lstrip()
                if payload_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload_str)
                except Exception:
                    continue
                try:
                    delta = chunk["choices"][0]["delta"].get("content") or ""
                except Exception:
                    delta = ""
                if delta:
                    full.append(delta)
                    yield delta
    finally:
        r.close()
    yield {"_done": True, "content": "".join(full)}


def get_cached_parse(conn, sentence_id):
    """读 parses 表某 sentence_id 的缓存。返 dict {content,status,model} 或 None。"""
    row = conn.execute(
        "SELECT content, status, model FROM parses WHERE sentence_id=?",
        (sentence_id,),
    ).fetchone()
    if row is None:
        return None
    return {"content": row["content"], "status": row["status"], "model": row["model"]}


def save_parse(conn, sentence_id, content, model):
    """落库解析结果（INSERT OR REPLACE）。status 恒 'ok'——解析失败不落库，由端点返 error 事件。"""
    from .db import now_iso
    now = now_iso()
    conn.execute(
        "INSERT INTO parses(sentence_id, content, status, model, parsed_at, updated_at) "
        "VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(sentence_id) DO UPDATE SET content=excluded.content, "
        "status=excluded.status, model=excluded.model, parsed_at=excluded.parsed_at, "
        "updated_at=excluded.updated_at",
        (sentence_id, content, "ok", model, now, now),
    )
    conn.commit()


def parse_paragraph_stream(text, context):
    """流式调 LLM 做段落级解析（Reading Part A 双栏 reader 右栏）。

    与 parse_sentence_stream 共用 load_conf/join_url/_active_model；不同点：
    - 用 PARSE_PARA_SYS_PROMPT（6 段主干驱动型）
    - user message 带整篇正文 + 全部题干作为 context（解指代、判考点），目标段落单独标出
    - stream=True，逐 chunk 吐；timeout=180（段落输出比单句长）
    未配置抛 LlmNotConfigured；调用失败抛 RuntimeError。
    """
    c = load_conf()
    if not (c["url"] and c["key"]):
        raise LlmNotConfigured("LLM 未配置：缺少 url 或 key")
    model = _active_model(c["model"])
    if not model:
        raise LlmNotConfigured("LLM 未配置：未选择 model")

    url = join_url(c["url"], "/chat/completions")
    # 组装 context：整篇正文 + 题干（紧凑），让模型在解指代/判断考点时有全文
    full_body = (context or {}).get("full_body") or ""
    items = (context or {}).get("items") or []
    year = (context or {}).get("year")
    label = (context or {}).get("label")
    q_lines = []
    for it in items:
        stem = (it or {}).get("stem") or ""
        opts = (it or {}).get("options") or {}
        opts_str = " ".join(f"{k}.{v}" for k, v in sorted(opts.items()))
        q_lines.append(f"Q{it.get('n','')}: {stem} {opts_str}".strip())
    header = f"[Passage: {year or '?'} {label or ''}]"
    user_msg = (
        f"{header}\n[Full passage for context]\n{full_body}\n\n"
        f"[Questions]\n" + "\n".join(q_lines) +
        f"\n\n[Analyze ONLY this paragraph — output the 6 sections]\n{text}"
    )
    payload = {
        "model": model,
        "temperature": 0,
        "stream": True,
        "messages": [
            {"role": "system", "content": PARSE_PARA_SYS_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + c["key"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        r = urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        msg = body
        try:
            j = json.loads(body)
            err = j.get("error")
            if isinstance(err, dict):
                msg = err.get("message") or body
            elif err is not None:
                msg = str(err)
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code}: {str(msg)[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")

    full = []
    try:
        with r:
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                if not line or not line.startswith("data:"):
                    continue
                payload_str = line[5:].lstrip()
                if payload_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload_str)
                except Exception:
                    continue
                try:
                    delta = chunk["choices"][0]["delta"].get("content") or ""
                except Exception:
                    delta = ""
                if delta:
                    full.append(delta)
                    yield delta
    finally:
        r.close()
    yield {"_done": True, "content": "".join(full)}


def get_cached_para_analysis(conn, cache_key):
    """读 paragraph_analyses 表某 cache_key 的缓存。返 dict {content,status,model} 或 None。"""
    row = conn.execute(
        "SELECT content, status, model FROM paragraph_analyses WHERE cache_key=?",
        (cache_key,),
    ).fetchone()
    if row is None:
        return None
    return {"content": row["content"], "status": row["status"], "model": row["model"]}


def save_para_analysis(conn, cache_key, content, model):
    """落库段落解析结果（INSERT OR REPLACE）。status 恒 'ok'——失败不落库。"""
    from .db import now_iso
    now = now_iso()
    conn.execute(
        "INSERT INTO paragraph_analyses(cache_key, content, status, model, analyzed_at, updated_at) "
        "VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(cache_key) DO UPDATE SET content=excluded.content, "
        "status=excluded.status, model=excluded.model, analyzed_at=excluded.analyzed_at, "
        "updated_at=excluded.updated_at",
        (cache_key, content, "ok", model, now, now),
    )
    conn.commit()

