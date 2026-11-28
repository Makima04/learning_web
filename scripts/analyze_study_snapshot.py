#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 /api/coach/snapshot 返回的学习状态快照 JSON，与本地数学（46份手稿、
李林880、数一历年真题）及 408（408历年真题、王道2027）题库交叉聚合，输出：
  - 各题集的 已斩 / 复习中(含逾期·模糊·不会) / 已会未斩 / 未做 统计
  - 薄弱考点 TOP 榜
  - 复习中与逾期题目明细（含错因笔记与网站直达链接）
  - 按 --kp <前缀> 精准筛选未做的补弱推荐题单（自动跳过已斩题）
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]

MATH_HANDOUTS_INDEX = PROJECT_DIR / "frontend/public/math/handouts/index.json"
LILIN880_PATH = PROJECT_DIR / "frontend/public/math/lilin880.json"
MATH1_PATH = PROJECT_DIR / "frontend/src/data/kg/math1Questions.json"
CS408_EXAM_PATH = PROJECT_DIR / "frontend/src/data/kg/cs408ReviewQuestions.json"
WANGDAO_PATH = PROJECT_DIR / "frontend/public/cs408/wangdao2027.json"

BJ_TZ = timezone(timedelta(hours=8))

BOOK_NAMES = {
    "calc": "高等数学",
    "linear": "线性代数",
    "prob": "概率论与数理统计",
    "ds": "数据结构",
    "co": "计算机组成原理",
    "os": "操作系统",
    "cn": "计算机网络",
}


def today_bj() -> str:
    return datetime.now(BJ_TZ).strftime("%Y-%m-%d")


def build_state_maps(snapshot: dict):
    kg = snapshot.get("kg") or {}
    item_marks_raw = kg.get("itemMarks") or []
    kp_states = kg.get("states") or {}

    marks_by_id: dict[str, dict] = {}
    for m in item_marks_raw:
        iid = m.get("itemId")
        if not iid:
            continue
        prev = marks_by_id.get(iid)
        if not prev or (m.get("ts") or 0) >= (prev.get("ts") or 0):
            marks_by_id[iid] = m

    journal = snapshot.get("journal") or {}
    entries_by_source: dict[str, dict] = {}
    for row in journal.get("entries") or []:
        ent = row.get("entry") if isinstance(row, dict) and "entry" in row else row
        if not isinstance(ent, dict):
            continue
        sid = ent.get("sourceItemId")
        if not sid:
            continue
        prev = entries_by_source.get(sid)
        if not prev or (ent.get("updatedAt") or 0) >= (prev.get("updatedAt") or 0):
            entries_by_source[sid] = ent

    return marks_by_id, kp_states, entries_by_source


def classify_item(
    ids: list[str],
    marks_by_id: dict[str, dict],
    entries_by_source: dict[str, dict],
    today: str,
) -> dict:
    """将单题归入 retired / reviewing / pass / untouched，并提取细分原因与错因笔记。"""
    matched_marks = [marks_by_id[i] for i in ids if i in marks_by_id]
    matched_entries = [entries_by_source[i] for i in ids if i in entries_by_source]

    if any(bool(m.get("retired")) for m in matched_marks):
        latest_ret = max((m.get("retiredAt") or m.get("ts") or 0) for m in matched_marks)
        return {
            "bucket": "retired",
            "reason": "retired",
            "mark": "pass",
            "ts": latest_ret,
            "note": "",
            "dueOn": None,
            "weakKpIds": [],
        }

    latest_mark = max(matched_marks, key=lambda m: m.get("ts") or 0) if matched_marks else None
    mark_level = latest_mark.get("mark") if latest_mark else None
    weak_kps = list(latest_mark.get("weakKpIds") or []) if latest_mark else []

    active_entry = None
    for ent in matched_entries:
        if ent.get("archived") or ent.get("status") == "archived":
            continue
        active_entry = ent
        break

    due_on = None
    note = ""
    is_overdue = False
    is_due_today = False
    if active_entry:
        due_on = active_entry.get("dueOn") or active_entry.get("nextReviewOn")
        note = (
            active_entry.get("note")
            or active_entry.get("summary")
            or active_entry.get("title")
            or ""
        ).strip()
        if due_on and isinstance(due_on, str):
            if due_on < today:
                is_overdue = True
            elif due_on == today:
                is_due_today = True

    if is_overdue:
        return {
            "bucket": "reviewing",
            "reason": "overdue",
            "mark": mark_level,
            "ts": (latest_mark or {}).get("ts") or 0,
            "note": note,
            "dueOn": due_on,
            "weakKpIds": weak_kps,
        }
    if is_due_today:
        return {
            "bucket": "reviewing",
            "reason": "due_today",
            "mark": mark_level,
            "ts": (latest_mark or {}).get("ts") or 0,
            "note": note,
            "dueOn": due_on,
            "weakKpIds": weak_kps,
        }
    if mark_level in ("fail", "fuzzy"):
        return {
            "bucket": "reviewing",
            "reason": mark_level,
            "mark": mark_level,
            "ts": (latest_mark or {}).get("ts") or 0,
            "note": note,
            "dueOn": due_on,
            "weakKpIds": weak_kps,
        }
    if active_entry and mark_level != "pass":
        return {
            "bucket": "reviewing",
            "reason": "scheduled",
            "mark": mark_level,
            "ts": (latest_mark or {}).get("ts") or 0,
            "note": note,
            "dueOn": due_on,
            "weakKpIds": weak_kps,
        }
    if mark_level == "pass":
        return {
            "bucket": "pass",
            "reason": "pass",
            "mark": "pass",
            "ts": (latest_mark or {}).get("ts") or 0,
            "note": note,
            "dueOn": due_on,
            "weakKpIds": weak_kps,
        }
    return {
        "bucket": "untouched",
        "reason": "untouched",
        "mark": mark_level,
        "ts": 0,
        "note": "",
        "dueOn": None,
        "weakKpIds": [],
    }


