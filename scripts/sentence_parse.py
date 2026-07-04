#!/usr/bin/env python3
"""sentence_parse.py — 长难句解析（母语式走查）。复用 llm_translate 的网络层。

与 llm_translate.py 对称：读 ew_llm.json / config 表 active_llm_model，
走 OpenAI 兼容 /chat/completions。区别在 system prompt——这里不是翻译，
而是 10 层母语式阅读走查（动词锚定 → kernel 拆解 → 修饰剥离 → 逐层加回 →
合成训练 → 标点路标 → 复述 → 译文）。

用法:
  .venv/bin/python3 scripts/sentence_parse.py                      # 默认例句
  .venv/bin/python3 scripts/sentence_parse.py "Your sentence here" # 自定义
  PARSE_MODEL=deepseek-v4-pro .venv/bin/python3 scripts/sentence_parse.py "..."

model 优先级（与 server/llm.py 一致）: PARSE_MODEL 环境变量 > active_llm_model > ew_llm.json.model
"""
import sys, os, time, importlib.util

# 与 llm_translate.py 同位置：项目根
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "llm_translate", os.path.join(ROOT, "scripts", "llm_translate.py")
)
llm_translate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(llm_translate)
load_conf, join_url, http_json, _active_llm_model = (
    llm_translate.load_conf, llm_translate.join_url,
    llm_translate.http_json, llm_translate._active_llm_model,
)

DEFAULT_SENTENCE = ('Noting the "medical/psychological" nature of problem gambling behavior, '
            'the letter said that before being readmitted to the casino he would have to '
            'present medical/psychological information demonstrating that patronizing the '
            'casino would pose no threat to his safety or well-being.')

SYS_PROMPT = """You are a sentence-reading coach for advanced English learners (考研 level).
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

class Args:
    url = None
    key = None
    model = os.environ.get("PARSE_MODEL") or None

def http_json_long(url, headers, payload=None, method="POST", timeout=180):
    import urllib.request, urllib.error, json as _json
    data = None
    if payload is not None:
        data = _json.dumps(payload).encode("utf-8")
        headers = dict(headers); headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, _json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            j = _json.loads(body)
            msg = (j.get("error", {}).get("message") if isinstance(j.get("error"), dict) else j.get("error")) or body
        except Exception:
            msg = body
        raise RuntimeError(f"HTTP {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error: {e.reason}")

def main():
    sentence = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else DEFAULT_SENTENCE
    c = load_conf(Args())
    if not (c["url"] and c["key"]):
        sys.exit("error: ew_llm.json 缺 url/key")
    model = c["model"] or _active_llm_model()
    if not model:
        sys.exit("error: 无 model")
    url = join_url(c["url"], "/chat/completions")
    payload = {
        "model": model, "temperature": 0,
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": sentence},
        ],
    }
    t0 = time.time()
    _, data = http_json_long(url, {"Authorization": "Bearer " + c["key"]}, payload, "POST", timeout=180)
    dt = time.time() - t0
    try:
        out = data["choices"][0]["message"]["content"].strip()
    except Exception:
        out = ""
    if not out:
        sys.exit("error: 模型无输出")
    print(out)
    print(f"\n[ok] model={model}  {dt:.2f}s", file=sys.stderr)

if __name__ == "__main__":
    main()
