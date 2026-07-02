#!/usr/bin/env python
"""Re-probe the NEW complete PDF (A4默写版) to see if English headwords are present.

Key questions:
  Q1: What columns does page 1 actually have? (序号 / 英文 / 词性 / 中文)
  Q2: Are English headwords present as extractable text, or still missing/garbled?
  Q3: If garbled — what fonts do the English chars use (broken ToUnicode CMap)?
"""
import pdfplumber
import sys

PDF = "2027考研英语红宝书（乱序版）A4默写版.pdf"

with pdfplumber.open(PDF) as pdf:
    print(f"# pages={len(pdf.pages)}", flush=True)
    for pno in [1, 2]:
        page = pdf.pages[pno - 1]
        print(f"\n===== PAGE {pno}  size={page.width}x{page.height}  chars={len(page.chars)} =====", flush=True)

        # 1) all words with full positional/font info
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False,
                                   split_at_punctuation=False, extra_attrs=["fontname", "size"])
        print(f"# words extracted: {len(words)}", flush=True)
        for w in words[:60]:
            print(f"x0={w['x0']:6.1f} x1={w['x1']:6.1f} top={w['top']:6.1f} "
                  f"size={w.get('size',0):4.1f} font={w.get('fontname','?')[:22]:22} | {w['text']}", flush=True)

        # 2) font census across the whole page — spot a broken-CMap Latin font
        fonts = {}
        for c in page.chars:
            fonts[c.get("fontname","?")] = fonts.get(c.get("fontname","?"),0)+1
        print("\n# font census (name: count):", flush=True)
        for fn, n in sorted(fonts.items(), key=lambda x:-x[1]):
            print(f"   {fn:40} {n}", flush=True)

        # 3) dump first 60 chars in raw form to spot empty-text / garbage Latin
        print("\n# first 60 raw chars (text repr):", flush=True)
        for c in page.chars[:60]:
            print(f"  x0={c['x0']:6.1f} top={c['top']:6.1f} size={c.get('size',0):4.1f} "
                  f"font={c.get('fontname','?')[:22]:22} text={c.get('text','')!r}", flush=True)

        # 4) full extract_text for context
        print("\n# page.extract_text() (first 1200 chars):", flush=True)
        print(page.extract_text()[:1200], flush=True)
