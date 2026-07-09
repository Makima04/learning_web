"""llm_common.py — 被 server/llm.py 与 scripts/* 共享的 LLM 调用原语。

集中放三处同源的 system prompt、join_url、load_conf、http_json（含重试 + 错误脱敏）、
active_model_from。改一处自动同步所有调用方，消除 LLM 逻辑散落重复。

注意：本模块不 import server.db（避免循环依赖）。conf 默认路径用本地计算的
CONF_PATH（项目根 ew_llm.json）。调用方各自传入自己的 db 读取函数给 active_model_from。
"""
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

# 翻译系统 prompt（与前端 on-card 翻译共用语义）
SYS_PROMPT = (
    "你是翻译引擎。把用户给的英文考研真题句子翻译成简体中文。"
    "只输出译文，不要原文、不要引号、不要解释、不要多余空白。"
)

# 长难句解析 prompt（母语式 10 层走查）。
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


# ew_llm.json 在项目根（server/ 上一级）。本地计算，避免 import server.db 形成循环依赖。
CONF_PATH = Path(__file__).resolve().parent.parent / "ew_llm.json"


def join_url(base, path):
    """与 llm.js / llm_translate.py 一致：容忍尾斜杠，无 /vN 时补 /v1。"""
    import re
    b = (base or "").rstrip("/")
    if not re.search(r"/v\d+$", b):
        b += "/v1"
    return b + path


def load_conf(conf_path=None):
    """读 LLM 配置，返回 {url,key,model}（trim）。

    优先级：环境变量 EW_LLM_URL/EW_LLM_KEY/EW_LLM_MODEL > conf_path（json）。
    两者都缺 → 全空串（翻译功能不可用，背词照常）。
    conf_path 默认项目根 ew_llm.json。
    """
    c = {"url": "", "key": "", "model": ""}
    for k, env in (("url", "EW_LLM_URL"), ("key", "EW_LLM_KEY"), ("model", "EW_LLM_MODEL")):
        v = os.environ.get(env)
        if v and v.strip():
            c[k] = v.strip()
    path = Path(conf_path) if conf_path else CONF_PATH
    try:
        if path.exists():
            raw = json.load(open(path))
            for k in ("url", "key", "model"):
                if not c[k]:
                    c[k] = (raw.get(k) or "").strip()
    except Exception:
        pass
    return c


# 需要重试的网关状态码（瞬时故障）
_RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
_RETRY_BACKOFF = (1, 2, 4)


def http_json(url, headers, payload=None, method="GET", timeout=60):
    """urllib 版 fetch JSON。成功返 (status, data)，失败抛 RuntimeError（已脱敏）。

    重试：对 HTTP 429/500/502/503/504 与网络错误做最多 3 次指数退避（1/2/4s）。
    其它 4xx 不重试。错误信息脱敏——不把网关 host/原始响应体泄露给调用方。
    """
    data = None
    hdrs = dict(headers)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)

    for attempt in range(len(_RETRY_BACKOFF) + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", "replace")
                return r.status, (json.loads(body) if body else None)
        except urllib.error.HTTPError as e:
            # 仅瞬时故障重试
            if e.code in _RETRY_STATUS and attempt < len(_RETRY_BACKOFF):
                time.sleep(_RETRY_BACKOFF[attempt])
                continue
            raise RuntimeError(f"LLM gateway returned HTTP {e.code}")
        except urllib.error.URLError as e:
            if attempt < len(_RETRY_BACKOFF):
                time.sleep(_RETRY_BACKOFF[attempt])
                continue
            raise RuntimeError("LLM request failed: network error")
    # 理论上到不了这里；以防万一
    raise RuntimeError("LLM request failed: network error")


def active_model_from(db_get_value, conf_model):
    """给定 db_get_value(key) → config 表值；返回 active_llm_model 或 conf_model 或 ''。

    server 与脚本各自传入自己的 db 读取函数，从而真正删除两处重复的 _active_model 逻辑。
    """
    try:
        v = db_get_value("active_llm_model") if db_get_value else None
        return v if v else (conf_model or "")
    except Exception:
        return conf_model or ""