def load_catalogs(base_url: str, subject: str):
    base = base_url.rstrip("/")
    datasets = []

    if subject in ("all", "math"):
        if MATH_HANDOUTS_INDEX.exists():
            idx = json.loads(MATH_HANDOUTS_INDEX.read_text(encoding="utf-8"))
            items = []
            seen = set()
            for h in idx.get("handouts") or []:
                slug = h["slug"]
                kp_id = h.get("primaryKpId") or ""
                book = h.get("book") or "calc"
                for g in h.get("groups") or []:
                    for ex in g.get("examples") or []:
                        key = (slug, ex["anchorId"])
                        if key in seen:
                            continue
                        seen.add(key)
                        ids = [ex["id"]]
                        if ex.get("lilin880Id") and ex["lilin880Id"] != ex["id"]:
                            ids.append(ex["lilin880Id"])
                        path = f"/math-handouts/{slug}?q={ex['anchorId']}"
                        items.append(
                            {
                                "subject": "math",
                                "dataset": "math_handouts",
                                "ids": ids,
                                "primaryId": ex["id"],
                                "book": book,
                                "kpIds": [kp_id] if kp_id else [],
                                "label": f"{ex.get('source') or ex['id']} · {ex.get('title', '')}".strip(" ·"),
                                "chapter": h.get("title") or slug,
                                "url": f"{base}{path}" if base else path,
                                "priority": 2 if ex.get("sourceType") == "exam" else 1,
                            }
                        )
            datasets.append(("数学手稿 (46讲)", "math", items))

        if MATH1_PATH.exists():
            m1 = json.loads(MATH1_PATH.read_text(encoding="utf-8"))
            items = []
            for q in m1.get("items") or []:
                kps = [q["kpId"]] if q.get("kpId") else []
                kps.extend(q.get("secondaryKpIds") or [])
                path = f"/math/exams?q={q['id']}"
                items.append(
                    {
                        "subject": "math",
                        "dataset": "math1_exams",
                        "ids": [q["id"]],
                        "primaryId": q["id"],
                        "book": q.get("book") or "calc",
                        "kpIds": kps,
                        "label": f"{q['year']}数一第{q['n']}题 ({q.get('points', 0)}分) · {q.get('sourceLabel', '')}".strip(" ·"),
                        "chapter": q.get("kpId") or "",
                        "url": f"{base}{path}" if base else path,
                        "priority": int(q.get("points") or 4),
                    }
                )
            datasets.append(("数一历年真题", "math", items))

        if LILIN880_PATH.exists():
            ll = json.loads(LILIN880_PATH.read_text(encoding="utf-8"))
            items = []
            for q in ll:
                items.append(
                    {
                        "subject": "math",
                        "dataset": "lilin880",
                        "ids": [q["id"]],
                        "primaryId": q["id"],
                        "book": q.get("book") or "calc",
                        "kpIds": list(q.get("kp_ids") or []),
                        "label": f"{q.get('source') or q['id']} ({q.get('section_name', '')})".strip(),
                        "chapter": f"第{q.get('section', '')}章 {q.get('section_name', '')}".strip(),
                        "url": "",
                        "priority": 3 if q.get("kind") == "big" else 1,
                    }
                )
            datasets.append(("李林 880", "math", items))

    if subject in ("all", "cs408"):
        if CS408_EXAM_PATH.exists():
            c4 = json.loads(CS408_EXAM_PATH.read_text(encoding="utf-8"))
            items = []
            for q in c4.get("items") or []:
                kps = [q["kpId"]] if q.get("kpId") else []
                kps.extend(q.get("secondaryKpIds") or [])
                path = f"/cs408/exams?year={q['year']}&q={q['id']}"
                items.append(
                    {
                        "subject": "cs408",
                        "dataset": "cs408_exams",
                        "ids": [q["id"]],
                        "primaryId": q["id"],
                        "book": q.get("book") or "ds",
                        "kpIds": kps,
                        "label": f"{q['year']}年408第{q['n']}题 ({q.get('points', 0)}分)",
                        "chapter": q.get("kpId") or "",
                        "url": f"{base}{path}" if base else path,
                        "priority": int(q.get("points") or 2),
                    }
                )
            datasets.append(("408 历年真题 (2012-2026)", "cs408", items))

        if WANGDAO_PATH.exists():
            wd = json.loads(WANGDAO_PATH.read_text(encoding="utf-8"))
            items = []
            for q in wd:
                kind_cn = {"mcq": "选择", "big": "大题"}.get(q.get("kind", ""), q.get("kind", ""))
                items.append(
                    {
                        "subject": "cs408",
                        "dataset": "wangdao2027",
                        "ids": [q["id"]],
                        "primaryId": q["id"],
                        "book": q.get("book") or "ds",
                        "kpIds": list(q.get("kp_ids") or []),
                        "label": f"王道 {BOOK_NAMES.get(q.get('book', ''), q.get('book', ''))} §{q.get('section', '')} {kind_cn}#{q.get('qno', '')} ({q.get('section_name', '')})",
                        "chapter": f"§{q.get('section', '')} {q.get('section_name', '')}".strip(),
                        "url": "",
                        "priority": 3 if q.get("kind") == "big" else 1,
                    }
                )
            datasets.append(("王道 2027 题库", "cs408", items))

    return datasets


