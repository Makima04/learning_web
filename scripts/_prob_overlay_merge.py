#!/usr/bin/env python3
"""把 /tmp/prob_overlay/*.tsv 并入 math_item_overlay.json，并回写两本目录。"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path("/Users/makima/program/web/english_web")
OVERLAY_PATH = ROOT / "scripts" / "math_item_overlay.json"
PUB = ROOT / "frontend" / "public" / "math"
TSV_DIR = Path("/tmp/prob_overlay")
BATCH_DIR = Path("/tmp/prob_batches")

EXPECTED = {
    "base": 36,
    "rv": 80,
    "multi": 82,
    "num": 90,
    "limit": 13,
    "stat": 35,
    "est-hyp": 62,
}


def parse_tsv(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.lower().startswith("id\t"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            raise ValueError(f"{path.name}: bad row {line!r}")
        qid = parts[0].strip()
        kps = [x.strip() for x in parts[1].split(",") if x.strip()]
        facets = [x.strip() for x in (parts[2] if len(parts) > 2 else "").split(",") if x.strip()]
        if not qid or not kps:
            raise ValueError(f"{path.name}: missing id/kp {line!r}")
        out[qid] = {"kp_ids": kps, "facets": facets}
    return out


def collect(require_complete: bool = True) -> tuple[dict[str, dict], list[str]]:
    rows: dict[str, dict] = {}
    problems: list[str] = []
    for batch, n in EXPECTED.items():
        path = TSV_DIR / f"{batch}.tsv"
        if not path.exists():
            problems.append(f"MISSING {batch}.tsv")
            continue
        parsed = parse_tsv(path)
        exp = [q["id"] for q in json.loads((BATCH_DIR / f"{batch}.json").read_text(encoding="utf-8"))]
        missing = [i for i in exp if i not in parsed]
        extra = [i for i in parsed if i not in set(exp)]
        if len(parsed) != n:
            problems.append(f"{batch}: got {len(parsed)} want {n}")
        if missing:
            problems.append(f"{batch}: missing {len(missing)} e.g. {missing[:3]}")
        if extra:
            problems.append(f"{batch}: extra {len(extra)} e.g. {extra[:3]}")
        overlap = set(rows) & set(parsed)
        if overlap:
            problems.append(f"{batch}: duplicate {sorted(overlap)[:5]}")
        rows.update(parsed)
    if require_complete and problems:
        raise SystemExit("overlay incomplete:\n  " + "\n  ".join(problems))
    return rows, problems


def patch_catalog(path: Path, rows: dict[str, dict]) -> int:
    items = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for q in items:
        ov = rows.get(q["id"])
        if not ov:
            continue
        q["kp_ids"] = list(ov["kp_ids"])
        if ov.get("facets"):
            q["facets"] = list(ov["facets"])
        elif "facets" in q:
            del q["facets"]
        n += 1
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return n


def main() -> None:
    dry = "--status" in sys.argv
    rows, problems = collect(require_complete=not dry)
    if dry:
        print("problems:")
        for p in problems or ["(none)"]:
            print(" ", p)
        print("parsed rows", len(rows))
        kp = Counter(v["kp_ids"][0] for v in rows.values())
        print("primary kp:")
        for k, c in kp.most_common():
            print(f"  {k}: {c}")
        fac = Counter(f for v in rows.values() for f in v.get("facets") or [])
        print("facets:")
        for k, c in fac.most_common(40):
            print(f"  {k}: {c}")
        return

    overlay = json.loads(OVERLAY_PATH.read_text(encoding="utf-8")) if OVERLAY_PATH.exists() else {}
    overlay.update(rows)
    OVERLAY_PATH.write_text(json.dumps(overlay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n_ll = patch_catalog(PUB / "lilin880.json", rows)
    n_zy = patch_catalog(PUB / "zhangyu1000.json", rows)
    kp = Counter(v["kp_ids"][0] for v in rows.values())
    print(f"overlay {len(overlay)} (+{len(rows)} prob)")
    print(f"patched lilin {n_ll} zhangyu {n_zy}")
    print("primary kp:")
    for k, c in kp.most_common():
        print(f"  {k}: {c}")


if __name__ == "__main__":
    main()
