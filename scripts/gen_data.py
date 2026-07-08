#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert words.json -> web/data.js as a compact nested array.

Why a JS file instead of fetch(words.json):
  - Opening index.html via file:// blocks fetch() with CORS, but classic
    <script src="data.js"> loads fine. So the app runs by double-click.
生成 web/data.js 作为 window.WORDS 紧凑嵌套数组，供 web/ 前端经典 script 加载。
Format (short keys, arrays not objects):
  window.WORDS = [[index, english, [[pos, cn], ...]], ...]
"""
import hashlib, json, os

SRC = "words.json"
DST = "web/data.js"

def main():
    with open(SRC, encoding="utf-8") as f:
        words = json.load(f)
    out = []
    for w in words:
        senses = [[s["pos"], s["cn"]] for s in w["senses"]]
        out.append([w["index"], w["english"], senses])
    os.makedirs("web", exist_ok=True)
    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    whash = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    with open(DST, "w", encoding="utf-8") as f:
        f.write("/* auto-generated from words.json — do not edit by hand */\n")
        f.write("window.WORDS=" + payload + ";\n")
        f.write(f"window.WORDS_META={{version:{whash!r},count:{len(out)}}};\n")
    size = os.path.getsize(DST)
    print(f"=> wrote {DST}: {len(out)} words, {size/1024:.0f} KB")

if __name__ == "__main__":
    main()
