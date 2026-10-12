#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert words.json -> web/data.js as window.WORDS compact nested array.

web/ 仅作数据产物目录；前端 React 构建时把 data.js 拷进 frontend/public。
Format: window.WORDS = [[index, english, [[pos, cn], ...], phonetic?], ...]
音标来自 scripts/phonetics.json（国际音标 IPA，gen_phonetics.py 生成）；缺则省略第 4 栏。

另写 web/wordinfo.js：window.WORD_INFO = {english: [parts, note, syn, ant, sim, rel]}，
来自 scripts/wordinfo.json（gen_wordinfo.py 生成），前端卡片按需懒加载。
"""
import hashlib
import json
import os

SRC = "words.json"
DST = "web/data.js"
INFO_DST = "web/wordinfo.js"
PHONETICS = os.path.join(os.path.dirname(__file__), "phonetics.json")
WORDINFO = os.path.join(os.path.dirname(__file__), "wordinfo.json")


def write_wordinfo(words):
    if not os.path.exists(WORDINFO):
        print(f"skip {INFO_DST}: 缺 {WORDINFO}（先跑 gen_wordinfo.py）")
        return
    with open(WORDINFO, encoding="utf-8") as f:
        info = json.load(f)
    out = {}
    for w in words:
        en = w["english"]
        it = info.get(en)
        if not it:
            continue
        row = [it.get("p") or [], it.get("n") or ""]
        for k in ("syn", "ant", "sim", "rel"):
            row.append(it.get(k) or [])
        if any(row):
            out[en] = row
    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    with open(INFO_DST, "w", encoding="utf-8") as f:
        f.write("/* auto-generated from scripts/wordinfo.json — do not edit by hand */\n")
        f.write("window.WORD_INFO=" + payload + ";\n")
    size = os.path.getsize(INFO_DST)
    print(f"=> wrote {INFO_DST}: {len(out)} words, {size / 1024:.0f} KB")


def main():
    with open(SRC, encoding="utf-8") as f:
        words = json.load(f)
    phonetics = {}
    if os.path.exists(PHONETICS):
        with open(PHONETICS, encoding="utf-8") as f:
            phonetics = json.load(f)
    out = []
    for w in words:
        senses = [[s["pos"], s["cn"]] for s in w["senses"]]
        row = [w["index"], w["english"], senses]
        ipa = phonetics.get(w["english"]) or ""
        if ipa:
            row.append(ipa)
        out.append(row)
    os.makedirs("web", exist_ok=True)
    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    whash = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    with open(DST, "w", encoding="utf-8") as f:
        f.write("/* auto-generated from words.json — do not edit by hand */\n")
        f.write("window.WORDS=" + payload + ";\n")
        f.write(f"window.WORDS_META={{version:{whash!r},count:{len(out)}}};\n")
    size = os.path.getsize(DST)
    print(f"=> wrote {DST}: {len(out)} words, {size / 1024:.0f} KB")
    write_wordinfo(words)


if __name__ == "__main__":
    main()
