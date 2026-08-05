#!/usr/bin/env python3
"""用 LLM 读取 408 题干，做考点多标签分类（一对多），回写 JSON。

设计：
  - 不依赖关键词硬规则；规则标注仅作 fallback / 对比。
  - 分类器输出 1..N 个 kp_id，带 role(primary|secondary) 与 confidence。
  - 题号已知分科时，**优先在该书考点表内分类**（降幻觉），允许 secondary 跨书（综合题）。
  - 结果写入 item.kps，并保留 item.kps_llm / item.kps_meta 便于审计。
  - 支持断点续跑、按年/限量、并发。

用法:
  .venv/bin/python3 scripts/annotate_cs408_llm.py --year 2023 --limit 3
  .venv/bin/python3 scripts/annotate_cs408_llm.py                 # 全部缺标注题
  .venv/bin/python3 scripts/annotate_cs408_llm.py --force         # 重标全部
  .venv/bin/python3 scripts/annotate_cs408_llm.py --reanalyze     # 仅重算 exam_stats

LLM 配置：项目根 ew_llm.json（url/key/model），与后端一致。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CS408_DIR = ROOT / "papers" / "cs408"
CATALOG_PATH = CS408_DIR / "kp_catalog.json"
LLM_PATHS = [
    ROOT / "ew_llm.json",
    Path(os.environ.get("EW_LLM_CONFIG", "")),
]

# 题号 → 默认书（卷面布局先验，只作候选集约束，不是最终标签）
Q_BOOK = {}
for n in range(1, 12):
    Q_BOOK[n] = "ds"
for n in range(12, 23):
    Q_BOOK[n] = "co"
for n in range(23, 33):
    Q_BOOK[n] = "os"
for n in range(33, 41):
    Q_BOOK[n] = "cn"
for n in (41, 42):
    Q_BOOK[n] = "ds"
for n in (43, 44):
    Q_BOOK[n] = "co"
for n in (45, 46):
    Q_BOOK[n] = "os"
Q_BOOK[47] = "cn"

BOOK_NAME = {
    "ds": "数据结构",
    "co": "计算机组成原理",
    "os": "操作系统",
    "cn": "计算机网络",
}


def load_cc_switch_deepseek() -> dict[str, str] | None:
    """从 cc-switch 当前 Codex/DeepSeek provider 读 url/key/model。

    期望 model 为短名 deepseek-v4-flash（不是 deepseek-ai/... 前缀）。
    """
    db = Path.home() / ".cc-switch" / "cc-switch.db"
    if not db.is_file():
        return None
    try:
        import sqlite3

        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        row = conn.execute(
            """
            SELECT settings_config FROM providers
            WHERE app_type='codex' AND is_current=1
            """
        ).fetchone()
        if not row:
            row = conn.execute(
                """
                SELECT settings_config FROM providers
                WHERE app_type='codex' AND (name LIKE '%eepSeek%' OR name LIKE '%deepseek%')
                LIMIT 1
                """
            ).fetchone()
        conn.close()
        if not row:
            return None
        cfg = json.loads(row[0])
        auth = cfg.get("auth") or {}
        key = auth.get("OPENAI_API_KEY") or auth.get("api_key") or ""
        # config 是 TOML 文本
        toml = cfg.get("config") or ""
        model = "deepseek-v4-flash"
        base = "https://api.deepseek.com"
        for line in toml.splitlines():
            s = line.strip()
            if s.startswith("model =") and "model_provider" not in s and "catalog" not in s:
                # model = "deepseek-v4-flash"
                m = re.search(r'model\s*=\s*"([^"]+)"', s)
                if m and "/" not in m.group(1):  # 跳过路径类
                    # 避免误匹配 model_provider 已过滤；再排除明显非模型
                    val = m.group(1)
                    if val not in ("custom", "openai", "azure"):
                        model = val
            if s.startswith("base_url"):
                m = re.search(r'base_url\s*=\s*"([^"]+)"', s)
                if m:
                    base = m.group(1).rstrip("/")
        # modelCatalog 优先
        mc = (cfg.get("modelCatalog") or {}).get("models") or []
        if mc and isinstance(mc[0], dict) and mc[0].get("model"):
            model = mc[0]["model"]
        if key and base and model:
            return {"url": base, "key": key, "model": model, "source": "cc-switch"}
    except Exception:
        return None
    return None


def load_llm_conf(model_override: str | None = None) -> dict[str, str]:
    # 1) 环境变量优先
    env_url = (os.environ.get("EW_LLM_URL") or "").rstrip("/")
    env_key = os.environ.get("EW_LLM_KEY") or ""
    env_model = os.environ.get("EW_LLM_MODEL") or ""
    if env_url and env_key and (model_override or env_model):
        return {
            "url": env_url,
            "key": env_key,
            "model": model_override or env_model,
            "source": "env",
        }

    # 2) 项目 ew_llm.json
    for p in LLM_PATHS:
        if p and p.is_file():
            conf = json.loads(p.read_text(encoding="utf-8"))
            url = (conf.get("url") or "").rstrip("/")
            key = conf.get("key") or ""
            model = model_override or conf.get("model") or ""
            if url and key and model:
                return {"url": url, "key": key, "model": model, "source": str(p)}

    # 3) cc-switch 当前 DeepSeek（短名 deepseek-v4-flash）
    cc = load_cc_switch_deepseek()
    if cc:
        if model_override:
            cc["model"] = model_override
        return cc

    raise SystemExit(
        "LLM 未配置：请填写 ew_llm.json，或在 cc-switch 启用 DeepSeek(codex)，"
        "或设 EW_LLM_URL/KEY/MODEL"
    )


def join_chat_url(base: str) -> str:
    b = base.rstrip("/")
    if not re.search(r"/v\d+$", b):
        b = b + "/v1"
    return b + "/chat/completions"


def chat(
    conf: dict[str, str],
    system: str,
    user: str,
    temperature: float = 0.1,
    timeout: int = 120,
    retries: int = 2,
) -> str:
    url = join_chat_url(conf["url"])
    payload = {
        "model": conf["model"],
        "temperature": temperature,
        # deepseek-v4-flash 默认开 thinking，会占满 max_tokens 导致 content 为空
        "max_tokens": 1200,
        "thinking": {"type": "disabled"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {conf['key']}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            msg = body["choices"][0]["message"]
            content = msg.get("content") or ""
            # 兜底：若仍空，尝试 reasoning 里抽 JSON
            if not str(content).strip():
                alt = msg.get("reasoning_content") or msg.get("reasoning") or ""
                if "{" in str(alt):
                    content = alt
            if not str(content).strip():
                raise RuntimeError(
                    f"empty LLM content finish={body['choices'][0].get('finish_reason')} usage={body.get('usage')}"
                )
            return content
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")[:500]
            last_err = RuntimeError(f"HTTP {e.code}: {err}")
        except Exception as e:
            last_err = e
        if attempt < retries:
            time.sleep(1.5 * (attempt + 1))
    assert last_err is not None
    raise last_err


def load_catalog() -> dict[str, Any]:
    if not CATALOG_PATH.exists():
        raise SystemExit(f"missing {CATALOG_PATH}; run export or parse pipeline first")
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def all_kp_ids(catalog: dict[str, Any]) -> dict[str, str]:
    """id -> name"""
    out: dict[str, str] = {}
    for book in catalog["books"]:
        for kp in book.get("kps_flat") or []:
            out[kp["id"]] = kp["name"]
        for mod in book.get("modules") or []:
            for kp in mod.get("kps") or []:
                out[kp["id"]] = kp["name"]
    return out


def book_kp_list(catalog: dict[str, Any], book_id: str) -> list[dict[str, str]]:
    for book in catalog["books"]:
        if book["id"] == book_id:
            return list(book.get("kps_flat") or [])
    return []


def format_catalog_for_prompt(
    catalog: dict[str, Any], primary_book: str, allow_cross: bool
) -> str:
    lines: list[str] = []
    for book in catalog["books"]:
        if not allow_cross and book["id"] != primary_book:
            continue
        # 主书完整列出；跨书只给 id 清单压缩
        if book["id"] == primary_book:
            lines.append(f"## {book['name']} ({book['id']}) — 主候选")
            for kp in book.get("kps_flat") or []:
                lines.append(f"- {kp['id']}: {kp['name']}")
        elif allow_cross:
            lines.append(f"## {book['name']} ({book['id']}) — 仅当明显跨科时作 secondary")
            for kp in book.get("kps_flat") or []:
                lines.append(f"- {kp['id']}: {kp['name']}")
    return "\n".join(lines)


SYSTEM_PROMPT = """你是考研 408（计算机学科专业基础综合）命题与考点标注专家。
任务：阅读题目，从给定「考点目录」中选择所有真正考查到的考点（多标签，一对多）。

