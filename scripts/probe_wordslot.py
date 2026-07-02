#!/usr/bin/env python
"""Find out WHY the English headwords aren't extracting.
Two hypotheses:
  H1: English headwords exist but use a font with a broken/missing ToUnicode CMap
      -> chars will be present in page.chars with non-empty .text (just wrong/garbage),
         OR present but .text == '' (unmappable).
  H2: This PDF is a Chinese-only review sheet (中文词表) with NO English headwords at all
      -> the x=53..139 region is genuinely empty.
We dump EVERY char in the left column's word-slot region on page 1.
"""
import pdfplumber

PDF = "2027考研英语红宝书（乱序版）中文词表.pdf"
with pdfplumber.open(PDF) as pdf:
    page = pdf.pages[0]
    # left column word slot: x in [53, 139], full height
    region = page.crop((53, 0, 139, page.height))
    chars = region.chars
    print(f"# chars in left-col word slot (53<x<139): {len(chars)}", flush=True)
    # show unique fonts and sizes
    fonts = {}
    for c in chars:
        fonts[c.get("fontname","?")] = fonts.get(c.get("fontname","?"),0)+1
    print("fonts in slot:", fonts, flush=True)
    # print first 40 chars with their text repr (to spot garbage/empty)
    for c in chars[:40]:
        print(f"x0={c['x0']:.1f} top={c['top']:.1f} font={c.get('fontname','?')[:18]:18} "
              f"size={c.get('size',0):.1f} text={c['text']!r} u={c.get('text','')!r}", flush=True)

    print("\n# ALSO: full raw text via page.extract_text() (first 1500 chars):", flush=True)
    print(page.extract_text()[:1500], flush=True)
