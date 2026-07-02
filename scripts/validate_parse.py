#!/usr/bin/env python3
# validate_parse.py — 跑全部年份 PDF，按预期题量校验，报告偏差。
import sys, json, subprocess, glob, os
sys.path.insert(0, os.path.dirname(__file__))
from parse_paper import parse_paper, guess_year, section_summary

EXPECTED = {
    "use_of_english": {"items": 20, "opts_per": 4},
    "reading_a": {"texts": 4, "items_per_text": 5, "opts_per": 4},
    "reading_b": {"gaps": 5},
    "translation": {"segments": 5},
    "writing": {"parts": [51, 52]},
}

def check(data):
    issues = []
    secs = {s["type"]: s for s in data["sections"]}
    # use_of_english
    u = secs.get("use_of_english")
    if not u:
        issues.append("MISSING use_of_english")
    else:
        items = u.get("items", [])
        if len(items) != 20:
            issues.append(f"uoe items={len(items)}(expect 20)")
        bad4 = [it["n"] for it in items if len(it.get("options", {})) != 4]
        if bad4:
            issues.append(f"uoe not-4-opt: {bad4}")
        if not u.get("passage", "").strip():
            issues.append("uoe EMPTY passage")
    # reading_a
    r = secs.get("reading_a")
    if not r:
        issues.append("MISSING reading_a")
    else:
        ps = r.get("passages", [])
        if len(ps) != 4:
            issues.append(f"ra texts={len(ps)}(expect 4)")
        for p in ps:
            its = p.get("items", [])
            if len(its) != 5:
                issues.append(f"ra {p['label']} items={len(its)}(expect 5)")
            bad4 = [it["n"] for it in its if len(it.get("options", {})) != 4]
            if bad4:
                issues.append(f"ra {p['label']} not-4-opt: {bad4}")
            if not p.get("body", "").strip():
                issues.append(f"ra {p['label']} EMPTY body")
    # reading_b
    b = secs.get("reading_b")
    if not b:
        issues.append("MISSING reading_b")
    else:
        if len(b.get("gaps", [])) != 5:
            issues.append(f"rb gaps={b.get('gaps')}(expect 5)")
        if not b.get("options"):
            issues.append("rb EMPTY options")
    # translation
    t = secs.get("translation")
    if not t:
        issues.append("MISSING translation")
    else:
        if len(t.get("segments", [])) != 5:
            issues.append(f"tr segments={len(t.get('segments',[]))}(expect 5)")
        if not t.get("passage", "").strip():
            issues.append("tr EMPTY passage")
    # writing
    w = secs.get("writing")
    if not w:
        issues.append("MISSING writing")
    else:
        ns = [p["n"] for p in w.get("parts", [])]
        if ns != [51, 52]:
            issues.append(f"wr parts={ns}(expect [51,52])")
    return issues

def main():
    pdfs = sorted(glob.glob("papers/*.pdf"))
    print(f"Found {len(pdfs)} PDFs")
    all_bad = 0
    for pdf in pdfs:
        try:
            data = parse_paper(pdf)
            data["year"] = guess_year(pdf, data)
        except Exception as e:
            print(f"\n=== {os.path.basename(pdf)} CRASH: {e}")
            all_bad += 1
            continue
        issues = check(data)
        yr = data.get("year")
        tag = "OK " if not issues else "BAD"
        if issues:
            all_bad += 1
        print(f"{tag} {yr} {os.path.basename(pdf)}: {'; '.join(issues) if issues else 'all sections nominal'}")
    print(f"\n{all_bad}/{len(pdfs)} papers with issues")

if __name__ == "__main__":
    main()
