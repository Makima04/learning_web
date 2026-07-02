#!/usr/bin/env python3
# probe_year.py — dump raw structure for a given year to diagnose parse issues.
import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
from parse_paper import extract_pages, join_pages, split_top_sections, normalize_option_brackets

pdf = sys.argv[1]
section = sys.argv[2] if len(sys.argv) > 2 else None  # e.g. "I", "II", "II.A", "II.B"

pages = extract_pages(pdf)
full = join_pages(pages)
secs = split_top_sections(full)
sec_map = {r: b for r, b in secs}

if section is None:
    print("=== TOP-LEVEL SECTIONS ===")
    for r, b in secs:
        print(f"--- Section {r} (len={len(b)}) ---")
        print(b[:600])
        print("...")
        print()
    sys.exit(0)

if "." in section:
    roman, part = section.split(".", 1)
    body = sec_map.get(roman, "")
    # split parts
    from parse_paper import PART_RE
    parts = {}
    cur = None
    buf = []
    for ln in body.split("\n"):
        m = PART_RE.match(ln)
        if m:
            if cur: parts[cur] = "\n".join(buf)
            cur = m.group(1); buf = []
        elif cur is not None:
            buf.append(ln)
    if cur: parts[cur] = "\n".join(buf)
    print(f"=== Section {roman} Part {part} ===")
    print(parts.get(part, "<MISSING>")[:3000])
else:
    print(f"=== Section {section} ===")
    print(sec_map.get(section, "<MISSING>")[:3000])
