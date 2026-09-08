#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 words.json + CMUdict 生成 scripts/phonetics.json（english → 国际音标 IPA）。

供 gen_data.py 写入 data.js 第 4 栏。需 nltk cmudict（首次会下载）。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipa import lookup_ipa

SRC = "words.json"
DST = os.path.join(os.path.dirname(__file__), "phonetics.json")


def load_cmu():
    try:
        import nltk
        from nltk.corpus import cmudict
    except ImportError as e:
        raise SystemExit("需要 nltk：.venv/bin/pip install nltk") from e
    try:
        nltk.data.find("corpora/cmudict")
    except LookupError:
        nltk.download("cmudict", quiet=True)
    return cmudict.dict()


def main() -> None:
    if not os.path.exists(SRC):
        raise SystemExit(f"找不到 {SRC}，请先跑 extract_all.py")
    with open(SRC, encoding="utf-8") as f:
        words = json.load(f)
    cmu = load_cmu()
    out: dict[str, str] = {}
    missing: list[str] = []
    for w in words:
        en = w["english"]
        ipa = lookup_ipa(cmu, en)
        if ipa:
            out[en] = ipa
        else:
            missing.append(en)
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")
    print(f"=> wrote {DST}: {len(out)} unique / {len(words)} words, missing {len(missing)}")
    if missing:
        print("missing:", ", ".join(missing), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
