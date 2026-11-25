#!/usr/bin/env python3
"""2026-11 数学考点去重的一次性重标（幂等，可重复执行）。

改动口径：
- calc.d1.ineq → calc.d1.mvt（微分等式/不等式证明并入中值定理）
- calc.i1.indef → calc.i1.tech（不定积分计算并入积分技巧）
- calc.m.formula 收窄为「散度、旋度与保守场」：格林/斯托克斯题归 calc.m.line2，
  高斯题归 calc.m.surf2，散度/旋度计算题保留 formula。真题辅助标签不动
  （这些题实质使用散度/旋度，收窄后语义仍成立）。

同步修改复核源与生成产物，保证回 Mac 重跑 gen_math1_analysis.py 结果一致：
- scripts/math1_question_review.json（主/辅标签、版本号）
- frontend/src/data/kg/math1Questions.json（仅 kpId/secondaryKpIds/version）
- docs/math1-question-review.md（按生成器同一逻辑重建审计表）
- frontend/public/math/{lilin880,zhangyu1000}.json 与 scripts/math_item_overlay.json

不改题干哈希、分值、页码与 facets；归档 PDF 不在本机时 gen_math1_analysis.py
的溯源校验无法执行，故用本脚本做纯标签替换，并复跑生成器的非 PDF 校验。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "scripts/math1_question_review.json"
GENERATED = ROOT / "frontend/src/data/kg/math1Questions.json"
REPORT = ROOT / "docs/math1-question-review.md"
MATH_TS = ROOT / "frontend/src/data/kg/math.ts"
OVERLAY = ROOT / "scripts/math_item_overlay.json"
CATALOGS = [ROOT / "frontend/public/math/lilin880.json", ROOT / "frontend/public/math/zhangyu1000.json"]
SPLIT_DIRS = [ROOT / "frontend/public/math/lilin880", ROOT / "frontend/public/math/zhangyu1000"]
# 与 frontend/src/lib/kg/catalogLoad.ts 的 PRACTICE_CATALOG_VER 保持一致（浏览器缓存失效用）。
CATALOG_VER = "split-20261113-kp-dedup"

ALIASES = {"calc.d1.ineq": "calc.d1.mvt", "calc.i1.indef": "calc.i1.tech"}
FORMULA = "calc.m.formula"
LINE2, SURF2 = "calc.m.line2", "calc.m.surf2"

# 逐题核对过的特殊归主：题目问什么，主考点就是什么。
FORMULA_SPECIAL = {
    "ll-hard-9-big-1-x2": ["calc.m.dbl", LINE2],      # 二重积分 ∫∫(x f_x + y f_y)，格林反用
    "zy-base-hs-18-9": ["calc.m.dbl", LINE2],         # 同上：二重积分转边界曲线积分
    "ll-hard-9-big-2-x2": [SURF2, "calc.m.surf"],     # 闭面通量（高斯）+ 第一类曲面积分小问
    "zy-hard-hs-18-10": ["calc.m.impl", LINE2],       # 球面法线几何为主，斯托克斯小问
    "zy-hard-hs-18-19": [LINE2, "calc.ode.1st"],      # 路径无关定 f(x)，化一阶线性方程
    "zy-hard-hs-18-20": [LINE2, "calc.m.ext"],        # 保守场 + 区域最值
}


def canon(kp: str) -> str:
    return ALIASES.get(kp, kp)


def dedup(seq: list[str]) -> list[str]:
    return list(dict.fromkeys(seq))


def retag_kp_list(kp_ids: list[str]) -> list[str]:
    return dedup([canon(k) for k in kp_ids])


def formula_target(item: dict) -> str | None:
    """返回 formula 应并入的考点；None 表示保留（散度/旋度计算题）。"""
    facets = set(item.get("facets") or [])
    if facets & {"curl", "curl_div"} and not facets & {"green", "stokes", "gauss", "conservative"}:
        return None
    if "gauss" in facets:
        return SURF2
    if facets & {"green", "stokes", "conservative"}:
        return LINE2
    rest = [k for k in item["kp_ids"] if k != FORMULA]
    if LINE2 in rest or SURF2 in rest:
        return ""  # 已有正确归属，直接去掉 formula
    stem = item.get("stem") or ""
    if "斯托克斯" in stem or "格林" in stem:
        return LINE2
    if "高斯" in stem:
        return SURF2
    if "散度" in stem or "旋度" in stem:
        return None
    raise SystemExit(f"无法判定 formula 归属，请人工复核：{item['id']} facets={sorted(facets)}")


def retag_catalog_item(item: dict) -> bool:
    old = item["kp_ids"]
    new = retag_kp_list(old)
    if FORMULA in new:
        if item["id"] in FORMULA_SPECIAL:
            new = FORMULA_SPECIAL[item["id"]]
        else:
            target = formula_target(item)
            if target is None:
                pass  # 散度/旋度题保留
            elif target == "":
                new = [k for k in new if k != FORMULA]
            else:
                new = dedup([target if k == FORMULA else k for k in new])
    if new != old:
        item["kp_ids"] = new
        return True
    return False


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump_preserve(path: Path, data) -> None:
    """按文件原有格式写回：紧凑（[{ 开头）或缩进 2，保留末尾换行，避免无谓重排。"""
    raw = path.read_text(encoding="utf-8")
    trailing = "\n" if raw.endswith("\n") else ""
    if raw.lstrip()[:2] in ("[{", "{\""):
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(text + trailing, encoding="utf-8")


def kp_names() -> dict[str, str]:
    return dict(re.findall(r'id: "([^"]+)", name: "([^"]+)"', MATH_TS.read_text(encoding="utf-8")))


def build_report(items, review, names) -> str:
    """与 gen_math1_analysis.build_report 同一逻辑（纯字符串，无 PDF 依赖）。"""
    lines = ["# 数学一 2009—2026 逐题分类复核", "", review["reviewMethod"], "",
             f"版本：`{review['version']}`；共 {len(items)} 题，18 年，每年 150 分，共 2700 分。", "",
             "- 考频：" + review["frequencyPolicy"], "- 分值：" + review["pointsPolicy"],
             "- 原题为社区重排版；来源与文件哈希见 `scripts/math1_exam_sources.json`、`scripts/math1_question_review.json`。",
             "- 下表的分值是整题分值，不能累加到每个辅助考点。考法可能是不同可行解法，不表示每种解法都必须使用。", "",
             "## 分年完整性", "", "| 年份 | 选择 | 填空 | 大题 | 总题数 | 总分 |", "|---|---:|---:|---:|---:|---:|"]
    for year in range(2009, 2027):
        qs = [q for q in items if q["year"] == year]
        counts = [sum(q["kind"] == kind for q in qs) for kind in ["mcq", "fill", "big"]]
        lines.append(f"| {year} | {' | '.join(map(str, counts))} | {len(qs)} | {sum(q['points'] for q in qs)} |")
    lines += ["", "## 考点考查统计（包含辅助考点，按年份去重）", "",
              "| 考点 | 题数 | 2009—2026 年份数 | 2022—2026 年份 | 主标签归属分值 |",
              "|---|---:|---:|---|---:|"]
    for kp in sorted({kp for q in items for kp in [q["kpId"], *q["secondaryKpIds"]]}):
        qs = [q for q in items if kp in [q["kpId"], *q["secondaryKpIds"]]]
        recent = sorted({q["year"] for q in qs if q["year"] >= 2022})
        lines.append(f"| {names[kp]} `{kp}` | {len(qs)} | {len({q['year'] for q in qs})} | {', '.join(map(str, recent)) or '无'} | {sum(q['points'] for q in qs if q['kpId'] == kp)} |")
    for year in range(2009, 2027):
        lines += ["", f"## {year} 年逐题记录", "", "| 题号 | 题型 / 分值 | 主考点 | 辅助考点 | 复核依据 | 原题 / 解析 |",
                  "|---|---|---|---|---|---|"]
        for q in [q for q in items if q["year"] == year]:
            kind = {"mcq": "选择", "fill": "填空", "big": "大题"}[q["kind"]]
            secondary = "、".join(names[kp] for kp in q["secondaryKpIds"]) or "—"
            base = "../frontend/public/math/exams/math1"
            links = f"[原题]({base}/{year}.pdf#page={q['paperPage']}) / [解析]({base}/answers/{year}-answer.pdf#page={q['answerPage']})"
            lines.append(f"| {q['n']} | {kind} / {q['points']} | {names[q['kpId']]} | {secondary} | {q['reviewReason']} | {links} |")
    return "\n".join(lines) + "\n"


def retag_exams(names: dict[str, str]) -> None:
    review = load_json(REVIEW)
    changed = 0
    for key, meta in review["questions"].items():
        kp = canon(meta["kpId"])
        secondary = dedup([canon(s) for s in meta["secondaryKpIds"]])
        secondary = [s for s in secondary if s != kp]
        if kp != meta["kpId"] or secondary != meta["secondaryKpIds"]:
            print(f"  真题 {key}: {meta['kpId']} → {kp}；辅 {meta['secondaryKpIds']} → {secondary}")
            meta["kpId"], meta["secondaryKpIds"] = kp, secondary
            changed += 1
    if review["version"].endswith("-v1"):
        review["version"] = review["version"][:-3] + "-v2-kp-dedup"
    dump_preserve(REVIEW, review)

    data = load_json(GENERATED)
    for q in data["items"]:
        kp = canon(q["kpId"])
        secondary = [s for s in dedup([canon(s) for s in q["secondaryKpIds"]]) if s != kp]
        q["kpId"], q["secondaryKpIds"] = kp, secondary
        q["book"] = "calc" if kp.startswith("calc.") else "linear" if kp.startswith("la.") else "prob"
    data["version"] = review["version"]
    dump_preserve(GENERATED, data)

    # —— 复跑生成器的非 PDF 校验 ——
    assert len(data["items"]) == 408
    by_key = {f"{q['year']}-{q['n']}": q for q in data["items"]}
    assert set(review["questions"]) == set(by_key), "复核源与产物题号不一致"
    for key, meta in review["questions"].items():
        q = by_key[key]
        assert q["kpId"] == meta["kpId"] and q["secondaryKpIds"] == meta["secondaryKpIds"], key
        assert q["kpId"] in names and all(s in names for s in q["secondaryKpIds"]), f"未知考点 {key}"
        assert q["kpId"] not in q["secondaryKpIds"], f"主辅重复 {key}"
    for year in range(2009, 2027):
        qs = [q for q in data["items"] if q["year"] == year]
        mcq_end, fill_end = (8, 14) if year <= 2020 else (10, 16)
        totals = {"mcq": [0, 0], "fill": [0, 0], "big": [0, 0]}
        for q in qs:
            kind = "mcq" if q["n"] <= mcq_end else "fill" if q["n"] <= fill_end else "big"
            assert q["kind"] == kind, (year, q["n"])
            totals[kind][0] += 1
            totals[kind][1] += q["points"]
        expect = {"mcq": [8, 32], "fill": [6, 24], "big": [9, 94]} if year <= 2020 \
            else {"mcq": [10, 50], "fill": [6, 30], "big": [6, 70]}
        assert totals == expect, (year, totals)
    REPORT.write_text(build_report(data["items"], review, names), encoding="utf-8")
    print(f"真题：{changed} 题主/辅标签更新，408 题校验通过，审计表已重建")


def retag_catalogs(names: dict[str, str]) -> None:
    overlay = load_json(OVERLAY)
    overlay_changed = 0
    keep_formula: set[str] = set()
    for path in CATALOGS:
        items = load_json(path)
        changed = 0
        for item in items:
            if retag_catalog_item(item):
                changed += 1
                print(f"  {item['id']}: → {item['kp_ids']}")
                ov = overlay.setdefault(item["id"], {})
                if ov.get("kp_ids") != item["kp_ids"]:
                    ov["kp_ids"] = list(item["kp_ids"])
                    overlay_changed += 1
            if FORMULA in item["kp_ids"]:
                keep_formula.add(item["id"])
        for item in items:
            assert all(k in names for k in item["kp_ids"]), f"未知考点 {item['id']}: {item['kp_ids']}"
        dump_preserve(path, items)
        print(f"{path.name}：{changed} 题重标，共 {len(items)} 题")
    # overlay 里其余条目也过一遍别名（含未进目录的旧条目）
    for oid, ov in overlay.items():
        if ov.get("kp_ids"):
            new = retag_kp_list(ov["kp_ids"])
            if new != ov["kp_ids"]:
                ov["kp_ids"] = new
                overlay_changed += 1
    for oid, ov in overlay.items():
        assert all(k in names for k in ov.get("kp_ids", [])), f"overlay 未知考点 {oid}"
        assert FORMULA not in ov.get("kp_ids", []) or oid in keep_formula, \
            f"overlay 残留 formula 且目录未保留：{oid}"
    dump_preserve(OVERLAY, overlay)
    print(f"overlay：{overlay_changed} 条更新")


def retag_split_catalogs(names: dict[str, str]) -> None:
    """分片版（应用实际加载的格式）以单体版为权威逐题同步 kp_ids，幂等。"""
    for monolith, directory in zip(CATALOGS, SPLIT_DIRS):
        truth = {q["id"]: q["kp_ids"] for q in load_json(monolith)}
        index_path = directory / "index.json"
        index = load_json(index_path)
        touched = 0
        for item in index["items"]:
            expected = truth.get(item["id"])
            assert expected is not None, f"分片 index 题不在单体版：{item['id']}"
            if item["kp_ids"] != expected:
                item["kp_ids"] = list(expected)
                touched += 1
        index["ver"] = CATALOG_VER
        dump_preserve(index_path, index)
        shard_touched = 0
        for shard in index["shards"]:
            path = directory / shard["file"]
            items = load_json(path)
            assert isinstance(items, list), f"分片应为数组：{path}"
            for item in items:
                expected = truth.get(item["id"])
                assert expected is not None, f"分片题不在单体版：{item['id']}"
                if item["kp_ids"] != expected:
                    item["kp_ids"] = list(expected)
                    shard_touched += 1
                assert all(k in names for k in item["kp_ids"]), f"未知考点 {item['id']}"
            dump_preserve(path, items)
        print(f"{directory.name}/：index {touched} 题、分片 {shard_touched} 题同步，ver → {CATALOG_VER}")


def main() -> None:
    names = kp_names()
    for old in ALIASES:
        assert old not in names, f"{old} 仍在 math.ts 中，请先删除考点定义"
    print("== 真题重标 ==")
    retag_exams(names)
    print("== 教辅重标 ==")
    retag_catalogs(names)
    print("== 分片题库同步 ==")
    retag_split_catalogs(names)
    print("完成。回 Mac 后可重跑 gen_math1_analysis.py --metadata-only 验证产物一致。")


if __name__ == "__main__":
    sys.exit(main())
