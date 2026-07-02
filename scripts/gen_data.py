#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert words.json -> frontend/public/data.js as a compact nested array.

Why a JS file instead of fetch(words.json):
  - Opening index.html via file:// blocks fetch() with CORS, but classic
    <script src="data.js"> loads fine. So the app runs by double-click.
    （现 React 版跑在 http，但沿用 script 全局加载 8MB 数据，避免 JSON parse 阻塞。）
Format (short keys, arrays not objects):
  window.WORDS = [[index, english, [[pos, cn], ...]], ...]
"""
import json, os

SRC = "words.json"
DST = "frontend/public/data.js"

def main():
    with open(SRC, encoding="utf-8") as f:
        words = json.load(f)
    out = []
    for w in words:
        senses = [[s["pos"], s["cn"]] for s in w["senses"]]
        out.append([w["index"], w["english"], senses])
    os.makedirs("web", exist_ok=True)
    with open(DST, "w", encoding="utf-8") as f:
        f.write("/* auto-generated from words.json — do not edit by hand */\n")
        f.write("window.WORDS=")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    size = os.path.getsize(DST)
    print(f"=> wrote {DST}: {len(out)} words, {size/1024:.0f} KB")

if __name__ == "__main__":
    main()
