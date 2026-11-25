#!/usr/bin/env python3
"""从已抽取的题干重建王道关联与分片，无需重新 OCR。

用法：.venv/bin/python3 scripts/apply_wangdao_overlay.py
逐题标注源在 wangdao_item_overlay.json；原题图与对应版本的做题本页码见
wangdao_question_images.json。不修改 OCR 题干、答案或题目 ID。
"""
from __future__ import annotations

import json
import re
import argparse
from collections import Counter

from split_practice_catalogs import split_public_catalog
from wangdao_overlay import ROOT, apply_reviewed_overlay, reviewed_items


def rebuild(check: bool = False) -> None:
    source = ROOT / "papers/cs408/wangdao2027/questions.json"
    public = ROOT / "frontend/public/cs408/wangdao2027.json"
    catalog = json.loads(public.read_text(encoding="utf-8"))
    # 干净检出也可仅凭已入库题干和标注源重建；本地 OCR 中间产物存在时一并更新。
    has_source = source.is_file()
    questions = json.loads(source.read_text(encoding="utf-8")) if has_source else [dict(q) for q in catalog]
    names = dict(re.findall(r'\{ id: "([^"]+)", name: "([^"]+)"',
                          (ROOT / "frontend/src/data/kg/cs408.ts").read_text(encoding="utf-8")))
    by_id = {q["id"]: q for q in questions}
    big_ids = {q["id"] for q in questions if q["kind"] == "big"}
    if big_ids != set(reviewed_items()):
        raise ValueError(f"大题标注不完整：漏标 {big_ids - set(reviewed_items())}，多标 {set(reviewed_items()) - big_ids}")
    # 所有校验完成后才写产物，避免核对失败时留下半份题库。
    changes = []
    for qid, review in reviewed_items().items():
        if any(kp not in names for kp in review["kp_ids"]):
            raise ValueError(f"{qid}: 未知考点")
        q = by_id[qid]
        old = list(q["kp_ids"])
        apply_reviewed_overlay(q)
        if has_source:
            q["kp_names"] = [names[kp] for kp in q["kp_ids"]]
        if old != q["kp_ids"]:
            changes.append((qid, old, q["kp_ids"]))
    for q in catalog:
        apply_reviewed_overlay(q)
    if {q["id"] for q in catalog} != set(by_id):
        raise ValueError("完整目录与抽取源的题目 ID 不一致")
    if check:
        if (has_source and questions != json.loads(source.read_text(encoding="utf-8"))) or catalog != json.loads(public.read_text(encoding="utf-8")):
            raise ValueError("关联产物已过期，请运行 scripts/apply_wangdao_overlay.py")
        print(f"核对通过：{len(big_ids)} 道大题的源标注与产物一致")
        return
    if has_source:
        source.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    public.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    split_public_catalog(public)
    counts = Counter((q["book"], q["section"].split(".")[0]) for q in questions if q["kind"] == "big")
    print(f"已复核 {sum(counts.values())} 道大题 / {len(counts)} 章，本次更新关联 {len(changes)} 道")
    for qid, old, new in changes:
        print(f"{qid}: {','.join(old) or '无'} -> {','.join(new) or '无独立考点'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只校验，不写入")
    rebuild(parser.parse_args().check)
