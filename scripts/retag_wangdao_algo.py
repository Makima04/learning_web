#!/usr/bin/env python3
"""数据结构算法设计题重标：主考点归入 ds.algo.design，按设计方法（方案 B）细分考法。

王道大题里「写一个算法/设计算法」类的题，原先只标结构考点（顺序表/链表/树…），
导致性价比页「综合题算法设计与复杂度」考点下只挂到 1 道。本脚本把算法设计题的主考点
改为 ds.algo.design（结构考点降为辅助），并打上按设计方法归类的考法 facet，与真题口径
一致（2013/2014/2017/2018/2020/2022/2025 算法设计题均以 ds.algo.design 主考）。

只改逐题核对源 wangdao_item_overlay.json 的 kp_ids/facets/primaryFacet/review_note，
不动题干（stem_sha256 不变）。改完跑 apply_wangdao_overlay.py 重建目录与分片。

用法：.venv/bin/python3 scripts/retag_wangdao_algo.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERLAY = ROOT / "scripts/wangdao_item_overlay.json"
ALGO = "ds.algo.design"

# 方案 B：按算法设计方法归类（跨结构）。每类 >= 2 道，避免抽检「代表题不足」。
METHODS: dict[str, list[str]] = {
    "扫描筛选与计数": ["2.2-1", "2.2-3", "2.2-4", "2.2-5", "2.2-12", "2.2-13", "2.3-7", "2.3-19"],
    "逆置重排与循环移动": ["2.2-2", "2.2-7", "2.2-10", "2.3-3", "2.3-14", "2.3-16", "2.3-20"],
    "多指针与有序序列": ["2.2-6", "2.2-9", "2.2-14", "2.3-8", "2.3-9", "7.2-6", "8.6-2"],
    "划分与第k选择": ["8.3-1", "8.3-2", "8.3-3", "8.3-4", "8.4-8", "8.6-3"],
    "分治递推与复杂度分析": ["2.2-11", "2.2-15", "1.2-1"],
    "链表指针操作": ["2.3-1", "2.3-2", "2.3-4", "2.3-5", "2.3-6", "2.3-10",
                 "2.3-11", "2.3-12", "2.3-13", "2.3-15", "2.3-17", "2.3-18"],
    "递归与遍历框架": ["5.2-5", "5.3-3", "5.3-4", "5.3-5", "5.3-6", "5.3-7", "5.3-8",
                 "5.3-9", "5.3-10", "5.3-11", "5.3-12", "5.3-13", "5.3-14", "5.3-15",
                 "5.3-16", "5.4-4", "5.4-5"],
    "栈与队列应用": ["3.1-3", "3.1-4", "3.1-5", "3.2-1", "3.2-2", "3.2-3", "3.2-4", "3.3-1", "8.4-7"],
    "图遍历与判定": ["6.2-5", "6.2-7", "6.2-8", "6.3-2", "6.3-3", "6.3-4", "6.3-5", "6.4-7", "6.4-13"],
    "查找与排序算法实现": ["2.2-8", "5.3-17", "7.2-4", "7.2-5", "7.3-5", "7.3-6", "7.3-7",
                    "7.3-8", "7.3-9", "7.3-10", "8.4-5", "8.4-6"],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    overlay = json.loads(OVERLAY.read_text(encoding="utf-8"))
    items = overlay["items"]
    qid_method = {f"ds-big-{suffix}": method for method, suffixes in METHODS.items() for suffix in suffixes}

    missing = [qid for qid in qid_method if qid not in items]
    if missing:
        raise ValueError(f"overlay 缺少题目：{missing}")

    changes = []
    for qid, method in qid_method.items():
        review = items[qid]
        facet = f"{ALGO}::{method}"
        old_kp = list(review["kp_ids"])
        # 主考点提到第一位，结构考点保留为辅助；原有考法 facet 保留作结构维度参考。
        new_kp = [ALGO] + [k for k in old_kp if k != ALGO]
        old_facets = list(review.get("facets") or [])
        new_facets = [facet] + [f for f in old_facets if f != facet]
        note = review.get("review_note") or ""
        addendum = f"算法设计题，主考归入 {facet}"
        new_note = note if addendum in note else (f"{note}；{addendum}" if note else addendum)
        review["kp_ids"] = new_kp
        review["facets"] = new_facets
        review["primaryFacet"] = facet
        review["review_note"] = new_note
        if old_kp != new_kp or old_facets != new_facets:
            changes.append((qid, old_kp, new_kp, method))

    overlay["version"] = "20261113"
    if "算法设计题主考归入 ds.algo.design" not in overlay.get("scope", ""):
        overlay["scope"] = overlay.get("scope", "") + "；算法设计题主考归入 ds.algo.design，按设计方法细分考法。"

    print(f"算法设计题 {len(qid_method)} 道，考法分布：")
    for method, count in Counter(qid_method.values()).most_common():
        print(f"  {method}: {count}")
    print(f"本次改动 {len(changes)} 道")
    if args.dry_run:
        print("dry-run，未写入")
        return
    shutil.copy2(OVERLAY, OVERLAY.with_suffix(".json.bak"))
    OVERLAY.write_text(json.dumps(overlay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写入 {OVERLAY.name}（备份 .json.bak）；接下来跑 apply_wangdao_overlay.py 重建目录。")


if __name__ == "__main__":
    main()