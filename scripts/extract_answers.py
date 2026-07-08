#!/usr/bin/env python3
"""extract_answers.py — 从考研真题 PDF 末页答案区抽取选择题答案，写回 papers/*.json。

答案页特征：含「...真题答案」「参考真题答案」「答案与解析」标题行。目前 2010-2019
（英一）+ en2 的 2010-2012/2014-2020 PDF 末页带答案区；其余年份无答案页，跳过（由
llm_answers.py 用 LLM 补）。

答案格式（统一）：
  完形：    1.A 2.B 3.C ... 20.D
  阅读 A：  Text1 21~25 A D D C D  Text2 26~30 ...
  新题型：  41.C 42.F 43.D 44.E 45.G  （英二可能 41.T/42.f 判断题）

输出：papers/<year>.json 顶层加 / 更新 `answers` 字段（{"1":"A","21":"A","41":"C",...}，
题号全局平铺；完形 1-20 / 阅读 A 21-40 / 新题型 41-45 天然不冲突）。幂等：重跑覆盖。
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent

# 答案页标题行
ANSWER_HEADING_RE = re.compile(r"(?:真题|试题|参考真题)\s*答案|答案与解析")

# 完形 / 新题型：N.X / N、X / N．X。字母范围 A-H + T/F（en2 判断题）
NUM_LETTER_RE = re.compile(r"(\d+)\s*[\.．、]\s*([A-Ha-hTtFf])")
# 阅读 A：Text<N> <start>~<end> <letters...>。字母间可能无空格（"ADB CB"），
# 故 group 4 用 [A-D](?:[A-D]|\s+[A-D])*，再 re.findall(r'[A-D]') 拆开。
TEXT_RANGE_RE = re.compile(
    r"Text\s*(\d+)\s+(\d+)\s*[~\-–—]+\s*(\d+)\s+([A-D](?:[A-D]|\s+[A-D]){0,9})"
)
# en2 判断题：41.T 42.F（已含在 NUM_LETTER_RE 的 [A-HT-Ft-f] 里）


def find_answer_text(pdf):
    """返回答案区全文：从首个含答案标题行的页起，到文末拼接所有剩余页。

    部分 PDF（如 2012）答案标题在某页末尾，实际答案序列在下一页——单取标题页
    会漏。改为：找到标题页后，拼接该页及之后所有页的文本一起解析。
    """
    out = []
    started = False
    for page in pdf.pages:
        t = page.extract_text() or ""
        if not started and ANSWER_HEADING_RE.search(t):
            started = True
        if started:
            out.append(t)
    return "\n".join(out) if out else None


def parse_answers(text):
    """从答案页文本解析 {题号: 字母}。题号限定 1-45。"""
    ans = {}
    # 完形 + 新题型
    for m in NUM_LETTER_RE.finditer(text):
        n = int(m.group(1))
        if 1 <= n <= 45:
            ans[n] = m.group(2).upper()
    # 阅读 A：Text1 21~25 ADB CB —— 上面 NUM_LETTER_RE 会把 "21" 配 "A"、
    # "25" 配下一个字母等，错配。用 Text 范围式覆盖，findall 拆字母。
    for m in TEXT_RANGE_RE.finditer(text):
        start = int(m.group(2))
        letters = re.findall(r"[A-D]", m.group(4))
        for i, l in enumerate(letters):
            n = start + i
            if 21 <= n <= 40:
                ans[n] = l.upper()
    return ans


def extract_for_paper(pdf_path):
    """返 {n: letter} 或 None（无答案页）。"""
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            text = find_answer_text(pdf)
            if text is None:
                return None
            return parse_answers(text)
    except Exception as e:
        print(f"  {pdf_path}: 读取失败 {e}", file=sys.stderr)
        return None


def main():
    # 扫 papers/*.json + papers/en2/*.json
    json_files = sorted(ROOT.glob("papers/*.json")) + sorted(ROOT.glob("papers/en2/*.json"))
    if not json_files:
        print("no paper.json found", file=sys.stderr)
        sys.exit(1)

    extracted = 0
    skipped = 0
    for jf in json_files:
        data = json.loads(jf.read_text(encoding="utf-8"))
        year = data.get("year")
        # PDF 路径：与 json 同目录同名 .pdf
        pdf_path = jf.with_suffix(".pdf")
        if not pdf_path.exists():
            print(f"{year} ({jf.parent.name}): PDF 不存在，跳过")
            skipped += 1
            continue
        ans = extract_for_paper(pdf_path)
        if not ans:
            print(f"{year} ({jf.parent.name}): 无答案页，跳过")
            skipped += 1
            continue
        # 写回 json 顶层 answers
        data["answers"] = {str(k): v for k, v in sorted(ans.items())}
        # variant 推断（与 match_vocab 一致）
        if "variant" not in data:
            data["variant"] = "en2" if "en2" in str(jf).replace("\\", "/") else "en1"
        jf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{year} ({jf.parent.name}): 抽出 {len(ans)} 个答案")
        extracted += 1
    print(f"\ndone: {extracted} papers extracted, {skipped} skipped")


if __name__ == "__main__":
    main()
