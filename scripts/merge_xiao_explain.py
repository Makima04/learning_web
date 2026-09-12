#!/usr/bin/env python3
"""把各科 *.explain.json 合并进 {subject}.kp.json 和 frontend/public/politics/xiao1000.kp.json。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "papers" / "politics" / "xiao1000"
PUBLIC = ROOT / "frontend" / "public" / "politics" / "xiao1000.kp.json"

SUBJECTS = ["marx", "mao", "xi", "history", "moral"]
PATCH_FILES = {
    "marx": ["marx.explain.json"],
    "mao": ["mao.explain.json"],
    "xi": ["xi.explain.a.json", "xi.explain.b.json", "xi.explain.json"],
    "history": ["history.explain.json"],
    "moral": ["moral.explain.json"],
}


def load_json(path: Path):
    return json.loads(path.read_text())


def dump_indent(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def dump_compact(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def load_patches(subject: str) -> dict:
    merged: dict = {}
    for name in PATCH_FILES[subject]:
        path = SRC / name
        if not path.exists():
            continue
        data = load_json(path)
        if not isinstance(data, dict):
            raise SystemExit(f"{path} 必须是 {{id: payload}} 对象")
        merged.update(data)
    return merged


def validate_payload(kp_id: str, payload: dict) -> list[str]:
    errors = []
    explain = payload.get("explain")
    checks = payload.get("checks")
    if not isinstance(explain, list) or len(explain) < 3:
        errors.append(f"{kp_id}: explain 少于 3 段")
    else:
        for i, sec in enumerate(explain):
            if not isinstance(sec, dict) or not str(sec.get("title") or "").strip() or not str(sec.get("body") or "").strip():
                errors.append(f"{kp_id}: explain[{i}] 缺 title/body")
    if not isinstance(checks, list) or len(checks) < 3:
        errors.append(f"{kp_id}: checks 少于 3 题")
    else:
        answers = []
        for i, c in enumerate(checks):
            if not isinstance(c, dict) or not str(c.get("prompt") or "").strip() or not isinstance(c.get("answer"), bool):
                errors.append(f"{kp_id}: checks[{i}] 缺 prompt/boolean answer")
            else:
                answers.append(c["answer"])
        if answers and (all(answers) or not any(answers)):
            errors.append(f"{kp_id}: checks 不要全对或全错")
    return errors


def main() -> int:
    errors: list[str] = []
    missing: list[str] = []
    patched = 0
    public = load_json(PUBLIC)
    public_by_id = {k["id"]: i for i, k in enumerate(public)}

    for subject in SUBJECTS:
        kp_path = SRC / f"{subject}.kp.json"
        kps = load_json(kp_path)
        patches = load_patches(subject)
        for kp in kps:
            kid = kp["id"]
            payload = patches.get(kid)
            if payload is None:
                if kp.get("explain") and kp.get("checks"):
                    continue
                missing.append(kid)
                continue
            errors.extend(validate_payload(kid, payload))
            for field in ("explain", "checks", "summary", "bullets", "confusions"):
                if field in payload:
                    kp[field] = payload[field]
            patched += 1
            if kid in public_by_id:
                pub = public[public_by_id[kid]]
                for field in ("explain", "checks", "summary", "bullets", "confusions"):
                    if field in kp:
                        pub[field] = kp[field]
        dump_indent(kp_path, kps)

    dump_compact(PUBLIC, public)

    print(f"merged patches into {patched} cards")
    print(f"public cards: {len(public)}")
    if missing:
        print(f"MISSING {len(missing)}")
        for kid in missing:
            print("  ", kid)
    if errors:
        print(f"WARN {len(errors)}")
        for e in errors[:40]:
            print("  ", e)
        if len(errors) > 40:
            print(f"  ... {len(errors) - 40} more")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