规则：
1. 必须且只能使用目录中出现的 kp id，禁止编造 id。
2. 至少 1 个、至多 4 个考点。综合大题常 2–3 个。
3. role：
   - primary：本题核心考查点（通常 1 个；算法设计大题可 primary=算法设计，secondary=具体结构）
   - secondary：必要但非主线的关联考点
4. confidence：0~1，表示你对该标签的把握。
5. 不要根据「题号习惯」瞎猜；以题干与选项实际内容为准。
6. 只输出 JSON，不要 markdown 围栏，不要解释性前言。

输出 schema：
{
  "kps": [
    {"id": "ds.graph.store", "role": "primary", "confidence": 0.92},
    {"id": "ds.algo.design", "role": "secondary", "confidence": 0.8}
  ],
  "rationale": "一句话说明为何这些考点"
}
"""


def build_user_prompt(
    item: dict[str, Any],
    year: int,
    catalog_text: str,
    primary_book: str,
) -> str:
    opts = item.get("options") or {}
    opt_lines = []
    if isinstance(opts, dict):
        for k in ("A", "B", "C", "D"):
            if k in opts and opts[k]:
                opt_lines.append(f"{k}. {opts[k]}")
    options_block = "\n".join(opt_lines) if opt_lines else "（无选项 / 大题）"
    return f"""年份: {year}