def analyze(snapshot: dict, base_url: str, subject: str, kp_filter: str | None, limit: int):
    today = today_bj()
    marks_by_id, _kp_states, entries_by_source = build_state_maps(snapshot)
    datasets = load_catalogs(base_url, subject)

    summary_rows = []
    reviewing_list = []
    kp_agg = defaultdict(lambda: {"retired": 0, "reviewing": 0, "overdue": 0, "fail": 0, "fuzzy": 0, "pass": 0, "untouched": 0})
    recommended_untouched = []

    seen_review_ids = set()
    seen_rec_ids = set()

    for ds_name, ds_subj, items in datasets:
        counts = {"total": 0, "retired": 0, "reviewing": 0, "overdue": 0, "pass": 0, "untouched": 0}
        for it in items:
            if kp_filter and not any(k.startswith(kp_filter) for k in it["kpIds"]):
                continue
            st = classify_item(it["ids"], marks_by_id, entries_by_source, today)
            counts["total"] += 1
            counts[st["bucket"]] += 1
            if st["reason"] == "overdue":
                counts["overdue"] += 1

            primary_kp = it["kpIds"][0] if it["kpIds"] else f"{it['book']}.untagged"
            if it["dataset"] in ("math1_exams", "lilin880", "cs408_exams", "wangdao2027"):
                kp_agg[primary_kp][st["bucket"]] += 1
                if st["reason"] in ("overdue", "fail", "fuzzy"):
                    kp_agg[primary_kp][st["reason"]] += 1

            if st["bucket"] == "reviewing" and it["primaryId"] not in seen_review_ids:
                seen_review_ids.add(it["primaryId"])
                reviewing_list.append(
                    {
                        "subject": ds_subj,
                        "dataset": ds_name,
                        "id": it["primaryId"],
                        "reason": st["reason"],
                        "dueOn": st["dueOn"],
                        "kp": primary_kp,
                        "label": it["label"],
                        "note": st["note"],
                        "weakKpIds": st["weakKpIds"],
                        "url": it["url"],
                        "priority": it["priority"],
                    }
                )

            if kp_filter and st["bucket"] == "untouched" and it["primaryId"] not in seen_rec_ids:
                seen_rec_ids.add(it["primaryId"])
                recommended_untouched.append(
                    {
                        "subject": ds_subj,
                        "dataset": ds_name,
                        "id": it["primaryId"],
                        "kp": primary_kp,
                        "label": it["label"],
                        "url": it["url"],
                        "priority": it["priority"],
                    }
                )

        summary_rows.append({"name": ds_name, "subject": ds_subj, **counts})

    reason_rank = {"overdue": 0, "due_today": 1, "fail": 2, "fuzzy": 3, "scheduled": 4}
    reviewing_list.sort(key=lambda x: (reason_rank.get(x["reason"], 9), -x["priority"], x["id"]))
    recommended_untouched.sort(key=lambda x: (-x["priority"], x["dataset"], x["id"]))

    weak_kps = []
    for kp, c in kp_agg.items():
        if kp.endswith(".untagged"):
            continue
        score = c["fail"] * 3 + c["overdue"] * 2.5 + c["fuzzy"] * 1.5
        if score > 0:
            weak_kps.append({"kp": kp, "score": round(score, 1), **c})
    weak_kps.sort(key=lambda x: (-x["score"], -x["reviewing"], x["kp"]))

    return {
        "user": snapshot.get("user") or {},
        "exported_at": snapshot.get("exported_at"),
        "today": today,
        "subject": subject,
        "kp_filter": kp_filter,
        "total_marks_in_db": len(marks_by_id),
        "total_active_journal_entries": len(entries_by_source),
        "summary": summary_rows,
        "weak_kps": weak_kps[:limit],
        "reviewing": reviewing_list[: limit * 2],
        "recommended_untouched": recommended_untouched[:limit],
    }


