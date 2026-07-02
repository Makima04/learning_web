#!/usr/bin/env python
"""Inspect PDF with word positions, font, and size using pdfplumber.

Goal: understand the exact layout so we can reconstruct the Word/Meaning table.
We want, per word: index, headword, part-of-speech, Chinese meaning, English (if any).
"""
import pdfplumber
import sys

PDF = "2027考研英语红宝书（乱序版）中文词表.pdf"

with pdfplumber.open(PDF) as pdf:
    print(f"# pages={len(pdf.pages)}", flush=True)
    for pno in [1]:
        page = pdf.pages[pno - 1]
        print(f"\n===== PAGE {pno}  size={page.width}x{page.height} =====", flush=True)
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False,
                                   split_at_punctuation=False, extra_attrs=["fontname", "size"])
        print(f"# words extracted: {len(words)}", flush=True)
        for w in words[:120]:
            print(f"x0={w['x0']:.1f} x1={w['x1']:.1f} top={w['top']:.1f} bottom={w['bottom']:.1f} "
                  f"size={w.get('size',0):.1f} font={w.get('fontname','?')[:20]:20} | {w['text']}", flush=True)
        # also try table extraction
        try:
            tables = page.find_tables()
            print(f"\n# tables found: {len(tables)}", flush=True)
            if tables:
                t = tables[0].extract()
                for r in t[:20]:
                    print("ROW:", r, flush=True)
        except Exception as e:
            print("table err", e, flush=True)
