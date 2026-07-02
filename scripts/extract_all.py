#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Extract the full word table from the A4默写版 PDF.

Layout (confirmed across 328 pages, identical structure):
  - 328 pages, 20 words/page (last page 10) => 6550 words. Footer says 共6550词.
  - Each page = two blocks side by side:
      LEFT  (x0<300):  序号(size7.5, x0<60, pure digit) + 英文(size9.0, 60<=x0<300)
      RIGHT (x0>=300): 序号(size7.5, 300<=x0<325, pure digit) + 词性(x0~400-435) + 中文释义(x0>=408)
    Left序号 and right序号 carry the SAME global number on a page, so we pair by integer index.
  - Multi-sense entries (e.g. 4 radical, 8 scale) occupy several right-block lines but one left english line;
    we assign every right meaning-line to the nearest right-序号 by top, and merge.
  - Multi-token / wrapped english (according to, air-conditioning) merge by nearest left-序号.

Output:
  words.json  -- [{index, english, senses:[{pos,cn}, ...]}, ...]  (6550 entries, index-sorted)
  words.csv   -- flat: index,english,pos,cn  (one row per sense)
  report.txt  -- validation: totals, missing fields, sample spot-checks, anomalies
"""
import pdfplumber, re, json, csv, sys
from collections import defaultdict

PDF = "2027考研英语红宝书（乱序版）A4默写版.pdf"
POS_RE = re.compile(r"^[a-z]{1,8}\.$")  # any short lowercase abbr ending in '.' : n. v. vt. vi. adj. adv. prep. conj. det. ord. modal. usage. vlink. abbr. ...
SPACING = 33.7  # row pitch; half ~16.85, so nearest-match within a page is unambiguous
HEADER_TOP = 95.0  # header labels (Word/Meaning/扫码听单词/纸上默写) live at top<95; data rows start ~108
HEADER_TXT = {"Word", "Meaning", "扫码听单词", "纸上默写，⽿边复习", "纸上默写，耳边复习"}

def is_index_tok(w):
    return w.get("size", 0) < 8.5 and re.fullmatch(r"\d+", w["text"].strip()) is not None

def line_key(w):
    return round(w["top"] / 2)  # bucket tops within ~2px into one line

def extract_page(page, pno, anomalies):
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False,
                               split_at_punctuation=False, extra_attrs=["fontname", "size"])
    # ---- LEFT block ----
    l_idx = [w for w in words if w["x0"] < 60 and is_index_tok(w)]
    l_eng = [w for w in words if w.get("size", 0) >= 8.5 and 60 <= w["x0"] < 300]
    # ---- RIGHT block ----
    r_idx = [w for w in words if 300 <= w["x0"] < 325 and is_index_tok(w) and w["top"] >= HEADER_TOP]
    # meaning tokens: right block, below header, exclude header labels; pos+cn columns
    r_mean = [w for w in words if w["x0"] >= 390 and w.get("size", 0) < 8.5
              and w["top"] >= HEADER_TOP and w["text"].strip() not in HEADER_TXT]

    l_idx_sorted = sorted(l_idx, key=lambda w: w["top"])
    r_idx_sorted = sorted(r_idx, key=lambda w: w["top"])

    # sanity: left/right index numbers must match as sets
    l_nums = sorted(int(w["text"]) for w in l_idx_sorted)
    r_nums = sorted(int(w["text"]) for w in r_idx_sorted)
    if l_nums != r_nums:
        anomalies.append(f"p{pno}: LEFT/RIGHT index mismatch left={l_nums} right={r_nums}")

    # group english tokens into lines by top, then assign each line to nearest left index
    l_eng_sorted = sorted(l_eng, key=lambda w: (w["top"], w["x0"]))
    eng_lines = []  # [(top, [tokens])]
    for w in l_eng_sorted:
        if eng_lines and abs(w["top"] - eng_lines[-1][0]) < 2:
            eng_lines[-1][1].append(w)
        else:
            eng_lines.append([w["top"], [w]])
    left_by_index = {}  # index(int) -> english str
    for top, toks in eng_lines:
        if not l_idx_sorted:
            continue
        # nearest left index by top
        best = min(l_idx_sorted, key=lambda ix: abs(ix["top"] - top))
        d = abs(best["top"] - top)
        if d > SPACING * 0.6:
            anomalies.append(f"p{pno}: english line top={top:.1f} nearest index {best['text']} dist={d:.1f} too far")
        # merge tokens: if a token ends with '-' join directly, else space
        s = ""
        for t in toks:
            txt = t["text"]
            if s and s.endswith("-"):
                s += txt
            elif s:
                s += " " + txt
            else:
                s = txt
        idx = int(best["text"])
        if idx in left_by_index:
            # continuation of a wrapped/hyphenated headword from the line above
            if left_by_index[idx].endswith("-"):
                left_by_index[idx] += s
            else:
                left_by_index[idx] += " " + s
        else:
            left_by_index[idx] = s

    # group right meaning tokens into lines by top
    r_mean_sorted = sorted(r_mean, key=lambda w: (w["top"], w["x0"]))
    mean_lines = []
    for w in r_mean_sorted:
        if mean_lines and abs(w["top"] - mean_lines[-1][0]) < 1.6:
            mean_lines[-1][1].append(w)
        else:
            mean_lines.append([w["top"], [w]])

    # assign each meaning line to nearest right index, build senses
    right_by_index = defaultdict(list)  # index -> list of (pos_list, cn_list, has_pos)
    for top, toks in mean_lines:
        if not r_idx_sorted:
            continue
        best = min(r_idx_sorted, key=lambda ix: abs(ix["top"] - top))
        d = abs(best["top"] - top)
        if d > SPACING * 0.6:
            anomalies.append(f"p{pno}: meaning line top={top:.1f} nearest idx {best['text']} dist={d:.1f} too far")
        pos_tokens, cn_tokens = [], []
        for t in toks:
            txt = t["text"].strip()
            if POS_RE.match(txt):
                pos_tokens.append(txt)
            else:
                cn_tokens.append(txt)
        idx = int(best["text"])
        right_by_index[idx].append((top, pos_tokens, cn_tokens))

    # merge: a line with pos starts a new sense; a cn-only line appends to the last sense
    senses_by_index = {}
    for idx, lines in right_by_index.items():
        lines.sort(key=lambda x: x[0])
        senses = []
        for top, pos_toks, cn_toks in lines:
            # cn fragments on the same line are already in x order; the cn column sometimes
            # begins with a fused "pos-of-pos" abbr (det.ord./modal./usage./ord.) before the
            # real gloss — pull that off into the pos field.
            cn_raw = "".join(cn_toks)
            m = re.match(r"^((?:[a-z]{1,8}\.?){1,3})(.*)$", cn_raw, re.S)
            pos_extra = ""
            if m:
                head, rest = m.group(1), m.group(2)
                if head.endswith(".") and re.fullmatch(r"(?:[a-z]{1,8}\.?)+", head):
                    pos_extra = head.rstrip(".")
                    cn_raw = rest
            full_pos = " ".join(pos_toks + ([pos_extra] if pos_extra else []))
            cn = cn_raw
            if pos_toks or pos_extra:
                senses.append({"pos": full_pos, "cn": cn})
            else:
                if senses:
                    senses[-1]["cn"] += cn
                else:
                    senses.append({"pos": "", "cn": cn})
        senses_by_index[idx] = senses

    # combine by index (left/right share the same numbers on the page)
    page_words = []
    for idx in sorted(set(list(left_by_index) + list(senses_by_index))):
        page_words.append({
            "index": idx,
            "english": left_by_index.get(idx, ""),
            "senses": senses_by_index.get(idx, []),
        })
    return page_words


def main():
    all_words = []
    anomalies = []
    with pdfplumber.open(PDF) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            pw = extract_page(page, pno, anomalies)
            all_words.extend(pw)
            if pno % 50 == 0:
                print(f"  page {pno}/{len(pdf.pages)} done, words so far={len(all_words)}", flush=True)

    # dedupe by index just in case (shouldn't happen), keep first
    seen = {}
    for w in all_words:
        seen.setdefault(w["index"], w)
    all_words = sorted(seen.values(), key=lambda w: w["index"])

    # ---- write json ----
    with open("words.json", "w", encoding="utf-8") as f:
        json.dump(all_words, f, ensure_ascii=False, indent=1)

    # ---- write csv (flat, one row per sense) ----
    with open("words.csv", "w", encoding="utf-8", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["index", "english", "pos", "cn"])
        for w in all_words:
            if not w["senses"]:
                wr.writerow([w["index"], w["english"], "", ""])
            for s in w["senses"]:
                wr.writerow([w["index"], w["english"], s["pos"], s["cn"]])

    # ---- report ----
    lines = []
    lines.append(f"TOTAL WORDS: {len(all_words)}")
    idxs = [w["index"] for w in all_words]
    lines.append(f"index range: {min(idxs)}..{max(idxs)}")
    # gaps
    full = set(range(min(idxs), max(idxs) + 1))
    missing = sorted(full - set(idxs))
    lines.append(f"missing indices (gaps): {len(missing)}  {missing[:20]}")
    dup_src = len(all_words) != len(set(idxs))
    # field completeness
    no_eng = [w["index"] for w in all_words if not w["english"]]
    no_sense = [w["index"] for w in all_words if not w["senses"]]
    empty_cn = [w["index"] for w in all_words if w["senses"] and any(not s["cn"] for s in w["senses"])]
    empty_pos = [w["index"] for w in all_words if w["senses"] and any(not s["pos"] for s in w["senses"])]
    lines.append(f"words missing english: {len(no_eng)}  {no_eng[:20]}")
    lines.append(f"words missing senses:  {len(no_sense)}  {no_sense[:20]}")
    lines.append(f"senses with empty cn:  {len(empty_cn)}  {empty_cn[:20]}")
    lines.append(f"senses with empty pos: {len(empty_pos)}  {empty_pos[:20]}")
    # english sanity: should be ascii letters/spaces/hyphens mostly
    bad_eng = [(w["index"], w["english"]) for w in all_words if not re.fullmatch(r"[A-Za-z][A-Za-z\- ]*", w["english"])]
    lines.append(f"english with non-ascii/unexpected chars: {len(bad_eng)}  {bad_eng[:20]}")
    lines.append(f"\nANOMALIES ({len(anomalies)}):")
    lines.extend("  " + a for a in anomalies[:80])
    # spot checks
    lines.append("\nSPOT CHECKS:")
    by_index = {w["index"]: w for w in all_words}
    for i in [1, 4, 8, 9, 1997, 6550]:
        w = by_index.get(i)
        if w:
            lines.append(f"  {i}: english={w['english']!r}")
            for s in w["senses"]:
                lines.append(f"       {s['pos']:8} {s['cn']}")
    # sense-count distribution
    from collections import Counter
    dist = Counter(len(w["senses"]) for w in all_words)
    lines.append(f"\nsense-count distribution: {dict(sorted(dist.items()))}")

    rep = "\n".join(lines)
    with open("report.txt", "w", encoding="utf-8") as f:
        f.write(rep)
    print(rep)
    print("\n=> wrote words.json, words.csv, report.txt")


if __name__ == "__main__":
    main()