def print_markdown(report: dict):
    user = report["user"].get("username") or "unknown"
    print(f"# 学习状态快照 · {user}（{report['today']}）")
    print(
        f"- 服务器导出时间：`{report['exported_at']}` | "
        f"库内已标记题数：**{report['total_marks_in_db']}** | "
        f"活跃复习条目：**{report['total_active_journal_entries']}**"
    )
    if report["kp_filter"]:
        print(f"- 考点筛选：`{report['kp_filter']}`")

    print("\n## 一、各题集进度总览")
    print("| 题集 | 总题数 | 已斩掉 | 复习中（含逾期） | 已会未斩 | 未做 |")
    print("| :--- | ---: | ---: | ---: | ---: | ---: |")
    for r in report["summary"]:
        rev_str = f"{r['reviewing']}（逾期 {r['overdue']}）" if r["overdue"] else str(r["reviewing"])
        print(f"| {r['name']} | {r['total']} | {r['retired']} | {rev_str} | {r['pass']} | {r['untouched']} |")

    if report["weak_kps"]:
        print("\n## 二、薄弱考点 TOP 榜")
        print("| 考点 ID | 紧迫分 | 不会 | 模糊 | 逾期 | 已斩 | 未做 |")
        print("| :--- | ---: | ---: | ---: | ---: | ---: | ---: |")
        for w in report["weak_kps"]:
            print(
                f"| `{w['kp']}` | {w['score']} | {w['fail']} | {w['fuzzy']} | "
                f"{w['overdue']} | {w['retired']} | {w['untouched']} |"
            )

    if report["reviewing"]:
        print("\n## 三、待复习 / 薄弱题目明细")
        for item in report["reviewing"]:
            due_txt = f" · 到期 {item['dueOn']}" if item["dueOn"] else ""
            note_txt = f" — 笔记：{item['note'][:80]}" if item["note"] else ""
            link_txt = f" ([直达]({item['url']}))" if item["url"] else ""
            print(
                f"- **[{item['reason']}]** `{item['kp']}` {item['label']}{due_txt}{note_txt}{link_txt}"
            )

    if report["recommended_untouched"]:
        print(f"\n## 四、考点 `{report['kp_filter']}` 未做补弱推荐（已跳过已斩题）")
        for item in report["recommended_untouched"]:
            link_txt = f" ([直达]({item['url']}))" if item["url"] else ""
            print(f"- `{item['dataset']}` {item['label']}{link_txt}")


def main():
    ap = argparse.ArgumentParser(description="聚合分析 /api/coach/snapshot 的数学/408刷题与复习进度")
    ap.add_argument("--base-url", default="")
    ap.add_argument("--from-file", default=None, help="快照 JSON 路径（省略则从标准输入 stdin 读取）")
    ap.add_argument("--subject", choices=("all", "math", "cs408"), default="all")
    ap.add_argument("--kp", default=None, help="按考点前缀筛选（如 calc.d1.mvt 或 os.mem）")
    ap.add_argument("--limit", type=int, default=15, help="榜单与推荐条目上限")
    ap.add_argument("--json", action="store_true", dest="as_json", help="以 JSON 格式输出聚合结果")
    args = ap.parse_args()

    if args.from_file:
        snapshot = json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    else:
        raw = sys.stdin.read().strip()
        if not raw:
            sys.exit("[ERROR] 请通过 --from-file 或标准输入管道传入快照 JSON。")
        snapshot = json.loads(raw)

    report = analyze(snapshot, args.base_url, args.subject, args.kp, args.limit)
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_markdown(report)


if __name__ == "__main__":
    main()
