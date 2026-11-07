#!/usr/bin/env python3
"""把 408 大题分类/答题模板内容源编译成前端数据与通读文档。

输入：
  papers/cs408/big_question_guide.json   人工维护的分类、模板、思路、逐题索引
  papers/cs408/<year>.json               题库（题干、考点、答案/解析）
  frontend/src/data/kg/cs408.ts          知识点 id → 名称（关联校验）

输出：
  frontend/public/cs408/big-guide.json   前端查阅页数据
  papers/cs408/BIG_QUESTIONS.md          可通读的分类与模板文档

用法： .venv/bin/python3 scripts/gen_cs408_big_guide.py
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUIDE = ROOT / "papers/cs408/big_question_guide.json"
PAPERS = ROOT / "papers/cs408"
KP_SOURCE = ROOT / "frontend/src/data/kg/cs408.ts"
OUT_JSON = ROOT / "frontend/public/cs408/big-guide.json"
OUT_MD = ROOT / "papers/cs408/BIG_QUESTIONS.md"

FAMILY_LABEL = {"ds": "数据结构", "co": "组成原理", "os": "操作系统", "cn": "计算机网络"}


def load_kp_names() -> dict[str, str]:
    src = KP_SOURCE.read_text(encoding="utf-8")
    return dict(re.findall(r'\{ id: "([a-z][a-z0-9.\-]+)", name: "([^"]+)"', src))


def load_papers() -> tuple[dict[str, dict], list[int]]:
    items: dict[str, dict] = {}
    years: list[int] = []
    for p in sorted(PAPERS.glob("20*.json")):
        if not re.fullmatch(r"\d{4}\.json", p.name):
            continue
        year = int(p.stem)
        years.append(year)
        paper = json.loads(p.read_text(encoding="utf-8"))
        for it in paper.get("items") or []:
            if it.get("kind") != "big":
                continue
            items[f"{year}-{it['n']}"] = {"year": year, **it}
    return items, years


def main() -> int:
    guide = json.loads(GUIDE.read_text(encoding="utf-8"))
    papers, years = load_papers()
    kp_names = load_kp_names()

    types = guide["types"]
    type_by_id = {t["id"]: t for t in types}
    mapping = guide["items"]

    # --- 校验：宁可中断，也不要产出半份错数据 ---
    errors: list[str] = []
    missing = sorted(set(papers) - set(mapping))
    extra = sorted(set(mapping) - set(papers))
    if missing:
        errors.append(f"未分类的大题 ({len(missing)}): {missing}")
    if extra:
        errors.append(f"映射指向不存在的题 ({len(extra)}): {extra}")
    for key, m in mapping.items():
        if m["type"] not in type_by_id:
            errors.append(f"{key}: 未知类型 {m['type']}")
            continue
        fam = type_by_id[m["type"]]["family"]
        if key in papers and papers[key].get("book") != fam:
            errors.append(f"{key}: 分类分科 {fam} 与题库 {papers[key].get('book')} 不一致")
    for t in types:
        for kp in t["kpIds"]:
            if kp not in kp_names:
                errors.append(f"{t['id']}: 知识点 {kp} 不在 cs408.ts")
    if errors:
        for e in errors:
            print("ERROR", e, file=sys.stderr)
        return 1

    # --- 组装每类的真题 ---
    questions_by_type: dict[str, list[dict]] = defaultdict(list)
    for key, m in sorted(mapping.items(), key=lambda kv: (int(kv[0][:4]), int(kv[0].split("-")[1]))):
        it = papers[key]
        kps = [
            k.get("id") if isinstance(k, dict) else str(k)
            for k in (it.get("kps") or [])
        ]
        questions_by_type[m["type"]].append({
            "year": it["year"],
            "n": it["n"],
            "book": it.get("book"),
            "bookName": FAMILY_LABEL.get(it.get("book"), it.get("book")),
            "topic": m["topic"],
            "note": m.get("note") or "",
            "kps": [k for k in kps if k],
            "hasAnswer": bool(it.get("answer")),
            "hasExplanation": bool(it.get("explanation")),
            "stemBrief": re.sub(r"\s+", " ", it.get("stem") or "")[:96],
        })

    out_types = []
    for t in types:
        qs = questions_by_type[t["id"]]
        out_types.append({
            **t,
            "familyName": FAMILY_LABEL[t["family"]],
            "count": len(qs),
            "years": sorted({q["year"] for q in qs}),
            "kpNames": [{"id": k, "name": kp_names.get(k, k)} for k in t["kpIds"]],
            "questions": qs,
        })

    by_year = Counter(q["year"] for qs in questions_by_type.values() for q in qs)
    payload = {
        "version": guide["version"],
        "scope": guide["scope"],
        "note": guide["note"],
        "total": len(papers),
        "type_count": len(types),
        "years": years,
        "families": guide["families"],
        "types": out_types,
        "stats": {
            "by_family": {
                f: sum(t["count"] for t in out_types if t["family"] == f)
                for f in ("ds", "co", "os", "cn")
            },
            "by_year": {str(y): by_year[y] for y in years},
            "with_answer": sum(q["hasAnswer"] for qs in questions_by_type.values() for q in qs),
            "with_explanation": sum(q["hasExplanation"] for qs in questions_by_type.values() for q in qs),
        },
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # --- Markdown 通读版 ---
    lines: list[str] = []
    add = lines.append
    add(f"# 408 大题分类 · 答题模板与知识点关联（{years[0]}–{years[-1]}）")
    add("")
    add(
        f"> 覆盖 **{len(papers)} 道综合应用题 / {len(years)} 套卷 / {len(types)} 类解题范式**。  "
        f"由 `scripts/gen_cs408_big_guide.py` 从 `big_question_guide.json` + 题库生成，勿直接改本文件。"
    )
    add("")
    add(guide["note"])
    add("")
    add("## 一、总览")
    add("")
    add("| 分科 | 类型 | 题数 | 出现年份 | 解题范式 |")
    add("|---|---|---:|---|---|")
    for t in out_types:
        yr = "、".join(str(y) for y in t["years"])
        add(f"| {t['familyName']} | [{t['name']}](#{t['id']}) | {t['count']} | {yr} | {t['paradigm']} |")
    add("")
    add("**分科题数**：" + " · ".join(f"{FAMILY_LABEL[f]} {v}" for f, v in payload["stats"]["by_family"].items()))
    add("")
    add("**高频范式 Top 5**：" + " · ".join(
        f"{t['name']} {t['count']} 题" for t in sorted(out_types, key=lambda x: -x["count"])[:5]
    ))
    add("")
    add("## 二、分类详解（模板 / 思路 / 易错 / 知识点）")
    add("")
    for fam in ("ds", "co", "os", "cn"):
        add(f"### {FAMILY_LABEL[fam]}")
        add("")
        for t in [x for x in out_types if x["family"] == fam]:
            add(f'<a id="{t["id"]}"></a>')
            add(f"#### {t['name']}（{t['count']} 题）")
            add("")
            add(f"*{t['subtitle']} · {t['paradigm']}*")
            add("")
            add("**答题模板**")
            add("")
            for s in t["template"]:
                add(s)
                add("")
            add("**思路与常用技巧**")
            add("")
            for s in t["ideas"]:
                add(f"- {s}")
            add("")
            add("**易错点**")
            add("")
            for s in t["pitfalls"]:
                add(f"- {s}")
            add("")
            add("**知识点关联**：" + " · ".join(
                f"`{k['id']}`（{k['name']}）" for k in t["kpNames"]
            ))
            add("")
            add("**历年真题**")
            add("")
            add("| 年份·题号 | 本题切入要点 | 备注 |")
            add("|---|---|---|")
            for q in t["questions"]:
                add(f"| {q['year']}·{q['n']} | {q['topic']} | {q['note']} |")
            add("")
    add("## 三、按年份速查")
    add("")
    add("| 年份 | 41–47 题归类 |")
    add("|---|---|")
    for y in years:
        row = []
        for n in range(41, 48):
            key = f"{y}-{n}"
            if key in mapping:
                row.append(f"{n} {type_by_id[mapping[key]['type']]['name']}")
        add(f"| {y} | " + "；".join(row) + " |")
    add("")
    add("## 四、维护说明")
    add("")
    add("- 新增题型、改模板、改逐题主题：编辑 `papers/cs408/big_question_guide.json`，再跑 "
        "`.venv/bin/python3 scripts/gen_cs408_big_guide.py`。")
    add("- 脚本会校验：126 题全覆盖、类型 id 合法、分科与题库 `book` 一致、知识点 id 存在于 `cs408.ts`；"
        "任一不满足即报错中止，不会生成半份数据。")
    add("- 前端查阅页读取 `frontend/public/cs408/big-guide.json`；内容变更后需同步 `big_question_guide.json` "
        "里的 `version`，页面按该字段绕过缓存。")
    add("- 模板是解题骨架，不是标准答案；具体数值与结论以 `papers/cs408/<year>.json` 的参考答案/解析及原卷为准。")
    add("")
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")

    print(f"OK: {len(papers)} 题 / {len(types)} 类 / {len(years)} 套卷")
    print(f"  -> {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size // 1024} KB)")
    print(f"  -> {OUT_MD.relative_to(ROOT)} ({OUT_MD.stat().st_size // 1024} KB)")
    print("分科:", payload["stats"]["by_family"])
    print("答案/解析覆盖:", payload["stats"]["with_answer"], payload["stats"]["with_explanation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
