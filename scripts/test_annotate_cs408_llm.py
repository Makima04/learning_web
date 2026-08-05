#!/usr/bin/env python3
"""离线单测：LLM JSON 解析与多标签校验（不调网关）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from annotate_cs408_llm import parse_llm_json, validate_kps  # noqa: E402


def test_parse_fenced():
    raw = parse_llm_json(
        """```json
{"kps":[{"id":"ds.tree.bt","role":"primary","confidence":0.9}],"rationale":"x"}
```"""
    )
    assert raw["kps"][0]["id"] == "ds.tree.bt"


def test_multilabel_validate():
    valid = {
        "ds.graph.store": "邻接矩阵",
        "ds.algo.design": "算法设计",
        "co.mem.cache": "Cache",
    }
    raw = {
        "kps": [
            {"id": "ds.algo.design", "role": "secondary", "confidence": 0.8},
            {"id": "ds.graph.store", "role": "primary", "confidence": 0.95},
            {"id": "fake.id", "role": "primary", "confidence": 1.0},
            {"id": "co.mem.cache", "role": "secondary", "confidence": 0.4},
        ]
    }
    kps = validate_kps(raw, valid, primary_book="ds")
    ids = [k["id"] for k in kps]
    assert "fake.id" not in ids
    assert ids[0] == "ds.graph.store"
    assert kps[0]["role"] == "primary"
    assert "ds.algo.design" in ids
    # 跨书 secondary 允许保留
    assert "co.mem.cache" in ids


def test_force_primary_if_missing():
    valid = {"os.proc.sync": "同步", "os.proc.sched": "调度"}
    raw = {
        "kps": [
            {"id": "os.proc.sync", "role": "secondary", "confidence": 0.6},
            {"id": "os.proc.sched", "role": "secondary", "confidence": 0.9},
        ]
    }
    kps = validate_kps(raw, valid, primary_book="os")
    assert sum(1 for k in kps if k["role"] == "primary") == 1
    assert kps[0]["id"] == "os.proc.sched"


if __name__ == "__main__":
    test_parse_fenced()
    test_multilabel_validate()
    test_force_primary_if_missing()
    print("ok")