题号: {item.get("n")}
题型: {item.get("kind")}  # mcq=选择 big=综合
卷面默认分科(仅参考): {primary_book} {BOOK_NAME.get(primary_book, "")}
分值: {item.get("points")}

【题干】
{item.get("stem") or ""}

【选项】
{options_block}

【考点目录】
{catalog_text}

请分类。"""


def parse_llm_json(content: str) -> dict[str, Any]:
    if content is None:
        raise ValueError("empty LLM content")
    text = content.strip()
    if not text:
        raise ValueError("empty LLM content")
    # 去掉 thinking / 围栏
    text = re.sub(r"(?is)<think>.*?</think>", "", text).strip()
    text = re.sub(r"(?is)<thinking>.*?</thinking>", "", text).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    # 截取最外层 {}
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def validate_kps(
    raw: dict[str, Any],
    valid_ids: dict[str, str],
    primary_book: str,
) -> list[dict[str, Any]]:
    kps_in = raw.get("kps") or []
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in kps_in:
        if not isinstance(row, dict):
            continue
        kid = str(row.get("id") or "").strip()
        if kid not in valid_ids or kid in seen:
            continue
        seen.add(kid)
        role = row.get("role") or "secondary"
        if role not in ("primary", "secondary"):
            role = "secondary"
        try:
            conf = float(row.get("confidence", 0.7))
        except (TypeError, ValueError):
            conf = 0.7
        conf = max(0.0, min(1.0, conf))
        cleaned.append(
            {
                "id": kid,
                "role": role,
                "confidence": round(conf, 3),
                "name": valid_ids[kid],
            }
        )

    if not cleaned:
        return []

    # 保证至少一个 primary：取 confidence 最高
    if not any(k["role"] == "primary" for k in cleaned):
        cleaned.sort(key=lambda x: -x["confidence"])
        cleaned[0]["role"] = "primary"

    # primary 优先排前，同 role 按 confidence
    cleaned.sort(key=lambda x: (0 if x["role"] == "primary" else 1, -x["confidence"]))
    # 最多 4 个
    cleaned = cleaned[:4]

    # 若 primary 不在默认书且存在同书 secondary，可交换（温和纠偏，不强制）
    primaries = [k for k in cleaned if k["role"] == "primary"]
    if primaries and not primaries[0]["id"].startswith(primary_book + "."):
        same = [k for k in cleaned if k["id"].startswith(primary_book + ".")]
        if same:
            # 把同书最高 conf 提为 primary
            for k in cleaned:
                k["role"] = "secondary"
            same[0]["role"] = "primary"
            cleaned.sort(key=lambda x: (0 if x["role"] == "primary" else 1, -x["confidence"]))

    return cleaned


def item_needs_llm(item: dict[str, Any], force: bool) -> bool:
    if force:
        return True
    meta = item.get("kps_meta") or {}
    if meta.get("method") == "llm" and item.get("kps"):
        return False
    # 已有 kps_llm 也跳过
    if item.get("kps_llm"):
        return False
    return True


def classify_one(
    conf: dict[str, str],
    catalog: dict[str, Any],
    valid_ids: dict[str, str],
    year: int,
    item: dict[str, Any],
    allow_cross: bool,
    timeout: int = 120,
) -> dict[str, Any]:
    n = int(item.get("n") or 0)
    # 卷面布局书优先（book_layout），避免上次 LLM 改写 book 后候选集跑偏
    primary_book = item.get("book_layout") or item.get("book") or Q_BOOK.get(n, "ds")
    catalog_text = format_catalog_for_prompt(catalog, primary_book, allow_cross=allow_cross)
    user = build_user_prompt(item, year, catalog_text, primary_book)
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            content = chat(conf, SYSTEM_PROMPT, user, timeout=timeout)
            raw = parse_llm_json(content)
            kps = validate_kps(raw, valid_ids, primary_book)
            if not kps:
                raise ValueError("no valid kp ids in model output")
            return {
                "kps": kps,
                "rationale": str(raw.get("rationale") or "")[:300],
                "raw_ok": True,
            }
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"classify failed after retries: {last_err}")


def annotate_paper(
    conf: dict[str, str],
    catalog: dict[str, Any],
    valid_ids: dict[str, str],
    paper: dict[str, Any],
    force: bool,
    limit: int | None,
    workers: int,
    allow_cross: bool,
    save_path: Path,
    timeout: int = 120,
) -> tuple[int, int]:
    year = paper["year"]
    items = paper["items"]
    jobs: list[int] = []
    for i, it in enumerate(items):
        if not (it.get("stem") or "").strip():
            continue
        if item_needs_llm(it, force):
            jobs.append(i)
    if limit is not None:
        jobs = jobs[:limit]

    done = 0
    failed = 0
    if not jobs:
        print(f"  {year}: nothing to annotate")
        return 0, 0

    print(f"  {year}: {len(jobs)} items to LLM-classify (workers={workers})")

    def work(idx: int) -> tuple[int, dict[str, Any] | None, str | None]:
        try:
            result = classify_one(
                conf, catalog, valid_ids, year, items[idx], allow_cross, timeout=timeout
            )
            return idx, result, None
        except Exception as e:
            return idx, None, str(e)

    # 串行更稳；workers>1 时并行
    results: list[tuple[int, dict[str, Any] | None, str | None]] = []
    if workers <= 1:
        for idx in jobs:
            n = items[idx].get("n")
            print(f"    classifying {year}#{n} ...", flush=True)
            results.append(work(idx))
            time.sleep(0.15)
    else:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(work, idx) for idx in jobs]
            for fut in as_completed(futs):
                results.append(fut.result())

    for idx, result, err in sorted(results, key=lambda x: x[0]):
        it = items[idx]
        if err or not result or not result.get("kps"):
            failed += 1
            it["kps_meta"] = {
                "method": "llm_failed",
                "error": err or "empty kps",
                "at": int(time.time()),
            }
            print(f"    FAIL {year}#{it.get('n')}: {err or 'empty'}")
            continue
        # 保留旧规则结果便于对比
        if it.get("kps") and (it.get("kps_meta") or {}).get("method") != "llm":
            it["kps_rules"] = it["kps"]
        it["kps"] = [
            {"id": k["id"], "role": k["role"], "confidence": k["confidence"]}
            for k in result["kps"]
        ]
        it["kps_llm"] = it["kps"]
        it["kps_meta"] = {
            "method": "llm",
            "model": conf["model"],
            "rationale": result.get("rationale"),
            "at": int(time.time()),
        }
        # 书字段：以 primary 考点前缀为准（一对多时仍保留卷面 book 可另存）
        prim = next((k for k in result["kps"] if k["role"] == "primary"), result["kps"][0])
        prefix = prim["id"].split(".")[0]
        if prefix in BOOK_NAME:
            it["book_layout"] = it.get("book")  # 卷面布局
            it["book"] = prefix
            it["book_name"] = BOOK_NAME[prefix]
        done += 1

    paper["annotation"] = {
        "method": "llm_multilabel",
        "model": conf["model"],
        "updated_at": int(time.time()),
    }
    save_path.write_text(json.dumps(paper, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {year}: saved ok={done} fail={failed}")
    return done, failed


def apply_result_to_item(
    it: dict[str, Any],
    result: dict[str, Any] | None,
    err: str | None,
    model: str,
) -> bool:
    """写入单题结果。成功返回 True。"""
    if err or not result or not result.get("kps"):
        it["kps_meta"] = {
            "method": "llm_failed",
            "error": err or "empty kps",
            "at": int(time.time()),
        }
        return False
    if it.get("kps") and (it.get("kps_meta") or {}).get("method") != "llm":
        it["kps_rules"] = it["kps"]
    it["kps"] = [
        {"id": k["id"], "role": k["role"], "confidence": k["confidence"]}
        for k in result["kps"]
    ]
    it["kps_llm"] = it["kps"]
    it["kps_meta"] = {
        "method": "llm",
        "model": model,
        "rationale": result.get("rationale"),
        "at": int(time.time()),
    }
    prim = next((k for k in result["kps"] if k["role"] == "primary"), result["kps"][0])
    prefix = prim["id"].split(".")[0]
    if prefix in BOOK_NAME:
        it["book_layout"] = it.get("book_layout") or it.get("book")
        it["book"] = prefix
        it["book_name"] = BOOK_NAME[prefix]
    return True


def annotate_all_global(
    conf: dict[str, str],
    catalog: dict[str, Any],
    valid_ids: dict[str, str],
    paths: list[Path],
    force: bool,
    limit: int | None,
    workers: int,
    allow_cross: bool,
    timeout: int = 120,
) -> tuple[int, int]:
    """跨年全局线程池：真正 workers 路并发（可 500）。

    内存中改 paper，按年加锁落盘；每完成 50 题刷一次对应年文件。
    """
    import threading

    papers: dict[str, dict[str, Any]] = {}
    locks: dict[str, threading.Lock] = {}
    jobs: list[tuple[str, int]] = []  # (year_key, item_idx)

    for path in paths:
        paper = json.loads(path.read_text(encoding="utf-8"))
        year_key = str(paper["year"])
        papers[year_key] = paper
        locks[year_key] = threading.Lock()
        paper["_path"] = str(path)
        idxs = []
        for i, it in enumerate(paper["items"]):
            if not (it.get("stem") or "").strip():
                continue
            if item_needs_llm(it, force):
                idxs.append(i)
        if limit is not None:
            idxs = idxs[:limit]
        for i in idxs:
            jobs.append((year_key, i))

    total = len(jobs)
    if not total:
        print("global: nothing to annotate")
        return 0, 0

    workers = max(1, min(workers, total))
    print(
        f"global: {total} items, workers={workers}, model={conf['model']}",
        flush=True,
    )

    done = 0
    failed = 0
    counter_lock = threading.Lock()
    dirty: set[str] = set()
    t0 = time.time()

    def save_year(year_key: str) -> None:
        paper = papers[year_key]
        path = Path(paper["_path"])
        out = {k: v for k, v in paper.items() if k != "_path"}
        out["annotation"] = {
            "method": "llm_multilabel",
            "model": conf["model"],
            "updated_at": int(time.time()),
        }
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    def work(job: tuple[str, int]) -> tuple[str, int, dict[str, Any] | None, str | None]:
        year_key, idx = job
        paper = papers[year_key]
        it = paper["items"][idx]
        try:
            result = classify_one(
                conf,
                catalog,
                valid_ids,
                int(year_key),
                it,
                allow_cross,
                timeout=timeout,
            )
            return year_key, idx, result, None
        except Exception as e:
            return year_key, idx, None, str(e)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(work, j) for j in jobs]
        for fut in as_completed(futs):
            year_key, idx, result, err = fut.result()
            with locks[year_key]:
                ok = apply_result_to_item(
                    papers[year_key]["items"][idx], result, err, conf["model"]
                )
                dirty.add(year_key)
                n = papers[year_key]["items"][idx].get("n")
                if not ok:
                    print(f"  FAIL {year_key}#{n}: {(err or '')[:120]}", flush=True)

            years_to_save: list[str] = []
            with counter_lock:
                if ok:
                    done += 1
                else:
                    failed += 1
                finished = done + failed
                if finished % 25 == 0 or finished == total:
                    elapsed = time.time() - t0
                    rate = finished / elapsed if elapsed > 0 else 0
                    print(
                        f"  progress {finished}/{total} ok={done} fail={failed} "
                        f"{rate:.1f} q/s elapsed={elapsed:.0f}s",
                        flush=True,
                    )
                # 定期落盘
                if finished % 50 == 0 or finished == total:
                    years_to_save = list(dirty)
                    dirty.clear()
            for yk in years_to_save:
                with locks[yk]:
                    save_year(yk)

    # 最终再存一遍
    for yk in papers:
        with locks[yk]:
            save_year(yk)

    print(f"global done ok={done} fail={failed} in {time.time()-t0:.0f}s", flush=True)
    return done, failed


def reanalyze() -> None:
    """重算 exam_stats（优先用当前 kps）。"""
    # 延迟导入同目录分析逻辑
    sys.path.insert(0, str(ROOT / "scripts"))
    from parse_cs408 import analyze  # type: ignore

    papers = []
    for path in sorted(CS408_DIR.glob("20*.json")):
        if path.name == "index.json":
            continue
        papers.append(json.loads(path.read_text(encoding="utf-8")))
    if not papers:
        print("no papers")
        return
    stats = analyze(papers)
    # 附加 llm 覆盖率
    llm_n = 0
    total = 0
    for p in papers:
        for it in p.get("items") or []:
            if not (it.get("stem") or "").strip():
                continue
            total += 1
            if (it.get("kps_meta") or {}).get("method") == "llm":
                llm_n += 1
    stats["llm_annotation_coverage"] = {
        "annotated": llm_n,
        "total_with_stem": total,
        "ratio": round(llm_n / total, 4) if total else 0,
    }
    (CS408_DIR / "exam_stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"exam_stats.json updated; llm coverage {llm_n}/{total}; "
        f"top kp: {stats['top_knowledge_points'][0]['kp_id'] if stats['top_knowledge_points'] else '-'}"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="LLM multi-label KP classifier for 408 papers")
    ap.add_argument("--year", type=int, help="只处理某年")
    ap.add_argument("--limit", type=int, help="每年最多标注题数（调试）")
    ap.add_argument("--force", action="store_true", help="忽略已有 LLM 标注")
    ap.add_argument("--workers", type=int, default=1, help="并发（默认 1；可 500 全局池）")
    ap.add_argument(
        "--global-pool",
        action="store_true",
        help="跨年共用一个线程池（workers>1 时默认开启）",
    )
    ap.add_argument(
        "--no-global-pool",
        action="store_true",
        help="按年串行，仅年内并发",
    )
    ap.add_argument(
        "--allow-cross-book",
        action="store_true",
        default=True,
        help="允许 secondary 跨书（默认开）",
    )
    ap.add_argument("--no-cross-book", action="store_true", help="禁止跨书标签")
    ap.add_argument("--reanalyze", action="store_true", help="仅重算统计")
    ap.add_argument("--dry-run", action="store_true", help="只打印将处理的题目，不调 LLM")
    ap.add_argument(
        "--model",
        type=str,
        default=None,
        help="覆盖 ew_llm.json 的 model（如 deepseek-v4-flash）",
    )
    ap.add_argument("--timeout", type=int, default=120, help="单题 LLM 超时秒数")
    args = ap.parse_args()

    if args.reanalyze:
        reanalyze()
        return 0

    catalog = load_catalog()
    valid_ids = all_kp_ids(catalog)
    print(f"catalog KPs: {len(valid_ids)}")

    years = [args.year] if args.year else list(range(2012, 2027))
    paths = [CS408_DIR / f"{y}.json" for y in years]
    paths = [p for p in paths if p.exists()]
    if not paths:
        print("no paper json found")
        return 1

    if args.dry_run:
        for p in paths:
            paper = json.loads(p.read_text(encoding="utf-8"))
            need = sum(1 for it in paper["items"] if item_needs_llm(it, args.force) and it.get("stem"))
            print(f"{p.name}: need {need}")
        return 0

    conf = load_llm_conf(model_override=args.model)
    print(
        f"model={conf['model']} url={conf['url']} "
        f"source={conf.get('source', '?')}"
    )

    allow_cross = not args.no_cross_book
    use_global = (args.global_pool or args.workers > 1) and not args.no_global_pool
    # 单年 + 小并发仍可走原路径
    if use_global and (len(paths) > 1 or args.workers >= 8):
        total_ok, total_fail = annotate_all_global(
            conf,
            catalog,
            valid_ids,
            paths,
            force=args.force,
            limit=args.limit,
            workers=max(1, args.workers),
            allow_cross=allow_cross,
            timeout=args.timeout,
        )
    else:
        total_ok = total_fail = 0
        for path in paths:
            paper = json.loads(path.read_text(encoding="utf-8"))
            ok, fail = annotate_paper(
                conf,
                catalog,
                valid_ids,
                paper,
                force=args.force,
                limit=args.limit,
                workers=max(1, args.workers),
                allow_cross=allow_cross,
                save_path=path,
                timeout=args.timeout,
            )
            total_ok += ok
            total_fail += fail

    print(f"done ok={total_ok} fail={total_fail}")
    reanalyze()
    return 0 if total_fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
