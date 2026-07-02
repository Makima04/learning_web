#!/usr/bin/env python
"""Confirm layout across pages: index continuation, two-block structure, multi-line entries."""
import pdfplumber

PDF = "2027考研英语红宝书（乱序版）A4默写版.pdf"

with pdfplumber.open(PDF) as pdf:
    print(f"# total pages={len(pdf.pages)}", flush=True)
    for pno in [1, 2, 3, 100, 200, 327, 328]:
        page = pdf.pages[pno - 1]
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False,
                                   split_at_punctuation=False, extra_attrs=["fontname", "size"])
        # split into left block (x0<300) and right block (x0>=300)
        left = [w for w in words if w['x0'] < 300]
        right = [w for w in words if w['x0'] >= 300]
        # left: indices are size 7.5 at x0<60; english is size 9.0 at x0>=60
        l_idx = sorted([w for w in left if w.get('size',0) < 8.5 and w['x0'] < 60], key=lambda w:w['top'])
        l_eng = sorted([w for w in left if w.get('size',0) >= 8.5], key=lambda w:w['top'])
        r_idx = sorted([w for w in right if w['x0'] < 320], key=lambda w:w['top'])
        r_mean = sorted([w for w in right if w['x0'] >= 390], key=lambda w:w['top'])
        print(f"\n===== PAGE {pno}  left_idx={[w['text'] for w in l_idx]} =====", flush=True)
        print(f"  left_eng = {[w['text'] for w in l_eng]}", flush=True)
        print(f"  right_idx= {[w['text'] for w in r_idx]}", flush=True)
        print(f"  right_mean(tops+text):", flush=True)
        for w in r_mean[:25]:
            print(f"    top={w['top']:6.1f} x0={w['x0']:6.1f} | {w['text']}", flush=True)
